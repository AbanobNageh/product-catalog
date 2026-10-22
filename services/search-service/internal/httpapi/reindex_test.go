package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/indexer"
)

type fakeReindexer struct {
	build  string
	bulk   indexer.BulkResult
	err    error
	calls  []string
	bulked []catalog.Product
}

func (f *fakeReindexer) Start(context.Context) (string, error) {
	f.calls = append(f.calls, "start")
	return f.build, f.err
}

func (f *fakeReindexer) Bulk(_ context.Context, build string, ps []catalog.Product) (indexer.BulkResult, error) {
	f.calls = append(f.calls, "bulk:"+build)
	f.bulked = ps
	return f.bulk, f.err
}

func (f *fakeReindexer) Finish(_ context.Context, build string) error {
	f.calls = append(f.calls, "finish:"+build)
	return f.err
}

func (f *fakeReindexer) Abort(_ context.Context, build string) error {
	f.calls = append(f.calls, "abort:"+build)
	return f.err
}

var (
	running = fmt.Errorf("start: %w", index.ErrBuildRunning)
	gone    = fmt.Errorf("x: %w", index.ErrBuildGone)
)

func TestReindexEndpoints(t *testing.T) {
	okBulk := indexer.BulkResult{Indexed: 1, Failed: []indexer.Failure{}}
	prod := jsonOf(t, validProduct("a"))
	tests := []struct {
		name   string
		path   string
		body   string
		err    error
		status int
		body2  string // expected response body, when non-empty
		call   string // expected single fake call, "" = none
	}{
		{"start", "/reindex/start", "", nil, 201, `{"build":"products-v2"}`, "start"},
		{"start while running", "/reindex/start", "", running, 409, `{"error":"a reindex is already running"}`, "start"},
		{"start, opensearch down", "/reindex/start", "", unavailable, 503, "", "start"},
		{"start, anything else", "/reindex/start", "", errors.New("boom"), 500, "", "start"},

		{"bulk", "/reindex/_bulk", `{"build":"products-v2","products":[` + prod + `]}`, nil, 200, `{"indexed":1,"skipped":0,"failed":[]}`, "bulk:products-v2"},
		{"bulk, build gone", "/reindex/_bulk", `{"build":"products-v2","products":[]}`, gone, 409, `{"error":"the reindex build was aborted or replaced"}`, "bulk:products-v2"},
		{"bulk, missing build", "/reindex/_bulk", `{"products":[]}`, nil, 400, "", ""},
		{"bulk, empty build", "/reindex/_bulk", `{"build":"","products":[]}`, nil, 400, "", ""},
		{"bulk, products missing", "/reindex/_bulk", `{"build":"products-v2"}`, nil, 400, "", ""},
		{"bulk, malformed", "/reindex/_bulk", `{"build":`, nil, 400, "", ""},
		{"bulk, over 10 MB", "/reindex/_bulk", `{"build":"b","products":[{"description":"` + strings.Repeat("x", 10<<20) + `"}]}`, nil, 413, "", ""},
		{"bulk, opensearch down", "/reindex/_bulk", `{"build":"products-v2","products":[]}`, unavailable, 503, "", "bulk:products-v2"},

		{"finish", "/reindex/finish", `{"build":"products-v2"}`, nil, 204, "", "finish:products-v2"},
		{"finish, build gone", "/reindex/finish", `{"build":"products-v2"}`, gone, 409, "", "finish:products-v2"},
		{"finish, missing build", "/reindex/finish", `{}`, nil, 400, "", ""},
		{"finish, empty build", "/reindex/finish", `{"build":""}`, nil, 400, "", ""},
		{"finish, malformed", "/reindex/finish", `nope`, nil, 400, "", ""},
		{"finish, anything else", "/reindex/finish", `{"build":"products-v2"}`, errors.New("boom"), 500, "", "finish:products-v2"},

		{"abort", "/reindex/abort", `{"build":"products-v2"}`, nil, 204, "", "abort:products-v2"},
		{"abort, build gone is still 204", "/reindex/abort", `{"build":"products-v2"}`, gone, 204, "", "abort:products-v2"},
		{"abort, missing build", "/reindex/abort", `{}`, nil, 400, "", ""},
		{"abort, empty build", "/reindex/abort", `{"build":""}`, nil, 400, "", ""},
		{"abort, opensearch down", "/reindex/abort", `{"build":"products-v2"}`, unavailable, 503, "", "abort:products-v2"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := &fakeReindexer{build: "products-v2", bulk: okBulk, err: tt.err}
			rec := do(t, Deps{Reindexer: f}, http.MethodPost, tt.path, tt.body)
			if rec.Code != tt.status {
				t.Fatalf("status %d, want %d: %s", rec.Code, tt.status, rec.Body)
			}
			if tt.body2 != "" && strings.TrimSpace(rec.Body.String()) != tt.body2 {
				t.Fatalf("body %s, want %s", rec.Body, tt.body2)
			}
			if tt.status >= 400 {
				errorOf(t, rec)
			}
			if tt.status == 204 && rec.Body.Len() != 0 {
				t.Fatalf("204 with body %q", rec.Body)
			}
			var want []string
			if tt.call != "" {
				want = []string{tt.call}
			}
			if strings.Join(f.calls, ",") != strings.Join(want, ",") {
				t.Fatalf("calls %v, want %v", f.calls, want)
			}
		})
	}
}

func TestReindexBulkReusesItemDecoding(t *testing.T) {
	f := &fakeReindexer{bulk: indexer.BulkResult{Indexed: 1, Failed: []indexer.Failure{}}}
	good := jsonOf(t, validProduct("a"))
	noPrice := `{"id":"b","sku":"s","name":"n","category":"c","brand":"b","currency":"EGP","stock":1,"createdAt":"2026-10-20T09:00:00Z","updatedAt":"2026-10-21T10:00:00Z"}`
	rec := do(t, Deps{Reindexer: f}, http.MethodPost, "/reindex/_bulk", `{"build":"products-v2","products":[`+good+`,`+noPrice+`]}`)
	if rec.Code != 200 {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if len(f.bulked) != 1 || f.bulked[0].ID != "a" {
		t.Fatalf("only the good product should reach the reindexer: %+v", f.bulked)
	}
	var got indexer.BulkResult
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.Failed) != 1 || got.Failed[0].ID != "b" || got.Failed[0].Status != 400 || !strings.Contains(got.Failed[0].Reason, "priceCents") {
		t.Fatalf("failed %+v", got.Failed)
	}
}

func TestReindexBulkLimitsProducts(t *testing.T) {
	many := make([]catalog.Product, 1001)
	for i := range many {
		many[i] = validProduct(fmt.Sprint(i))
	}
	f := &fakeReindexer{}
	rec := do(t, Deps{Reindexer: f}, http.MethodPost, "/reindex/_bulk", jsonOf(t, map[string]any{"build": "b", "products": many}))
	if rec.Code != 400 || len(f.calls) != 0 {
		t.Fatalf("got %d, calls %v", rec.Code, f.calls)
	}
}
