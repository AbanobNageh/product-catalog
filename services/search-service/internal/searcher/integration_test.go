//go:build integration

package searcher_test

import (
	"context"
	"io"
	"log/slog"
	"net/url"
	"testing"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/indexer"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/ittest"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/query"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/searcher"
)

func p(id, name, category, brand string, price, stock int) catalog.Product {
	return catalog.Product{
		ID: id, SKU: "SKU-" + id, Name: name, Description: "A " + name,
		Category: category, Brand: brand, PriceCents: price, Currency: "EGP", Stock: stock,
		CreatedAt: "2026-10-2" + id[len(id)-1:] + "T09:00:00Z", UpdatedAt: "2026-10-21T10:00:00Z",
	}
}

func setup(t *testing.T) *searcher.Searcher {
	t.Helper()
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)
	x := indexer.New(c, n, slog.New(slog.NewJSONHandler(io.Discard, nil)))
	res, err := x.Bulk(ctx, []catalog.Product{
		p("p1", "Acme Phone", "electronics", "Acme", 15000, 3),
		p("p2", "Zed Phone Mini", "electronics", "Zed", 8000, 0),
		p("p3", "Acme Phone Pro", "electronics", "Acme", 60000, 1),
		p("p4", "Acme Laptop", "electronics", "Acme", 250000, 2),
		p("p5", "Phone Stand", "home", "Bolt", 3000, 9),
		p("p6", "Cookbook", "books", "Bolt", 2000, 4),
	})
	if err != nil || res.Indexed != 6 {
		t.Fatalf("Bulk: %+v %v", res, err)
	}
	if _, err := c.Indices.Refresh(ctx, &opensearchapi.IndicesRefreshReq{Indices: []string{n.Index}}); err != nil {
		t.Fatalf("refresh: %v", err)
	}
	return searcher.New(c, n.Alias)
}

func search(t *testing.T, s *searcher.Searcher, raw string) query.Result {
	t.Helper()
	v, _ := url.ParseQuery(raw)
	params, err := query.ParseParams(v)
	if err != nil {
		t.Fatalf("params %q: %v", raw, err)
	}
	r, err := s.Search(context.Background(), params)
	if err != nil {
		t.Fatalf("search %q: %v", raw, err)
	}
	return r
}

func ids(r query.Result) []string {
	out := []string{}
	for _, h := range r.Hits {
		out = append(out, h.ID)
	}
	return out
}

func counts(bs []query.Bucket) map[string]int {
	m := map[string]int{}
	for _, b := range bs {
		m[b.Key] = b.Count
	}
	return m
}

func TestSearch(t *testing.T) {
	s := setup(t)

	t.Run("text query finds the phones first", func(t *testing.T) {
		r := search(t, s, "q=phone")
		if r.Total != 4 { // p1, p2, p3, p5 mention phone
			t.Fatalf("total %d: %v", r.Total, ids(r))
		}
		for _, h := range r.Hits {
			if h.ID == "p4" || h.ID == "p6" {
				t.Fatalf("%s doesn't mention phone: %v", h.ID, ids(r))
			}
		}
	})

	t.Run("filters and facets count only the filtered results", func(t *testing.T) {
		r := search(t, s, "category=electronics&minPrice=10000")
		if r.Total != 3 { // p1, p3, p4
			t.Fatalf("total %d: %v", r.Total, ids(r))
		}
		if c := counts(r.Facets.Category); len(c) != 1 || c["electronics"] != 3 {
			t.Fatalf("category facet %v", r.Facets.Category)
		}
		if c := counts(r.Facets.Brand); len(c) != 1 || c["Acme"] != 3 {
			t.Fatalf("brand facet %v", r.Facets.Brand)
		}
		price := map[string]int{}
		for _, b := range r.Facets.Price {
			price[b.Key] = b.Count
		}
		if len(r.Facets.Price) != 5 || price["10000-50000"] != 1 || price["50000-200000"] != 1 || price["200000-1000000"] != 1 || price["*-10000"] != 0 {
			t.Fatalf("price facet %+v", r.Facets.Price)
		}
	})

	t.Run("price_asc orders by price", func(t *testing.T) {
		r := search(t, s, "sort=price_asc")
		for i := 1; i < len(r.Hits); i++ {
			if r.Hits[i-1].PriceCents > r.Hits[i].PriceCents {
				t.Fatalf("not ascending: %v", ids(r))
			}
		}
	})

	t.Run("query syntax is plain text", func(t *testing.T) {
		search(t, s, "q=phone+OR+(") // must not error
		search(t, s, `q="\*`)
	})

	t.Run("inStock excludes stock 0", func(t *testing.T) {
		r := search(t, s, "q=phone&inStock=true")
		for _, h := range r.Hits {
			if h.Stock == 0 {
				t.Fatalf("%s is out of stock", h.ID)
			}
		}
		if r.Total != 3 {
			t.Fatalf("total %d: %v", r.Total, ids(r))
		}
	})

	t.Run("hits are the products as sent", func(t *testing.T) {
		r := search(t, s, "q=cookbook")
		if len(r.Hits) != 1 || r.Hits[0] != p("p6", "Cookbook", "books", "Bolt", 2000, 4) {
			t.Fatalf("hits %+v", r.Hits)
		}
	})
}
