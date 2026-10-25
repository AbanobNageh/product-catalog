package query

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

// body builds the request for p and decodes it back to plain JSON values, so
// tests compare what OpenSearch would receive.
func body(t *testing.T, p Params) map[string]any {
	t.Helper()
	b, err := json.Marshal(Build(p))
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

// at walks nested objects by key.
func at(t *testing.T, m map[string]any, path ...string) any {
	t.Helper()
	var cur any = m
	for _, k := range path {
		obj, ok := cur.(map[string]any)
		if !ok {
			t.Fatalf("%v: %v is not an object", path, cur)
		}
		cur = obj[k]
	}
	return cur
}

func decode(t *testing.T, s string) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func eq(t *testing.T, name string, got any, want string) {
	t.Helper()
	if w := decode(t, want); !reflect.DeepEqual(got, w) {
		g, _ := json.Marshal(got)
		t.Errorf("%s:\n got  %s\n want %s", name, g, want)
	}
}

func defaults() Params { return Params{Sort: Relevance, Page: 1, Size: 20} }

func ptr[T any](v T) *T { return &v }

func TestBuild(t *testing.T) {
	tests := []struct {
		name   string
		params func(*Params)
		path   []string
		want   string
	}{
		{"no q matches all", func(*Params) {}, []string{"query", "bool", "must"}, `[{"match_all":{}}]`},
		{"no q sorts newest first", func(*Params) {}, []string{"sort"}, `[{"created_at":"desc"},{"id":"asc"}]`},
		{"q is a fuzzy multi_match", func(p *Params) { p.Q = "phone" }, []string{"query", "bool", "must"},
			`[{"multi_match":{"query":"phone","fields":["name^3","description"],"fuzziness":"AUTO"}}]`},
		{"q sorts by relevance", func(p *Params) { p.Q = "phone" }, []string{"sort"}, `[{"_score":"desc"},{"id":"asc"}]`},
		{"query syntax stays plain text", func(p *Params) { p.Q = `phone OR (` }, []string{"query", "bool", "must"},
			`[{"multi_match":{"query":"phone OR (","fields":["name^3","description"],"fuzziness":"AUTO"}}]`},
		{"no filters", func(*Params) {}, []string{"query", "bool", "filter"}, `[]`},
		{"all filters", func(p *Params) {
			p.Category, p.Brand, p.MinPrice, p.MaxPrice, p.InStock, p.MaxStock = "electronics", "Acme", new(10000), new(50000), new(true), new(5)
		}, []string{"query", "bool", "filter"},
			`[{"term":{"category":"electronics"}},{"term":{"brand":"Acme"}},{"range":{"price_cents":{"gte":10000,"lte":50000}}},{"term":{"in_stock":true}},{"range":{"stock":{"lte":5}}}]`},
		{"only minPrice", func(p *Params) { p.MinPrice = new(10000) }, []string{"query", "bool", "filter"},
			`[{"range":{"price_cents":{"gte":10000}}}]`},
		{"inStock=false filters too", func(p *Params) { p.InStock = new(false) }, []string{"query", "bool", "filter"},
			`[{"term":{"in_stock":false}}]`},
		{"maxStock filter", func(p *Params) { p.MaxStock = new(5) }, []string{"query", "bool", "filter"},
			`[{"range":{"stock":{"lte":5}}}]`},
		{"maxStock zero still filters", func(p *Params) { p.MaxStock = new(0) }, []string{"query", "bool", "filter"},
			`[{"range":{"stock":{"lte":0}}}]`},
		{"price_asc", func(p *Params) { p.Q, p.Sort = "phone", PriceAsc }, []string{"sort"}, `[{"price_cents":"asc"},{"id":"asc"}]`},
		{"price_desc", func(p *Params) { p.Sort = PriceDesc }, []string{"sort"}, `[{"price_cents":"desc"},{"id":"asc"}]`},
		{"newest", func(p *Params) { p.Q, p.Sort = "phone", Newest }, []string{"sort"}, `[{"created_at":"desc"},{"id":"asc"}]`},
		{"stock_asc beats relevance", func(p *Params) { p.Q, p.Sort = "phone", StockAsc }, []string{"sort"}, `[{"stock":"asc"},{"id":"asc"}]`},
		{"paging from", func(p *Params) { p.Page, p.Size = 3, 20 }, []string{"from"}, `40`},
		{"paging size", func(p *Params) { p.Page, p.Size = 3, 20 }, []string{"size"}, `20`},
		{"exact totals", func(*Params) {}, []string{"track_total_hits"}, `true`},
		{"category facet", func(*Params) {}, []string{"aggs", "category"}, `{"terms":{"field":"category","size":20}}`},
		{"brand facet", func(*Params) {}, []string{"aggs", "brand"}, `{"terms":{"field":"brand","size":50}}`},
		{"price facet", func(*Params) {}, []string{"aggs", "price"}, `{"range":{"field":"price_cents","ranges":[
			{"key":"*-10000","to":10000},
			{"key":"10000-50000","from":10000,"to":50000},
			{"key":"50000-200000","from":50000,"to":200000},
			{"key":"200000-1000000","from":200000,"to":1000000},
			{"key":"1000000-*","from":1000000}]}}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := defaults()
			tt.params(&p)
			eq(t, tt.name, at(t, body(t, p), tt.path...), tt.want)
		})
	}
}

// Facets count only the filtered results: no post_filter, and nothing that
// parses query syntax.
func TestBuildNeverUsesPostFilterOrQueryString(t *testing.T) {
	p := defaults()
	p.Q, p.Category = `phone OR (`, "electronics"
	b, _ := json.Marshal(Build(p))
	for _, banned := range []string{"post_filter", "query_string"} {
		if strings.Contains(string(b), banned) {
			t.Errorf("body contains %s: %s", banned, b)
		}
	}
}
