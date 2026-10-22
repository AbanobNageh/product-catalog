//go:build integration

package indexer_test

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/indexer"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/ittest"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

var quiet = slog.New(slog.NewJSONHandler(io.Discard, nil))

func product(id, updatedAt string) catalog.Product {
	return catalog.Product{
		ID: id, SKU: "SKU-" + id, Name: "Phone " + id, Description: "d",
		Category: "electronics", Brand: "Acme", PriceCents: 10000, Currency: "EGP",
		Stock: 1, CreatedAt: "2026-10-20T09:00:00Z", UpdatedAt: updatedAt,
	}
}

// get reads a document straight from the alias (a realtime GET, no refresh).
func get(t *testing.T, c *opensearchapi.Client, alias, id string) (catalog.Doc, bool) {
	t.Helper()
	resp, err := c.Doc.Get(context.Background(), opensearchapi.GetReq{Index: alias, ID: id})
	if osclient.StatusOf(osclient.Raw(resp), err) == 404 {
		return catalog.Doc{}, false
	}
	if err != nil {
		t.Fatalf("get %s: %v", id, err)
	}
	var d catalog.Doc
	if err := json.Unmarshal(resp.Source, &d); err != nil {
		t.Fatalf("decode %s: %v", id, err)
	}
	return d, true
}

// searchable runs a search for id, which only sees refreshed documents.
func searchable(t *testing.T, c *opensearchapi.Client, alias, id string) bool {
	t.Helper()
	body := `{"query":{"term":{"id":"` + id + `"}}}`
	resp, err := c.Search(context.Background(), &opensearchapi.SearchReq{Indices: []string{alias}, BodyReader: strings.NewReader(body)})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	return len(resp.Hits.Hits) == 1
}

func TestUpsertVersioningAndRefresh(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	p := product("p1", "2026-10-21T10:00:00.500Z")
	if out, err := x.Upsert(ctx, p); err != nil || out != indexer.Indexed {
		t.Fatalf("Upsert: %v %v", out, err)
	}
	if !searchable(t, c, n.Alias, "p1") {
		t.Fatal("refresh=wait_for: the product should be searchable as soon as Upsert returns")
	}

	stale := p
	stale.UpdatedAt, stale.Name = "2026-10-21T10:00:00.400Z", "Stale name"
	if out, err := x.Upsert(ctx, stale); err != nil || out != indexer.Skipped {
		t.Fatalf("stale Upsert: %v %v", out, err)
	}
	if d, _ := get(t, c, n.Alias, "p1"); d.Name != p.Name {
		t.Fatalf("a stale write replaced the doc: %q", d.Name)
	}

	same := p
	same.Name = "Same version, new name"
	if out, err := x.Upsert(ctx, same); err != nil || out != indexer.Indexed {
		t.Fatalf("same-version Upsert: %v %v", out, err)
	}
	if d, _ := get(t, c, n.Alias, "p1"); d.Name != same.Name {
		t.Fatalf("an equal version should overwrite (external_gte): %q", d.Name)
	}
}

// 1.4 finding A: catalog-api bumps its search-cache version when reindex
// returns. If the bulk writes weren't searchable yet, the next search cached
// pre-reindex results under the new version for 60s.
func TestBulkIsSearchableOnReturn(t *testing.T) {
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	res, err := x.Bulk(context.Background(), []catalog.Product{
		product("b1", "2026-10-21T10:00:00Z"),
		product("b2", "2026-10-21T10:00:00Z"),
	})
	if err != nil || res.Indexed != 2 {
		t.Fatalf("Bulk: %+v %v", res, err)
	}
	for _, id := range []string{"b1", "b2"} {
		if !searchable(t, c, n.Alias, id) {
			t.Fatalf("refresh=wait_for: %s should be searchable as soon as Bulk returns", id)
		}
	}
}

func TestDeleteIsIdempotent(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	if _, err := x.Upsert(ctx, product("d1", "2026-10-21T10:00:00Z")); err != nil {
		t.Fatal(err)
	}
	v := product("d1", "2026-10-21T10:00:01Z").Version()
	if out, err := x.Delete(ctx, "d1", v); err != nil || out != indexer.Deleted {
		t.Fatalf("first Delete: %v %v", out, err)
	}
	if searchable(t, c, n.Alias, "d1") {
		t.Fatal("refresh=wait_for: the product should be gone from search")
	}
	if out, err := x.Delete(ctx, "d1", v); err != nil || out != indexer.Deleted {
		t.Fatalf("second Delete: %v %v", out, err)
	}
	if out, err := x.Delete(ctx, "never-indexed", v); err != nil || out != indexer.Deleted {
		t.Fatalf("Delete of a product never indexed: %v %v", out, err)
	}
}

// A delete older than the stored product (a newer upsert won) is skipped.
func TestStaleDeleteIsSkipped(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	p := product("s1", "2026-10-21T10:00:00.200Z")
	if _, err := x.Upsert(ctx, p); err != nil {
		t.Fatal(err)
	}
	stale := product("s1", "2026-10-21T10:00:00.100Z").Version()
	if out, err := x.Delete(ctx, "s1", stale); err != nil || out != indexer.Skipped {
		t.Fatalf("stale Delete: %v %v", out, err)
	}
	if _, ok := get(t, c, n.Alias, "s1"); !ok {
		t.Fatal("a stale delete removed a newer product")
	}
}

func TestBulkReportsFailuresPerItem(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	immense := product("big-sku", "2026-10-21T10:00:00Z")
	immense.SKU = strings.Repeat("s", 40000) // over keyword's 32,766-byte term limit
	longID := product(strings.Repeat("i", 600), "2026-10-21T10:00:00Z")

	got, err := x.Bulk(ctx, []catalog.Product{
		product("b1", "2026-10-21T10:00:00Z"),
		product("b2", "2026-10-21T10:00:00Z"),
		immense,
		longID,
		product("b3", "2026-10-21T10:00:00Z"),
	})
	if err != nil {
		t.Fatalf("Bulk: %v", err)
	}
	if got.Indexed != 3 || got.Skipped != 0 || len(got.Failed) != 2 {
		t.Fatalf("got %+v", got)
	}
	failed := map[string]indexer.Failure{}
	for _, f := range got.Failed {
		failed[f.ID] = f
	}
	if f := failed["big-sku"]; f.Status != 400 || f.Reason == "" {
		t.Fatalf("OpenSearch-side failure: %+v", f)
	}
	if f := failed[longID.ID]; f.Status != 400 || !strings.Contains(f.Reason, "id") {
		t.Fatalf("validation failure: %+v", f)
	}

	again, err := x.Bulk(ctx, []catalog.Product{product("b1", "2026-10-20T00:00:00Z")})
	if err != nil || again.Skipped != 1 {
		t.Fatalf("an older version in bulk should be skipped: %+v %v", again, err)
	}
}

// Review Focus 2: a write to a missing alias must fail and must not create an
// index of that name.
func TestWritesToAMissingAliasCreateNoIndex(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Names(t, c) // not created
	missing := index.Names{Alias: n.Alias + "-missing", BuildAlias: n.Alias + "-missing-build"}
	t.Cleanup(func() {
		for _, name := range []string{missing.Alias, missing.BuildAlias} {
			_, _ = c.Indices.Delete(context.Background(), &opensearchapi.IndicesDeleteReq{Indices: []string{name}})
		}
	})
	x := indexer.New(c, missing, quiet)

	if _, err := x.Upsert(ctx, product("m1", "2026-10-21T10:00:00Z")); !errors.Is(err, index.ErrAliasMissing) {
		t.Errorf("Upsert: got %v", err)
	}
	if _, err := x.Delete(ctx, "m1", 1792576800123); !errors.Is(err, index.ErrAliasMissing) {
		t.Errorf("Delete: got %v", err)
	}
	if _, err := x.Bulk(ctx, []catalog.Product{product("m2", "2026-10-21T10:00:00Z")}); !errors.Is(err, index.ErrAliasMissing) {
		t.Errorf("Bulk: got %v", err)
	}
	for _, name := range []string{missing.Alias, missing.BuildAlias} {
		assertNoSuchName(t, c, name)
	}
}

// assertNoSuchName fails if an index or alias called name exists.
func assertNoSuchName(t *testing.T, c *opensearchapi.Client, name string) {
	t.Helper()
	resp, err := c.Indices.Exists(context.Background(), &opensearchapi.IndicesExistsReq{Indices: []string{name}})
	if status := osclient.StatusOf(resp, err); status != 404 {
		t.Fatalf("an index or alias named %s exists (status %d)", name, status)
	}
}

// startBuild starts a reindex build on n and returns the build index name.
func startBuild(t *testing.T, c *opensearchapi.Client, n index.Names) string {
	t.Helper()
	build, err := index.StartBuild(context.Background(), c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("StartBuild: %v", err)
	}
	return build
}

func finishBuild(t *testing.T, c *opensearchapi.Client, n index.Names, build string) {
	t.Helper()
	if err := index.FinishBuild(context.Background(), c, n, build); err != nil {
		t.Fatalf("FinishBuild: %v", err)
	}
}

// hit searches alias for id (refreshed documents only) and returns its doc.
func hit(t *testing.T, c *opensearchapi.Client, alias, id string) (catalog.Doc, bool) {
	t.Helper()
	body := `{"query":{"term":{"id":"` + id + `"}}}`
	resp, err := c.Search(context.Background(), &opensearchapi.SearchReq{Indices: []string{alias}, BodyReader: strings.NewReader(body)})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(resp.Hits.Hits) != 1 {
		return catalog.Doc{}, false
	}
	var d catalog.Doc
	if err := json.Unmarshal(resp.Hits.Hits[0].Source, &d); err != nil {
		t.Fatalf("decode %s: %v", id, err)
	}
	return d, true
}

// Done-when #4: a product deleted while a reindex runs stays deleted, even
// though the bulk load read it from Postgres before the delete.
func TestVersionedDeleteBlocksStaleBulkDuringBuild(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	p := product("vd1", "2026-10-21T10:00:00.100Z")
	if _, err := x.Upsert(ctx, p); err != nil {
		t.Fatal(err)
	}
	build := startBuild(t, c, n)
	if _, err := x.Delete(ctx, p.ID, product(p.ID, "2026-10-21T10:00:00.200Z").Version()); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	res, err := x.BulkBuild(ctx, build, []catalog.Product{p})
	if err != nil || res.Skipped != 1 || res.Indexed != 0 {
		t.Fatalf("BulkBuild of the stale copy: %+v %v, want it skipped by the tombstone", res, err)
	}
	finishBuild(t, c, n, build)
	if _, ok := get(t, c, n.Alias, p.ID); ok {
		t.Fatal("the deleted product came back after the swap")
	}
}

func TestEditDuringBuildSurvivesSwap(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	build := startBuild(t, c, n)
	edited := product("e1", "2026-10-21T10:00:00.200Z")
	edited.Name = "Edited during the build"
	if out, err := x.Upsert(ctx, edited); err != nil || out != indexer.Indexed {
		t.Fatalf("Upsert: %v %v", out, err)
	}
	res, err := x.BulkBuild(ctx, build, []catalog.Product{product("e1", "2026-10-21T10:00:00.100Z")})
	if err != nil || res.Skipped != 1 {
		t.Fatalf("BulkBuild of the stale copy: %+v %v", res, err)
	}
	finishBuild(t, c, n, build)
	if d, ok := hit(t, c, n.Alias, "e1"); !ok || d.Name != edited.Name {
		t.Fatalf("after the swap: %+v %v, want the edit", d, ok)
	}
}

func TestCreateDuringBuildIsFindable(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	build := startBuild(t, c, n)
	if out, err := x.Upsert(ctx, product("new1", "2026-10-21T10:00:00Z")); err != nil || out != indexer.Indexed {
		t.Fatalf("Upsert: %v %v", out, err)
	}
	finishBuild(t, c, n, build)
	if _, ok := hit(t, c, n.Alias, "new1"); !ok {
		t.Fatal("a product created during the build is missing after the swap")
	}
}

// With no build running, the build writes find no alias and create nothing.
// The versioned delete relies on the auto-create guard for that (ADR-0007).
func TestWritesWithoutBuildCreateNothing(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	p := product("w1", "2026-10-21T10:00:00Z")
	if out, err := x.Upsert(ctx, p); err != nil || out != indexer.Indexed {
		t.Fatalf("Upsert: %v %v", out, err)
	}
	if out, err := x.Delete(ctx, p.ID, p.Version()+1); err != nil || out != indexer.Deleted {
		t.Fatalf("Delete: %v %v", out, err)
	}
	assertNoSuchName(t, c, n.BuildAlias)
	if b, ok, err := index.CurrentBuild(ctx, c, n); err != nil || ok {
		t.Fatalf("CurrentBuild: %q %v %v, want none", b, ok, err)
	}
}

func TestUpsertBuildFailureAbortsBuild(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	build := startBuild(t, c, n)
	if _, err := c.Indices.PutSettings(ctx, &opensearchapi.IndicesPutSettingsReq{
		Indices:    []string{build},
		BodyReader: strings.NewReader(`{"index": {"blocks.write": true}}`),
	}); err != nil {
		t.Fatalf("block writes to %s: %v", build, err)
	}

	p := product("f1", "2026-10-21T10:00:00Z")
	if out, err := x.Upsert(ctx, p); err != nil || out != indexer.Indexed {
		t.Fatalf("a failed build write must not fail the user's write: %v %v", out, err)
	}
	if d, ok := get(t, c, n.Alias, p.ID); !ok || d.Name != p.Name {
		t.Fatalf("live doc: %+v %v", d, ok)
	}
	if b, ok, err := index.CurrentBuild(ctx, c, n); err != nil || ok {
		t.Fatalf("CurrentBuild: %q %v %v, want the build aborted", b, ok, err)
	}
	if _, err := x.BulkBuild(ctx, build, []catalog.Product{p}); !errors.Is(err, index.ErrBuildGone) {
		t.Fatalf("BulkBuild into the aborted build: got %v, want ErrBuildGone", err)
	}
}

// The build index has refresh off, so a build write with refresh=wait_for
// would hang until the 2s write timeout, then abort the build. The bound is
// that timeout, not 1s: the live write's own wait_for can take up to the 1s
// refresh interval.
func TestBuildWriteDoesNotWait(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, quiet)

	build := startBuild(t, c, n)
	writes := []struct {
		name  string
		write func() (indexer.Outcome, error)
		want  indexer.Outcome
	}{
		{"Upsert", func() (indexer.Outcome, error) { return x.Upsert(ctx, product("t1", "2026-10-21T10:00:00Z")) }, indexer.Indexed},
		{"Delete", func() (indexer.Outcome, error) {
			return x.Delete(ctx, "t1", product("t1", "2026-10-21T10:00:01Z").Version())
		}, indexer.Deleted},
	}
	for _, w := range writes {
		start := time.Now()
		if out, err := w.write(); err != nil || out != w.want {
			t.Fatalf("%s: %v %v", w.name, out, err)
		}
		if d := time.Since(start); d >= 2*time.Second {
			t.Fatalf("%s took %v during a build; the build write must not wait for a refresh", w.name, d)
		}
		if cur, ok, err := index.CurrentBuild(ctx, c, n); err != nil || !ok || cur != build {
			t.Fatalf("after %s: CurrentBuild %q %v %v, want %s still running", w.name, cur, ok, err, build)
		}
	}
}

// abortAndRestart aborts build and starts the next one, as a reindex that
// takes over (or follows) an aborted run does. The next start sweeps build.
func abortAndRestart(t *testing.T, c *opensearchapi.Client, n index.Names, build string) string {
	t.Helper()
	if err := index.AbortBuild(context.Background(), c, n, build); err != nil {
		t.Fatalf("AbortBuild(%s): %v", build, err)
	}
	return startBuild(t, c, n)
}

// An aborted run's late batch must not land in the next run's index: its
// delete tombstones live in the old build, so the stale copies would come
// back with the next swap.
func TestBulkBuildIntoReplacedBuild(t *testing.T) {
	cases := []struct {
		name string
		// race replaces the build between BulkBuild's check and its write,
		// not before the call.
		race bool
	}{
		{"before the call", false},
		{"between the check and the write", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			c := ittest.Client(t)
			n := ittest.Index(t, c)
			x := indexer.New(c, n, quiet)
			p := product("g1", "2026-10-21T10:00:00Z")

			a := startBuild(t, c, n)
			var b string
			if tc.race {
				indexer.SetAfterBuildCheck(t, func() { b = abortAndRestart(t, c, n, a) })
			} else {
				b = abortAndRestart(t, c, n, a)
			}

			if _, err := x.BulkBuild(ctx, a, []catalog.Product{p}); !errors.Is(err, index.ErrBuildGone) {
				t.Fatalf("BulkBuild(%s): got %v, want ErrBuildGone", a, err)
			}
			if b == "" {
				t.Fatal("the build was not replaced")
			}
			if _, ok := get(t, c, b, p.ID); ok {
				t.Fatalf("the aborted run's batch landed in the next build %s", b)
			}
			assertNoSuchName(t, c, a)
		})
	}
}
