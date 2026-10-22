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
	x := indexer.New(c, n.Alias, quiet)

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
	x := indexer.New(c, n.Alias, quiet)

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
	x := indexer.New(c, n.Alias, quiet)

	if _, err := x.Upsert(ctx, product("d1", "2026-10-21T10:00:00Z")); err != nil {
		t.Fatal(err)
	}
	if err := x.Delete(ctx, "d1"); err != nil {
		t.Fatalf("first Delete: %v", err)
	}
	if searchable(t, c, n.Alias, "d1") {
		t.Fatal("refresh=wait_for: the product should be gone from search")
	}
	if err := x.Delete(ctx, "d1"); err != nil {
		t.Fatalf("second Delete: %v", err)
	}
}

func TestBulkReportsFailuresPerItem(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n.Alias, quiet)

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
	missing := n.Alias + "-missing"
	t.Cleanup(func() {
		_, _ = c.Indices.Delete(context.Background(), &opensearchapi.IndicesDeleteReq{Indices: []string{missing}})
	})
	x := indexer.New(c, missing, quiet)

	if _, err := x.Upsert(ctx, product("m1", "2026-10-21T10:00:00Z")); !errors.Is(err, index.ErrAliasMissing) {
		t.Errorf("Upsert: got %v", err)
	}
	if err := x.Delete(ctx, "m1"); !errors.Is(err, index.ErrAliasMissing) {
		t.Errorf("Delete: got %v", err)
	}
	if _, err := x.Bulk(ctx, []catalog.Product{product("m2", "2026-10-21T10:00:00Z")}); !errors.Is(err, index.ErrAliasMissing) {
		t.Errorf("Bulk: got %v", err)
	}
	resp, err := c.Indices.Exists(ctx, &opensearchapi.IndicesExistsReq{Indices: []string{missing}})
	if status := osclient.StatusOf(resp, err); status != 404 {
		t.Fatalf("an index named %s was created (status %d)", missing, status)
	}
}
