// Package query turns search URL parameters into an OpenSearch request body
// and the OpenSearch response into the API result. It is pure (no I/O), so
// every rule is covered by table-driven tests.
package query

import (
	"errors"
	"fmt"
	"math"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Sort is the result order.
type Sort string

const (
	Relevance Sort = "relevance"
	PriceAsc  Sort = "price_asc"
	PriceDesc Sort = "price_desc"
	Newest    Sort = "newest"
	StockAsc  Sort = "stock_asc"
)

const (
	defaultSize = 20
	maxSize     = 100
	// maxWindow is OpenSearch's index.max_result_window: from + size beyond
	// it fails, so deep pages are rejected here with a clear 400.
	maxWindow = 10000
	// maxQueryChars keeps the fuzzy multi_match well under OpenSearch's
	// clause limit: around 1,500 words fails with too_many_clauses.
	maxQueryChars = 200
)

// Params is a validated search request. Nil pointers and empty strings mean
// "no filter".
type Params struct {
	Q        string
	Category string
	Brand    string
	MinPrice *int // cents, inclusive
	MaxPrice *int // cents, inclusive
	InStock  *bool
	MaxStock *int // inclusive
	Sort     Sort
	Page     int
	Size     int
}

var digits = regexp.MustCompile(`^\d+$`)

// ParseParams reads and validates the search query parameters. Blank values
// count as unset. The error names every bad parameter.
func ParseParams(v url.Values) (Params, error) {
	p := Params{
		Q:        strings.TrimSpace(v.Get("q")),
		Category: strings.TrimSpace(v.Get("category")),
		Brand:    strings.TrimSpace(v.Get("brand")),
		Sort:     Relevance,
		Page:     1,
		Size:     defaultSize,
	}
	var errs []error
	if n := utf8.RuneCountInString(p.Q); n > maxQueryChars {
		errs = append(errs, fmt.Errorf("q must be at most %d characters, got %d", maxQueryChars, n))
	}
	intParam := func(name string, min, max int) *int {
		s := strings.TrimSpace(v.Get(name))
		if s == "" {
			return nil
		}
		n, err := strconv.Atoi(s)
		if !digits.MatchString(s) || err != nil || n < min || n > max {
			errs = append(errs, fmt.Errorf("%s must be a whole number from %d to %d, got %q", name, min, max, s))
			return nil
		}
		return &n
	}

	p.MinPrice = intParam("minPrice", 0, math.MaxInt32)
	p.MaxPrice = intParam("maxPrice", 0, math.MaxInt32)
	if p.MinPrice != nil && p.MaxPrice != nil && *p.MinPrice > *p.MaxPrice {
		errs = append(errs, fmt.Errorf("minPrice (%d) must not be greater than maxPrice (%d)", *p.MinPrice, *p.MaxPrice))
	}

	switch s := strings.TrimSpace(v.Get("inStock")); s {
	case "":
	case "true", "false":
		b := s == "true"
		p.InStock = &b
	default:
		errs = append(errs, fmt.Errorf("inStock must be true or false, got %q", s))
	}
	p.MaxStock = intParam("maxStock", 0, math.MaxInt32)

	switch s := Sort(strings.TrimSpace(v.Get("sort"))); s {
	case "":
	case Relevance, PriceAsc, PriceDesc, Newest, StockAsc:
		p.Sort = s
	default:
		errs = append(errs, fmt.Errorf("sort must be relevance, price_asc, price_desc, newest or stock_asc, got %q", s))
	}

	if n := intParam("page", 1, math.MaxInt32); n != nil {
		p.Page = *n
	}
	if n := intParam("size", 1, maxSize); n != nil {
		p.Size = *n
	}
	if p.Page*p.Size > maxWindow {
		errs = append(errs, fmt.Errorf("page × size must be at most %d (page %d, size %d)", maxWindow, p.Page, p.Size))
	}

	if len(errs) > 0 {
		return Params{}, errors.Join(errs...)
	}
	return p, nil
}
