package query

import "strconv"

// Range is one price facet bucket in cents: From inclusive, To exclusive,
// and 0 means open-ended.
type Range struct{ From, To int }

// PriceBuckets are the price facet ranges (EGP 100, 500, 2,000, 10,000).
// Change them here; nothing else depends on the values.
var PriceBuckets = []Range{
	{To: 10000},
	{From: 10000, To: 50000},
	{From: 50000, To: 200000},
	{From: 200000, To: 1000000},
	{From: 1000000},
}

const (
	categoryFacetSize = 20
	brandFacetSize    = 50
)

// Build returns the OpenSearch search body for p. Facets are aggregations on
// the same query, so they count only the filtered results.
func Build(p Params) map[string]any {
	must := []any{map[string]any{"match_all": map[string]any{}}}
	if p.Q != "" {
		// multi_match treats the text as plain words; query_string would
		// parse operators and fail on input like "phone OR (".
		must = []any{map[string]any{"multi_match": map[string]any{
			"query":     p.Q,
			"fields":    []string{"name^3", "description"},
			"fuzziness": "AUTO",
		}}}
	}

	filter := []any{}
	if p.Category != "" {
		filter = append(filter, term("category", p.Category))
	}
	if p.Brand != "" {
		filter = append(filter, term("brand", p.Brand))
	}
	if p.MinPrice != nil || p.MaxPrice != nil {
		r := map[string]any{}
		if p.MinPrice != nil {
			r["gte"] = *p.MinPrice
		}
		if p.MaxPrice != nil {
			r["lte"] = *p.MaxPrice
		}
		filter = append(filter, map[string]any{"range": map[string]any{"price_cents": r}})
	}
	if p.InStock != nil {
		filter = append(filter, term("in_stock", *p.InStock))
	}
	if p.MaxStock != nil {
		filter = append(filter, map[string]any{"range": map[string]any{"stock": map[string]any{"lte": *p.MaxStock}}})
	}

	return map[string]any{
		"from":             (p.Page - 1) * p.Size,
		"size":             p.Size,
		"track_total_hits": true,
		"query":            map[string]any{"bool": map[string]any{"must": must, "filter": filter}},
		"sort":             sortFor(p),
		"aggs": map[string]any{
			"category": map[string]any{"terms": map[string]any{"field": "category", "size": categoryFacetSize}},
			"brand":    map[string]any{"terms": map[string]any{"field": "brand", "size": brandFacetSize}},
			"price":    map[string]any{"range": map[string]any{"field": "price_cents", "ranges": priceRanges()}},
		},
	}
}

func term(field string, value any) map[string]any {
	return map[string]any{"term": map[string]any{field: value}}
}

// sortFor ends every order with id, so equal prices or scores still page
// in a stable order.
func sortFor(p Params) []any {
	s := p.Sort
	if s == Relevance && p.Q == "" {
		s = Newest // no text, so there is no relevance to rank by
	}
	first := map[Sort]map[string]any{
		Relevance: {"_score": "desc"},
		PriceAsc:  {"price_cents": "asc"},
		PriceDesc: {"price_cents": "desc"},
		Newest:    {"created_at": "desc"},
		StockAsc:  {"stock": "asc"},
	}[s]
	return []any{first, map[string]any{"id": "asc"}}
}

func priceRanges() []any {
	out := make([]any, 0, len(PriceBuckets))
	for _, b := range PriceBuckets {
		r := map[string]any{"key": bucketKey(b)}
		if b.From != 0 {
			r["from"] = b.From
		}
		if b.To != 0 {
			r["to"] = b.To
		}
		out = append(out, r)
	}
	return out
}

// bucketKey names a bucket the way OpenSearch does by default, minus the
// ".0": "*-10000", "10000-50000", "1000000-*".
func bucketKey(b Range) string {
	from, to := "*", "*"
	if b.From != 0 {
		from = strconv.Itoa(b.From)
	}
	if b.To != 0 {
		to = strconv.Itoa(b.To)
	}
	return from + "-" + to
}
