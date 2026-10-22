package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/indexer"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/query"
)

var quiet = slog.New(slog.NewJSONHandler(io.Discard, nil))

type fakeIndexer struct {
	outcome  indexer.Outcome
	bulk     indexer.BulkResult
	err      error
	upserted []catalog.Product
	deleted  []string
	versions []int64
	bulked   []catalog.Product
}

func (f *fakeIndexer) Upsert(_ context.Context, p catalog.Product) (indexer.Outcome, error) {
	f.upserted = append(f.upserted, p)
	return f.outcome, f.err
}

func (f *fakeIndexer) Delete(_ context.Context, id string, version int64) (indexer.Outcome, error) {
	f.deleted = append(f.deleted, id)
	f.versions = append(f.versions, version)
	return f.outcome, f.err
}

func (f *fakeIndexer) Bulk(_ context.Context, ps []catalog.Product) (indexer.BulkResult, error) {
	f.bulked = ps
	return f.bulk, f.err
}

type fakeSearcher struct {
	result query.Result
	err    error
	got    query.Params
}

func (f *fakeSearcher) Search(_ context.Context, p query.Params) (query.Result, error) {
	f.got = p
	return f.result, f.err
}

// do sends one request to a server built from deps and returns the recorder.
func do(t *testing.T, deps Deps, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	NewServer(deps, quiet).ServeHTTP(rec, req)
	return rec
}

func errorOf(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var b struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &b); err != nil || b.Error == "" {
		t.Fatalf("not an error body: %s", rec.Body)
	}
	return b.Error
}

func validProduct(id string) catalog.Product {
	return catalog.Product{
		ID: id, SKU: "SKU-" + id, Name: "Phone", Description: "d", Category: "electronics",
		Brand: "Acme", PriceCents: 10000, Currency: "EGP", Stock: 1,
		CreatedAt: "2026-10-20T09:00:00Z", UpdatedAt: "2026-10-21T10:00:00Z",
	}
}

func jsonOf(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

var unavailable = fmt.Errorf("x: %w", osclient.ErrUnavailable)

func TestHealthz(t *testing.T) {
	rec := do(t, Deps{}, http.MethodGet, "/healthz", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d", rec.Code)
	}
	if got := strings.TrimSpace(rec.Body.String()); got != `{"status":"ok"}` {
		t.Fatalf("body %s", got)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content-type %q", ct)
	}
}

func TestReadyz(t *testing.T) {
	ok := Deps{Ready: func(context.Context) error { return nil }}
	if rec := do(t, ok, http.MethodGet, "/readyz", ""); rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"status":"ok"}` {
		t.Fatalf("ready: %d %s", rec.Code, rec.Body)
	}
	down := Deps{Ready: func(context.Context) error { return index.ErrAliasMissing }}
	rec := do(t, down, http.MethodGet, "/readyz", "")
	var b map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &b)
	if rec.Code != 503 || b["status"] != "error" || b["error"] == "" {
		t.Fatalf("not ready: %d %s", rec.Code, rec.Body)
	}
}

func TestSearch(t *testing.T) {
	s := &fakeSearcher{result: query.Result{
		Hits:  []catalog.Product{validProduct("a")},
		Total: 1,
		Facets: query.Facets{
			Category: []query.Bucket{{Key: "electronics", Count: 1}},
			Brand:    []query.Bucket{{Key: "Acme", Count: 1}},
			Price:    []query.PriceBucket{{Key: "*-10000", Count: 0, To: new(10000)}},
		},
	}}
	rec := do(t, Deps{Searcher: s}, http.MethodGet, "/search?q=phone&minPrice=100", "")
	if rec.Code != 200 {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if s.got.Q != "phone" || s.got.MinPrice == nil || *s.got.MinPrice != 100 {
		t.Fatalf("params %+v", s.got)
	}
	var got map[string]json.RawMessage
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	for _, k := range []string{"hits", "total", "facets"} {
		if _, ok := got[k]; !ok {
			t.Errorf("missing %s in %s", k, rec.Body)
		}
	}
	if !strings.Contains(rec.Body.String(), `"price":[{"key":"*-10000","count":0,"to":10000}]`) {
		t.Errorf("facets %s", rec.Body)
	}
}

func TestSearchErrors(t *testing.T) {
	tests := []struct {
		name   string
		path   string
		err    error
		status int
	}{
		{"bad params", "/search?size=101", nil, 400},
		{"opensearch unavailable", "/search?q=x", unavailable, 503},
		{"alias missing", "/search?q=x", fmt.Errorf("x: %w", index.ErrAliasMissing), 503},
		{"anything else", "/search?q=x", errors.New("boom"), 500},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, Deps{Searcher: &fakeSearcher{err: tt.err}}, http.MethodGet, tt.path, "")
			if rec.Code != tt.status {
				t.Fatalf("status %d, want %d: %s", rec.Code, tt.status, rec.Body)
			}
			errorOf(t, rec)
		})
	}
}

func TestSearchDoesNotEscapeHTML(t *testing.T) {
	p := validProduct("a")
	p.Name = "Pots & Pans <XL>"
	rec := do(t, Deps{Searcher: &fakeSearcher{result: query.Result{Hits: []catalog.Product{p}}}}, http.MethodGet, "/search", "")
	if !strings.Contains(rec.Body.String(), `"name":"Pots & Pans <XL>"`) {
		t.Fatalf("body %s", rec.Body)
	}
}

func TestPutProduct(t *testing.T) {
	x := &fakeIndexer{outcome: indexer.Indexed}
	rec := do(t, Deps{Indexer: x}, http.MethodPut, "/products/a", jsonOf(t, validProduct("a")))
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"result":"indexed"}` {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if len(x.upserted) != 1 || x.upserted[0] != validProduct("a") {
		t.Fatalf("upserted %+v", x.upserted)
	}

	x = &fakeIndexer{outcome: indexer.Skipped}
	if rec := do(t, Deps{Indexer: x}, http.MethodPut, "/products/a", jsonOf(t, validProduct("a"))); strings.TrimSpace(rec.Body.String()) != `{"result":"skipped"}` {
		t.Fatalf("skipped: %s", rec.Body)
	}
}

func TestPutProductErrors(t *testing.T) {
	invalid := validProduct("a")
	invalid.Name = ""
	tests := []struct {
		name   string
		path   string
		body   string
		err    error
		status int
		says   string
	}{
		{"path and body ids differ", "/products/b", jsonOf(t, validProduct("a")), nil, 400, "id"},
		{"invalid product", "/products/a", jsonOf(t, invalid), nil, 400, "name"},
		{"malformed JSON", "/products/a", `{"id":`, nil, 400, ""},
		{"body over 1 MB", "/products/a", `{"description":"` + strings.Repeat("x", 1<<20) + `"}`, nil, 413, ""},
		{"opensearch unavailable", "/products/a", jsonOf(t, validProduct("a")), unavailable, 503, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			x := &fakeIndexer{err: tt.err}
			rec := do(t, Deps{Indexer: x}, http.MethodPut, tt.path, tt.body)
			if rec.Code != tt.status {
				t.Fatalf("status %d, want %d: %s", rec.Code, tt.status, rec.Body)
			}
			if msg := errorOf(t, rec); !strings.Contains(msg, tt.says) {
				t.Fatalf("error %q does not mention %q", msg, tt.says)
			}
			if tt.status == 400 && len(x.upserted) != 0 {
				t.Fatal("a rejected request must not reach the indexer")
			}
		})
	}
}

func TestDeleteProduct(t *testing.T) {
	for _, outcome := range []indexer.Outcome{indexer.Deleted, indexer.Skipped} {
		x := &fakeIndexer{outcome: outcome}
		rec := do(t, Deps{Indexer: x}, http.MethodDelete, "/products/a?version=1792576800123", "")
		if rec.Code != 204 || rec.Body.Len() != 0 || len(x.deleted) != 1 || x.deleted[0] != "a" {
			t.Fatalf("%s: got %d %q %v", outcome, rec.Code, rec.Body, x.deleted)
		}
	}
	if rec := do(t, Deps{Indexer: &fakeIndexer{err: unavailable}}, http.MethodDelete, "/products/a?version=1", ""); rec.Code != 503 {
		t.Fatalf("unavailable: %d", rec.Code)
	}
}

func TestDeleteRequiresVersion(t *testing.T) {
	for _, q := range []string{"", "?version=", "?version=abc", "?version=0", "?version=-1", "?version=1.5", "?version=99999999999999999999"} {
		t.Run(q, func(t *testing.T) {
			x := &fakeIndexer{}
			rec := do(t, Deps{Indexer: x}, http.MethodDelete, "/products/a"+q, "")
			if rec.Code != 400 || errorOf(t, rec) != "version must be a positive integer (ms)" {
				t.Fatalf("got %d %s", rec.Code, rec.Body)
			}
			if len(x.deleted) != 0 {
				t.Fatal("a rejected request must not reach the indexer")
			}
		})
	}
	x := &fakeIndexer{outcome: indexer.Deleted}
	rec := do(t, Deps{Indexer: x}, http.MethodDelete, "/products/a?version=1792576800123", "")
	if rec.Code != 204 || len(x.versions) != 1 || x.versions[0] != 1792576800123 {
		t.Fatalf("got %d, versions %v", rec.Code, x.versions)
	}
}

func TestBulk(t *testing.T) {
	x := &fakeIndexer{bulk: indexer.BulkResult{Indexed: 1, Skipped: 0, Failed: []indexer.Failure{{ID: "b", Status: 400, Reason: "name is required"}}}}
	body := jsonOf(t, map[string]any{"products": []catalog.Product{validProduct("a"), validProduct("b")}})
	rec := do(t, Deps{Indexer: x}, http.MethodPost, "/products/_bulk", body)
	want := `{"indexed":1,"skipped":0,"failed":[{"id":"b","status":400,"reason":"name is required"}]}`
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != want {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if len(x.bulked) != 2 {
		t.Fatalf("bulked %d", len(x.bulked))
	}
}

// Review finding: a missing number used to be indexed as 0, and one wrongly
// typed field used to reject the whole batch. Each bad item is reported on
// its own instead.
func TestBulkReportsUndecodableItemsPerItem(t *testing.T) {
	x := &fakeIndexer{bulk: indexer.BulkResult{Indexed: 1, Failed: []indexer.Failure{}}}
	good := jsonOf(t, validProduct("a"))
	noPrice := `{"id":"b","sku":"s","name":"n","category":"c","brand":"b","currency":"EGP","stock":1,"createdAt":"2026-10-20T09:00:00Z","updatedAt":"2026-10-21T10:00:00Z"}`
	badStock := `{"id":"c","sku":"s","name":"n","category":"c","brand":"b","currency":"EGP","priceCents":1,"stock":"5","createdAt":"2026-10-20T09:00:00Z","updatedAt":"2026-10-21T10:00:00Z"}`
	rec := do(t, Deps{Indexer: x}, http.MethodPost, "/products/_bulk", `{"products":[`+good+`,`+noPrice+`,`+badStock+`]}`)
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if len(x.bulked) != 1 || x.bulked[0].ID != "a" {
		t.Fatalf("only the good product should reach the indexer: %+v", x.bulked)
	}
	var got indexer.BulkResult
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Indexed != 1 || len(got.Failed) != 2 {
		t.Fatalf("got %+v", got)
	}
	byID := map[string]indexer.Failure{}
	for _, f := range got.Failed {
		byID[f.ID] = f
	}
	if f := byID["b"]; f.Status != 400 || !strings.Contains(f.Reason, "priceCents") {
		t.Errorf("missing price: %+v", f)
	}
	if f := byID["c"]; f.Status != 400 || !strings.Contains(f.Reason, "stock") {
		t.Errorf("wrongly typed stock: %+v", f)
	}
}

func TestPutProductRequiresNumbers(t *testing.T) {
	x := &fakeIndexer{}
	body := `{"id":"a","sku":"s","name":"n","category":"c","brand":"b","currency":"EGP","createdAt":"2026-10-20T09:00:00Z","updatedAt":"2026-10-21T10:00:00Z"}`
	rec := do(t, Deps{Indexer: x}, http.MethodPut, "/products/a", body)
	if rec.Code != 400 || len(x.upserted) != 0 {
		t.Fatalf("status %d, upserted %d", rec.Code, len(x.upserted))
	}
	if msg := errorOf(t, rec); !strings.Contains(msg, "priceCents") || !strings.Contains(msg, "stock") {
		t.Fatalf("error %q", msg)
	}
}

func TestBulkEmpty(t *testing.T) {
	x := &fakeIndexer{bulk: indexer.BulkResult{Failed: []indexer.Failure{}}}
	rec := do(t, Deps{Indexer: x}, http.MethodPost, "/products/_bulk", `{"products":[]}`)
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"indexed":0,"skipped":0,"failed":[]}` {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
}

func TestBulkErrors(t *testing.T) {
	many := make([]catalog.Product, 1001)
	for i := range many {
		many[i] = validProduct(fmt.Sprint(i))
	}
	tests := []struct {
		name   string
		body   string
		err    error
		status int
	}{
		{"malformed", `{"products":[`, nil, 400},
		{"products missing", `{}`, nil, 400},
		{"products not a list", `{"products":{}}`, nil, 400},
		{"over 1000 products", jsonOf(t, map[string]any{"products": many}), nil, 400},
		{"body over 10 MB", `{"products":[{"description":"` + strings.Repeat("x", 10<<20) + `"}]}`, nil, 413},
		{"opensearch unavailable", `{"products":[]}`, unavailable, 503},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := do(t, Deps{Indexer: &fakeIndexer{err: tt.err}}, http.MethodPost, "/products/_bulk", tt.body)
			if rec.Code != tt.status {
				t.Fatalf("status %d, want %d: %s", rec.Code, tt.status, rec.Body)
			}
			errorOf(t, rec)
		})
	}
}

func TestRouting(t *testing.T) {
	if rec := do(t, Deps{}, http.MethodGet, "/products/a", ""); rec.Code != 405 {
		t.Fatalf("GET /products/a: %d, want 405", rec.Code)
	}
	// The literal _bulk route and the {id} route must not shadow each other.
	x := &fakeIndexer{}
	if rec := do(t, Deps{Indexer: x}, http.MethodPut, "/products/_bulk", jsonOf(t, validProduct("_bulk"))); rec.Code != 200 || len(x.upserted) != 1 {
		t.Fatalf("PUT /products/_bulk should be an upsert of id _bulk: %d", rec.Code)
	}
}

func TestClientDisconnectIsNotAnError(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodGet, "/search", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	NewServer(Deps{Searcher: &fakeSearcher{err: fmt.Errorf("search: %w", context.Canceled)}}, quiet).ServeHTTP(rec, req)
	if rec.Code == 500 {
		t.Fatalf("a client disconnect must not be logged or answered as a 500: %d %s", rec.Code, rec.Body)
	}
}

func TestSampleProductsAreValid(t *testing.T) {
	raw, err := os.ReadFile("../../testdata/sample-products.json")
	if err != nil {
		t.Fatal(err)
	}
	var b struct {
		Products []catalog.Product `json:"products"`
	}
	if err := json.Unmarshal(raw, &b); err != nil {
		t.Fatal(err)
	}
	if len(b.Products) != 30 {
		t.Fatalf("got %d products, want 30", len(b.Products))
	}
	for _, p := range b.Products {
		if err := p.Validate(); err != nil {
			t.Errorf("%s: %v", p.ID, err)
		}
	}
}
