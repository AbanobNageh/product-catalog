// Package catalog defines a product as catalog-api sends it (Product) and as
// it is stored in the search index (Doc).
package catalog

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"time"
)

// maxIDBytes is OpenSearch's document id limit. A longer id would make
// OpenSearch reject a whole bulk request, not just that item.
const maxIDBytes = 512

// Product matches catalog-api's ProductResponse field for field. The dates
// stay strings so a search hit returns exactly what catalog-api sent.
type Product struct {
	ID          string `json:"id"`
	SKU         string `json:"sku"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Brand       string `json:"brand"`
	PriceCents  int    `json:"priceCents"`
	Currency    string `json:"currency"`
	Stock       int    `json:"stock"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

// Doc is the indexed form of a product: snake_case, plus the derived in_stock.
type Doc struct {
	ID          string `json:"id"`
	SKU         string `json:"sku"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
	Brand       string `json:"brand"`
	PriceCents  int    `json:"price_cents"`
	Currency    string `json:"currency"`
	Stock       int    `json:"stock"`
	InStock     bool   `json:"in_stock"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

// DecodeProduct parses one product from JSON and validates it. Unlike a plain
// json.Unmarshal into Product, a missing or null priceCents or stock is an
// error, not a silent 0 (which would index the product as free and out of
// stock).
func DecodeProduct(raw []byte) (Product, error) {
	var in struct {
		Product
		PriceCents *int `json:"priceCents"`
		Stock      *int `json:"stock"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return Product{}, fmt.Errorf("invalid product: %w", err)
	}
	p := in.Product
	var errs []error
	if in.PriceCents == nil {
		errs = append(errs, errors.New("priceCents is required"))
	} else {
		p.PriceCents = *in.PriceCents
	}
	if in.Stock == nil {
		errs = append(errs, errors.New("stock is required"))
	} else {
		p.Stock = *in.Stock
	}
	if err := errors.Join(append(errs, p.Validate())...); err != nil {
		return Product{}, err
	}
	return p, nil
}

// Validate returns one error listing every problem with p, or nil.
func (p Product) Validate() error {
	var errs []error
	required := []struct{ name, value string }{
		{"id", p.ID}, {"sku", p.SKU}, {"name", p.Name},
		{"category", p.Category}, {"brand", p.Brand}, {"currency", p.Currency},
	}
	for _, f := range required {
		if f.value == "" {
			errs = append(errs, fmt.Errorf("%s is required", f.name))
		}
	}
	if len(p.ID) > maxIDBytes {
		errs = append(errs, fmt.Errorf("id must be at most %d bytes", maxIDBytes))
	}
	if p.PriceCents < 0 || p.PriceCents > math.MaxInt32 {
		errs = append(errs, fmt.Errorf("priceCents must be 0-%d", math.MaxInt32))
	}
	if p.Stock < 0 || p.Stock > math.MaxInt32 {
		errs = append(errs, fmt.Errorf("stock must be 0-%d", math.MaxInt32))
	}
	if _, err := time.Parse(time.RFC3339, p.CreatedAt); err != nil {
		errs = append(errs, errors.New("createdAt must be an RFC 3339 timestamp"))
	}
	if t, err := time.Parse(time.RFC3339, p.UpdatedAt); err != nil {
		errs = append(errs, errors.New("updatedAt must be an RFC 3339 timestamp"))
	} else if t.Before(time.Unix(0, 0)) {
		// The version is updatedAt in ms, and OpenSearch rejects negative versions.
		errs = append(errs, errors.New("updatedAt must not be before 1970"))
	}
	return errors.Join(errs...)
}

// Version is the external index version: updatedAt in Unix milliseconds, so
// an older write can never replace a newer one. Call it on a validated product.
func (p Product) Version() int64 {
	t, _ := time.Parse(time.RFC3339, p.UpdatedAt)
	return t.UnixMilli()
}

// ToDoc converts p to its indexed form.
func ToDoc(p Product) Doc {
	return Doc{
		ID: p.ID, SKU: p.SKU, Name: p.Name, Description: p.Description,
		Category: p.Category, Brand: p.Brand, PriceCents: p.PriceCents,
		Currency: p.Currency, Stock: p.Stock, InStock: p.Stock > 0,
		CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt,
	}
}

// FromDoc converts an indexed document back to the API shape.
func FromDoc(d Doc) Product {
	return Product{
		ID: d.ID, SKU: d.SKU, Name: d.Name, Description: d.Description,
		Category: d.Category, Brand: d.Brand, PriceCents: d.PriceCents,
		Currency: d.Currency, Stock: d.Stock,
		CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt,
	}
}
