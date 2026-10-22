package indexer

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

func product(id string) catalog.Product {
	return catalog.Product{
		ID: id, SKU: "SKU-" + id, Name: "Phone " + id, Description: "d",
		Category: "electronics", Brand: "Acme", PriceCents: 10000, Currency: "EGP",
		Stock: 1, CreatedAt: "2026-10-20T09:00:00Z", UpdatedAt: "2026-10-21T10:00:00.123Z",
	}
}

func item(id string, status int, errType string) opensearchapi.BulkItem {
	it := &opensearchapi.BulkRespItem{ID: &id, Status: status}
	if errType != "" {
		reason := errType + " reason"
		it.Error = &opensearchapi.ErrorCause{Type: errType, Reason: &reason}
	}
	return opensearchapi.BulkItem{Index: it}
}

func TestParseBulkItems(t *testing.T) {
	got, err := ParseBulkItems([]opensearchapi.BulkItem{
		item("a", 201, ""),
		item("b", 200, ""),
		item("c", 409, "version_conflict_engine_exception"),
		item("d", 400, "mapper_parsing_exception"),
	})
	if err != nil {
		t.Fatalf("ParseBulkItems: %v", err)
	}
	want := BulkResult{Indexed: 2, Skipped: 1, Failed: []Failure{{ID: "d", Status: 400, Reason: "mapper_parsing_exception: mapper_parsing_exception reason"}}}
	if got.Indexed != want.Indexed || got.Skipped != want.Skipped || len(got.Failed) != 1 || got.Failed[0] != want.Failed[0] {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestParseBulkItemsTreatsAMissingAliasAsUnavailable(t *testing.T) {
	_, err := ParseBulkItems([]opensearchapi.BulkItem{item("a", 404, "index_not_found_exception")})
	if !errors.Is(err, index.ErrAliasMissing) {
		t.Fatalf("got %v", err)
	}
}

func TestBulkLines(t *testing.T) {
	bad := product("bad")
	bad.Name = ""
	body, invalid := bulkLines([]catalog.Product{product("a"), bad, product("b")})

	if len(invalid) != 1 || invalid[0].ID != "bad" || invalid[0].Status != 400 || !strings.Contains(invalid[0].Reason, "name") {
		t.Fatalf("invalid %+v", invalid)
	}
	if !bytes.HasSuffix(body, []byte("\n")) {
		t.Fatal("a bulk body must end with a newline")
	}

	var lines []map[string]any
	sc := bufio.NewScanner(bytes.NewReader(body))
	for sc.Scan() {
		var m map[string]any
		if err := json.Unmarshal(sc.Bytes(), &m); err != nil {
			t.Fatalf("line %q: %v", sc.Text(), err)
		}
		lines = append(lines, m)
	}
	if len(lines) != 4 {
		t.Fatalf("got %d lines, want 4 (action + doc for each valid product)", len(lines))
	}
	action := lines[0]["index"].(map[string]any)
	if action["_id"] != "a" || action["version"] != float64(1792576800123) || action["version_type"] != "external_gte" {
		t.Fatalf("action %v", action)
	}
	if lines[1]["price_cents"] != float64(10000) || lines[1]["in_stock"] != true {
		t.Fatalf("doc %v", lines[1])
	}
	if lines[2]["index"].(map[string]any)["_id"] != "b" {
		t.Fatalf("second action %v", lines[2])
	}
}

func TestBulkLinesAllInvalid(t *testing.T) {
	bad := product("x")
	bad.SKU = ""
	body, invalid := bulkLines([]catalog.Product{bad})
	if len(body) != 0 || len(invalid) != 1 {
		t.Fatalf("body %q invalid %+v", body, invalid)
	}
}

func TestDeleteItemError(t *testing.T) {
	notFound := "not_found"
	missingDoc := opensearchapi.BulkRespItem{Status: 404, Result: &notFound}
	if err := deleteItemError(missingDoc); err != nil {
		t.Fatalf("a missing document is fine, got %v", err)
	}
	deleted := "deleted"
	if err := deleteItemError(opensearchapi.BulkRespItem{Status: 200, Result: &deleted}); err != nil {
		t.Fatalf("got %v", err)
	}
	reason := "no such index"
	noIndex := opensearchapi.BulkRespItem{Status: 404, Error: &opensearchapi.ErrorCause{Type: "index_not_found_exception", Reason: &reason}}
	if err := deleteItemError(noIndex); !errors.Is(err, index.ErrAliasMissing) {
		t.Fatalf("a missing index must be ErrAliasMissing, got %v", err)
	}
	other := opensearchapi.BulkRespItem{Status: 400, Error: &opensearchapi.ErrorCause{Type: "illegal_argument_exception", Reason: &reason}}
	if err := deleteItemError(other); err == nil || !strings.Contains(err.Error(), "illegal_argument_exception") {
		t.Fatalf("got %v", err)
	}
}

// testNames are the names the fake OpenSearch below answers for.
var testNames = index.Names{Index: "t-v1", Alias: "t", BuildAlias: "t-build"}

var quiet = slog.New(slog.NewJSONHandler(io.Discard, nil))

// fakeOpenSearch poses as OpenSearch for the dual-write tests. It records
// every request and answers with canned JSON: writes succeed, the build alias
// points at t-v2, and alias changes are acknowledged. build, when set,
// answers the writes to the build alias and to t-v2 instead; alias, when
// set, answers GET /_alias/t-build; aliases, when set, answers POST /_aliases.
type fakeOpenSearch struct {
	mu      sync.Mutex
	reqs    []fakeReq
	build   func() (int, string)
	alias   func() (int, string)
	aliases func() (int, string)
}

type fakeReq struct {
	method, path, body string
	query              url.Values
}

func (r fakeReq) String() string { return r.method + " " + r.path }

// newFake starts a fake OpenSearch and returns an Indexer on testNames that
// talks to it.
func newFake(t *testing.T) (*fakeOpenSearch, *Indexer) {
	t.Helper()
	f := &fakeOpenSearch{}
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	c, err := osclient.New(srv.URL)
	if err != nil {
		t.Fatalf("client: %v", err)
	}
	return f, New(c, testNames, quiet)
}

func (f *fakeOpenSearch) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.URL.Path == "/" {
		// The client's background health check, at no fixed time: answer it
		// but keep it out of the record.
		_, _ = io.WriteString(w, `{"version":{"distribution":"opensearch","number":"3.9.0"}}`)
		return
	}
	body, _ := io.ReadAll(r.Body)
	f.mu.Lock()
	f.reqs = append(f.reqs, fakeReq{method: r.Method, path: r.URL.Path, body: string(body), query: r.URL.Query()})
	f.mu.Unlock()
	status, resp := f.answer(r.URL.Path, string(body))
	w.WriteHeader(status)
	_, _ = io.WriteString(w, resp)
}

func (f *fakeOpenSearch) answer(path, body string) (int, string) {
	switch {
	case (strings.HasPrefix(path, "/t-build/") || strings.HasPrefix(path, "/t-v2/")) && f.build != nil:
		return f.build()
	case strings.HasPrefix(path, "/t-build/"), strings.HasPrefix(path, "/t-v2/"), strings.HasPrefix(path, "/t/"):
		return okWrite(path, body)
	case path == "/_alias/t-build" && f.alias != nil:
		return f.alias()
	case path == "/_alias/t-build":
		return 200, `{"t-v2":{"aliases":{"t-build":{}}}}`
	case path == "/_aliases" && f.aliases != nil:
		return f.aliases()
	case path == "/_aliases":
		return 200, `{"acknowledged":true}`
	}
	return 400, `{"error":{"type":"unexpected_request","reason":"the fake has no answer"},"status":400}`
}

// okWrite answers a successful single index call or one-item bulk call.
func okWrite(path, body string) (int, string) {
	switch {
	case !strings.HasSuffix(path, "/_bulk"):
		return 201, `{"_index":"t-v1","_id":"a","_version":1,"result":"created","_shards":{"total":1,"successful":1,"failed":0},"_seq_no":0,"_primary_term":1}`
	case strings.HasPrefix(body, `{"delete"`):
		return 200, `{"took":1,"errors":false,"items":[{"delete":{"_index":"t-v1","_id":"a","_version":2,"result":"deleted","status":200}}]}`
	}
	return 200, `{"took":1,"errors":false,"items":[{"index":{"_index":"t-v2","_id":"a","_version":1,"result":"created","status":201}}]}`
}

func (f *fakeOpenSearch) requests() []fakeReq {
	f.mu.Lock()
	defer f.mu.Unlock()
	return slices.Clone(f.reqs)
}

func (f *fakeOpenSearch) lines() []string {
	var out []string
	for _, r := range f.requests() {
		out = append(out, r.String())
	}
	return out
}

func TestDualWriteOrder(t *testing.T) {
	ctx := context.Background()
	f, x := newFake(t)

	if out, err := x.Upsert(ctx, product("a")); err != nil || out != Indexed {
		t.Fatalf("Upsert: %v %v", out, err)
	}
	if out, err := x.Delete(ctx, "a", 1792576800123); err != nil || out != Deleted {
		t.Fatalf("Delete: %v %v", out, err)
	}

	want := []string{"PUT /t-build/_doc/a", "PUT /t/_doc/a", "POST /t-build/_bulk", "POST /t/_bulk"}
	if got := f.lines(); !slices.Equal(got, want) {
		t.Fatalf("requests\n got %v\nwant %v (the build alias first, then live)", got, want)
	}
	for _, r := range f.requests() {
		if r.query.Get("require_alias") != "true" {
			t.Errorf("%s: require_alias=%q, want true", r, r.query.Get("require_alias"))
		}
		build := strings.HasPrefix(r.path, "/t-build/")
		if build && r.query.Has("refresh") {
			t.Errorf("%s: refresh=%q: the build index has refresh off, so a build write must not wait for one", r, r.query.Get("refresh"))
		}
		if !build && r.query.Get("refresh") != "wait_for" {
			t.Errorf("%s: refresh=%q, want wait_for", r, r.query.Get("refresh"))
		}
	}
}

func TestDeleteActionIsVersioned(t *testing.T) {
	f, x := newFake(t)
	if _, err := x.Delete(context.Background(), "a", 1792576800123); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	reqs := f.requests()
	if len(reqs) != 2 {
		t.Fatalf("requests %v, want a build and a live delete", f.lines())
	}
	for _, r := range reqs {
		if !strings.Contains(r.body, `"version":1792576800123,"version_type":"external_gte"`) {
			t.Errorf("%s: action %q is not versioned", r, r.body)
		}
	}
}

// A build write that fails for any reason other than "stale", "already gone"
// or "no build running" aborts the build, and never fails the user's write.
func TestBuildWriteResults(t *testing.T) {
	const (
		created      = `{"_index":"t-v2","_id":"a","_version":1,"result":"created","_shards":{"total":1,"successful":1,"failed":0},"_seq_no":0,"_primary_term":1}`
		conflict     = `{"error":{"type":"version_conflict_engine_exception","reason":"current version is higher"},"status":409}`
		noIndex      = `{"error":{"type":"index_not_found_exception","reason":"no such index [t-build]"},"status":404}`
		blocked      = `{"error":{"type":"cluster_block_exception","reason":"index [t-v2] blocked"},"status":403}`
		broken       = `{"error":{"type":"exception","reason":"boom"},"status":500}`
		deleted      = `{"took":1,"errors":false,"items":[{"delete":{"_index":"t-v2","_id":"a","_version":2,"result":"deleted","status":200}}]}`
		notFound     = `{"took":1,"errors":false,"items":[{"delete":{"_index":"t-v2","_id":"a","_version":2,"result":"not_found","status":404}}]}`
		itemConflict = `{"took":1,"errors":true,"items":[{"delete":{"_index":"t-v2","_id":"a","status":409,"error":{"type":"version_conflict_engine_exception","reason":"current version is higher"}}}]}`
		itemNoIndex  = `{"took":1,"errors":true,"items":[{"delete":{"_index":"t-build","_id":"a","status":404,"error":{"type":"index_not_found_exception","reason":"no such index [t-build]"}}}]}`
		itemBlocked  = `{"took":1,"errors":true,"items":[{"delete":{"_index":"t-v2","_id":"a","status":403,"error":{"type":"cluster_block_exception","reason":"index [t-v2] blocked"}}}]}`
	)
	tests := []struct {
		name   string
		delete bool
		status int
		body   string
		abort  bool
	}{
		{"upsert written", false, 201, created, false},
		{"upsert stale", false, 409, conflict, false},
		{"upsert with no build", false, 404, noIndex, false},
		{"upsert blocked", false, 403, blocked, true},
		{"upsert server error", false, 500, broken, true},
		{"delete done", true, 200, deleted, false},
		{"delete of a missing doc", true, 200, notFound, false},
		{"delete stale", true, 200, itemConflict, false},
		{"delete with no build", true, 200, itemNoIndex, false},
		{"delete blocked", true, 200, itemBlocked, true},
		{"delete server error", true, 500, broken, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			f, x := newFake(t)
			f.build = func() (int, string) { return tt.status, tt.body }

			var out, want Outcome
			var err error
			if tt.delete {
				out, err = x.Delete(ctx, "a", 1792576800123)
				want = Deleted
			} else {
				out, err = x.Upsert(ctx, product("a"))
				want = Indexed
			}
			if err != nil || out != want {
				t.Fatalf("the user's write must get the live result: %v %v, want %v", out, err, want)
			}

			got := f.lines()
			if !tt.abort {
				if len(got) != 2 {
					t.Fatalf("requests %v, want only the build and live writes", got)
				}
				return
			}
			if len(got) != 4 || got[1] != "GET /_alias/t-build" || got[2] != "POST /_aliases" {
				t.Fatalf("requests %v, want the build write, the abort, then the live write", got)
			}
			abort := f.requests()[2].body
			for _, s := range []string{`"remove"`, `"index":"t-v2"`, `"alias":"t-build"`, `"must_exist":true`} {
				if !strings.Contains(abort, s) {
					t.Errorf("abort body %s lacks %s", abort, s)
				}
			}
		})
	}
}

// When the build write fails and the abort can't stop the build, the edit
// may be missing from the build if it swaps: one Error line says so, with
// the id and both errors. An abort that finds the build already gone is
// fine: no build is left that could swap without the edit.
func TestBuildWriteAndAbortBothFail(t *testing.T) {
	const (
		broken  = `{"error":{"type":"exception","reason":"boom"},"status":500}`
		noAlias = `{"error":{"type":"aliases_not_found_exception","reason":"aliases [t-build] missing"},"status":404}`
		wantMsg = "build write and abort both failed; rerun reindex after this build finishes"
	)
	tests := []struct {
		name           string
		alias, aliases func() (int, string)
		want           bool
	}{
		{"abort fails", nil, func() (int, string) { return 500, broken }, true},
		{"finding the build fails", func() (int, string) { return 500, broken }, nil, true},
		{"build already gone", nil, func() (int, string) { return 404, noAlias }, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, x := newFake(t)
			var logs bytes.Buffer
			x.log = slog.New(slog.NewJSONHandler(&logs, nil))
			f.build = func() (int, string) { return 500, broken }
			f.alias, f.aliases = tt.alias, tt.aliases

			if out, err := x.Upsert(context.Background(), product("a")); err != nil || out != Indexed {
				t.Fatalf("Upsert: %v %v", out, err)
			}
			raw := logs.String()
			var found map[string]any
			sc := bufio.NewScanner(strings.NewReader(raw))
			for sc.Scan() {
				var line map[string]any
				if err := json.Unmarshal(sc.Bytes(), &line); err != nil {
					t.Fatalf("log line %q: %v", sc.Text(), err)
				}
				if line["msg"] == wantMsg {
					found = line
				}
			}
			if !tt.want {
				if found != nil {
					t.Fatalf("logged %v, but the build is gone", found)
				}
				return
			}
			if found == nil {
				t.Fatalf("no %q line in:\n%s", wantMsg, raw)
			}
			if found["level"] != "ERROR" || found["id"] != "a" || found["op"] != "upsert" {
				t.Errorf("line %v: want level ERROR, op upsert, id a", found)
			}
			for _, k := range []string{"build_err", "abort_err"} {
				if v, _ := found[k].(string); !strings.Contains(v, "boom") {
					t.Errorf("%s = %v, want the OpenSearch error", k, found[k])
				}
			}
		})
	}
}

// singleWrites runs an upsert or a delete of product a and returns what the
// user's write got and the Outcome it should get.
var singleWrites = []struct {
	name  string
	write func(ctx context.Context, x *Indexer) (Outcome, error)
	want  Outcome
}{
	{"upsert", func(ctx context.Context, x *Indexer) (Outcome, error) { return x.Upsert(ctx, product("a")) }, Indexed},
	{"delete", func(ctx context.Context, x *Indexer) (Outcome, error) { return x.Delete(ctx, "a", 1792576800123) }, Deleted},
}

// A build write that times out must not take the live write down with it:
// catalog-api gives up after 2s, and the edit must still reach the live index.
func TestLiveWriteSurvivesSlowBuildWrite(t *testing.T) {
	defer func(d time.Duration) { buildWriteTimeout = d }(buildWriteTimeout)
	buildWriteTimeout = 50 * time.Millisecond

	for _, w := range singleWrites {
		t.Run(w.name, func(t *testing.T) {
			f, x := newFake(t)
			f.build = func() (int, string) {
				time.Sleep(4 * buildWriteTimeout)
				return 500, `{"error":{"type":"exception","reason":"too late"},"status":500}`
			}
			// The caller's own deadline expires during the build write, as
			// catalog-api's does.
			ctx, cancel := context.WithTimeout(context.Background(), 2*buildWriteTimeout)
			defer cancel()

			if out, err := w.write(ctx, x); err != nil || out != w.want {
				t.Fatalf("got %v %v, want %v", out, err, w.want)
			}
			got := f.lines()
			if len(got) != 4 || !strings.HasPrefix(got[0], "PUT /t-build/") && !strings.HasPrefix(got[0], "POST /t-build/") ||
				got[1] != "GET /_alias/t-build" || got[2] != "POST /_aliases" || !strings.Contains(got[3], " /t/") {
				t.Fatalf("requests %v, want the build write, the abort, then the live write", got)
			}
		})
	}
}

// A caller that hangs up during the build write still gets its edit into the
// live index.
func TestLiveWriteSurvivesCancelledCaller(t *testing.T) {
	for _, w := range singleWrites {
		t.Run(w.name, func(t *testing.T) {
			f, x := newFake(t)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			f.build = func() (int, string) {
				cancel()
				return 503, `{"error":{"type":"exception","reason":"busy"},"status":503}`
			}

			if out, err := w.write(ctx, x); err != nil || out != w.want {
				t.Fatalf("got %v %v, want %v", out, err, w.want)
			}
			got := f.lines()
			if last := got[len(got)-1]; !strings.Contains(last, " /t/") {
				t.Fatalf("requests %v: the live write was not sent", got)
			}
		})
	}
}

// BulkBuild writes into the build index by name, not through the build
// alias: if the build is replaced after the check, the alias would carry this
// run's stale batch into the next run's index.
func TestBulkBuild(t *testing.T) {
	f, x := newFake(t)
	got, err := x.BulkBuild(context.Background(), "t-v2", []catalog.Product{product("a")})
	if err != nil || got.Indexed != 1 {
		t.Fatalf("BulkBuild: %+v %v", got, err)
	}
	if want := []string{"GET /_alias/t-build", "POST /t-v2/_bulk"}; !slices.Equal(f.lines(), want) {
		t.Fatalf("requests %v, want %v", f.lines(), want)
	}
	bulk := f.requests()[1]
	if bulk.query.Get("require_alias") != "false" || bulk.query.Has("refresh") {
		t.Fatalf("bulk query %v: want require_alias=false (a concrete index) and no refresh", bulk.query)
	}
	if !strings.Contains(bulk.body, `"version":1792576800123,"version_type":"external_gte"`) {
		t.Fatalf("bulk body %q is not versioned", bulk.body)
	}
}

func TestBulkBuildGone(t *testing.T) {
	tests := []struct {
		name  string
		alias func() (int, string)
		build func() (int, string)
	}{
		{"no build", func() (int, string) {
			return 404, `{"error":"alias [t-build] missing","status":404}`
		}, nil},
		{"another build", func() (int, string) {
			return 200, `{"t-v3":{"aliases":{"t-build":{}}}}`
		}, nil},
		{"index gone before the items", nil, func() (int, string) {
			return 404, `{"error":{"type":"index_not_found_exception","reason":"no such index [t-v2]"},"status":404}`
		}},
		{"index gone under an item", nil, func() (int, string) {
			return 200, `{"took":1,"errors":true,"items":[{"index":{"_index":"t-v2","_id":"a","status":404,"error":{"type":"index_not_found_exception","reason":"no such index [t-v2]"}}}]}`
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f, x := newFake(t)
			f.alias, f.build = tt.alias, tt.build
			if _, err := x.BulkBuild(context.Background(), "t-v2", []catalog.Product{product("a")}); !errors.Is(err, index.ErrBuildGone) {
				t.Fatalf("got %v, want ErrBuildGone", err)
			}
			if tt.alias != nil && len(f.requests()) != 1 {
				t.Fatalf("requests %v: nothing may be written for a build that isn't current", f.lines())
			}
		})
	}
}
