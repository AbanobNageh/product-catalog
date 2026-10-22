package query

import (
	"encoding/json"
	"fmt"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
)

// Result is the search response, matching catalog-api's SearchResult.
type Result struct {
	Hits   []catalog.Product `json:"hits"`
	Total  int               `json:"total"`
	Facets Facets            `json:"facets"`
}

// Facets are counts over the filtered results.
type Facets struct {
	Category []Bucket      `json:"category"`
	Brand    []Bucket      `json:"brand"`
	Price    []PriceBucket `json:"price"`
}

// Bucket is one facet value and how many results have it.
type Bucket struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

// PriceBucket is a price range in cents: From inclusive, To exclusive. A nil
// end is open.
type PriceBucket struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
	From  *int   `json:"from,omitempty"`
	To    *int   `json:"to,omitempty"`
}

type rawResponse struct {
	Hits struct {
		Total struct {
			Value int `json:"value"`
		} `json:"total"`
		Hits []struct {
			Source catalog.Doc `json:"_source"`
		} `json:"hits"`
	} `json:"hits"`
	Aggregations struct {
		Category rawBuckets `json:"category"`
		Brand    rawBuckets `json:"brand"`
		Price    rawBuckets `json:"price"`
	} `json:"aggregations"`
}

type rawBuckets struct {
	Buckets []struct {
		Key      string   `json:"key"`
		DocCount int      `json:"doc_count"`
		From     *float64 `json:"from"` // OpenSearch sends 10000.0
		To       *float64 `json:"to"`
	} `json:"buckets"`
}

// ParseResult turns an OpenSearch search response body into a Result.
// Slices are never nil, so the JSON has [] rather than null.
func ParseResult(body []byte) (Result, error) {
	var raw rawResponse
	if err := json.Unmarshal(body, &raw); err != nil {
		return Result{}, fmt.Errorf("parse search response: %w", err)
	}
	r := Result{
		Hits:  make([]catalog.Product, 0, len(raw.Hits.Hits)),
		Total: raw.Hits.Total.Value,
		Facets: Facets{
			Category: terms(raw.Aggregations.Category),
			Brand:    terms(raw.Aggregations.Brand),
			Price:    make([]PriceBucket, 0, len(raw.Aggregations.Price.Buckets)),
		},
	}
	for _, h := range raw.Hits.Hits {
		r.Hits = append(r.Hits, catalog.FromDoc(h.Source))
	}
	for _, b := range raw.Aggregations.Price.Buckets {
		r.Facets.Price = append(r.Facets.Price, PriceBucket{Key: b.Key, Count: b.DocCount, From: toInt(b.From), To: toInt(b.To)})
	}
	return r, nil
}

func terms(raw rawBuckets) []Bucket {
	out := make([]Bucket, 0, len(raw.Buckets))
	for _, b := range raw.Buckets {
		out = append(out, Bucket{Key: b.Key, Count: b.DocCount})
	}
	return out
}

func toInt(f *float64) *int {
	if f == nil {
		return nil
	}
	n := int(*f)
	return &n
}
