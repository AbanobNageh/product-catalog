package query

import (
	"encoding/json"
	"strings"
	"testing"
)

const response = `{
  "took": 3,
  "hits": {
    "total": {"value": 42, "relation": "eq"},
    "hits": [
      {"_id": "a", "_score": 2.1, "_source": {"id":"a","sku":"A-1","name":"Phone A","description":"d","category":"electronics","brand":"Acme","price_cents":15000,"currency":"EGP","stock":3,"in_stock":true,"created_at":"2026-10-20T09:00:00.000Z","updated_at":"2026-10-21T10:00:00.123Z"}},
      {"_id": "b", "_score": 1.5, "_source": {"id":"b","sku":"B-1","name":"Phone B","description":"","category":"electronics","brand":"Zed","price_cents":9000,"currency":"EGP","stock":0,"in_stock":false,"created_at":"2026-10-19T09:00:00Z","updated_at":"2026-10-19T09:00:00Z"}}
    ]
  },
  "aggregations": {
    "category": {"doc_count_error_upper_bound": 0, "sum_other_doc_count": 0, "buckets": [{"key": "electronics", "doc_count": 42}]},
    "brand": {"buckets": [{"key": "Acme", "doc_count": 30}, {"key": "Zed", "doc_count": 12}]},
    "price": {"buckets": [
      {"key": "*-10000", "to": 10000.0, "doc_count": 12},
      {"key": "10000-50000", "from": 10000.0, "to": 50000.0, "doc_count": 30},
      {"key": "50000-200000", "from": 50000.0, "to": 200000.0, "doc_count": 0},
      {"key": "200000-1000000", "from": 200000.0, "to": 1000000.0, "doc_count": 0},
      {"key": "1000000-*", "from": 1000000.0, "doc_count": 0}
    ]}
  }
}`

func TestParseResult(t *testing.T) {
	r, err := ParseResult([]byte(response))
	if err != nil {
		t.Fatal(err)
	}
	if r.Total != 42 || len(r.Hits) != 2 {
		t.Fatalf("total %d, %d hits", r.Total, len(r.Hits))
	}
	if h := r.Hits[0]; h.ID != "a" || h.PriceCents != 15000 || h.Stock != 3 || h.UpdatedAt != "2026-10-21T10:00:00.123Z" || h.Brand != "Acme" {
		t.Fatalf("first hit %+v", h)
	}
	if r.Hits[1].ID != "b" {
		t.Fatalf("hits out of order: %+v", r.Hits)
	}
	if len(r.Facets.Category) != 1 || r.Facets.Category[0] != (Bucket{Key: "electronics", Count: 42}) {
		t.Fatalf("category %+v", r.Facets.Category)
	}
	if len(r.Facets.Brand) != 2 || r.Facets.Brand[1] != (Bucket{Key: "Zed", Count: 12}) {
		t.Fatalf("brand %+v", r.Facets.Brand)
	}
	p := r.Facets.Price
	if len(p) != 5 || p[0].Key != "*-10000" || p[0].From != nil || *p[0].To != 10000 || p[0].Count != 12 {
		t.Fatalf("first price bucket %+v", p)
	}
	if *p[1].From != 10000 || *p[1].To != 50000 || p[4].To != nil || *p[4].From != 1000000 {
		t.Fatalf("price buckets %+v", p)
	}
}

func TestResultJSONMatchesTheContract(t *testing.T) {
	r, err := ParseResult([]byte(response))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(r)
	for _, want := range []string{
		`"hits":[{"id":"a"`, `"total":42`, `"facets":{"category":[{"key":"electronics","count":42}]`,
		`"price":[{"key":"*-10000","count":12,"to":10000}`, `{"key":"1000000-*","count":0,"from":1000000}`,
		`"priceCents":15000`,
	} {
		if !strings.Contains(string(b), want) {
			t.Errorf("JSON lacks %s:\n%s", want, b)
		}
	}
	if strings.Contains(string(b), "price_cents") || strings.Contains(string(b), "in_stock") {
		t.Errorf("index field names leaked into the API: %s", b)
	}
}

func TestParseResultEmpty(t *testing.T) {
	r, err := ParseResult([]byte(`{"hits":{"total":{"value":0},"hits":[]},"aggregations":{"category":{"buckets":[]},"brand":{"buckets":[]},"price":{"buckets":[]}}}`))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(r)
	if want := `{"hits":[],"total":0,"facets":{"category":[],"brand":[],"price":[]}}`; string(b) != want {
		t.Fatalf("got %s, want %s", b, want)
	}
}

func TestParseResultMalformed(t *testing.T) {
	if _, err := ParseResult([]byte(`{"hits":`)); err == nil {
		t.Fatal("expected an error")
	}
}
