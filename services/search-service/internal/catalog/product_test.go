package catalog

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
)

func valid() Product {
	return Product{
		ID:          "0b6f1c1e-6a4e-4d43-9a57-3c1a9e2f7d10",
		SKU:         "PHN-ACME-001",
		Name:        "Acme Phone 12",
		Description: "A phone",
		Category:    "electronics",
		Brand:       "Acme",
		PriceCents:  1999900,
		Currency:    "EGP",
		Stock:       5,
		CreatedAt:   "2026-10-20T09:00:00.000Z",
		UpdatedAt:   "2026-10-21T10:00:00.123Z",
	}
}

func TestValidateAcceptsAValidProduct(t *testing.T) {
	p := valid()
	if err := p.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	p.Description = ""
	if err := p.Validate(); err != nil {
		t.Fatalf("an empty description should be allowed: %v", err)
	}
}

func TestValidateRejects(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Product)
		field  string
	}{
		{"missing id", func(p *Product) { p.ID = "" }, "id"},
		{"missing sku", func(p *Product) { p.SKU = "" }, "sku"},
		{"missing name", func(p *Product) { p.Name = "" }, "name"},
		{"missing category", func(p *Product) { p.Category = "" }, "category"},
		{"missing brand", func(p *Product) { p.Brand = "" }, "brand"},
		{"missing currency", func(p *Product) { p.Currency = "" }, "currency"},
		{"negative price", func(p *Product) { p.PriceCents = -1 }, "priceCents"},
		{"price over int4", func(p *Product) { p.PriceCents = 2147483648 }, "priceCents"},
		{"negative stock", func(p *Product) { p.Stock = -1 }, "stock"},
		{"stock over int4", func(p *Product) { p.Stock = 2147483648 }, "stock"},
		{"bad createdAt", func(p *Product) { p.CreatedAt = "last week" }, "createdAt"},
		{"bad updatedAt", func(p *Product) { p.UpdatedAt = "yesterday" }, "updatedAt"},
		{"updatedAt before 1970", func(p *Product) { p.UpdatedAt = "1969-12-31T23:59:59Z" }, "updatedAt"},
		{"id over 512 bytes", func(p *Product) { p.ID = strings.Repeat("a", 513) }, "id"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := valid()
			tt.mutate(&p)
			err := p.Validate()
			if err == nil {
				t.Fatal("expected an error")
			}
			if !strings.Contains(err.Error(), tt.field) {
				t.Fatalf("error %q does not name %s", err, tt.field)
			}
		})
	}
}

func TestDecodeProduct(t *testing.T) {
	good, _ := json.Marshal(valid())
	p, err := DecodeProduct(good)
	if err != nil || p != valid() {
		t.Fatalf("got %+v, %v", p, err)
	}

	base := `"id":"a","sku":"s","name":"n","description":"","category":"c","brand":"b","currency":"EGP","createdAt":"2026-10-20T09:00:00Z","updatedAt":"2026-10-21T10:00:00Z"`
	tests := []struct {
		name string
		json string
		says string
	}{
		{"priceCents missing", `{` + base + `,"stock":1}`, "priceCents"},
		{"priceCents null", `{` + base + `,"priceCents":null,"stock":1}`, "priceCents"},
		{"stock missing", `{` + base + `,"priceCents":1}`, "stock"},
		{"stock as a string", `{` + base + `,"priceCents":1,"stock":"5"}`, "stock"},
		{"priceCents as a float", `{` + base + `,"priceCents":1e3,"stock":1}`, "priceCents"},
		{"not an object", `[1]`, "product"},
		{"invalid as well as missing", `{"id":"a","stock":1}`, "sku"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := DecodeProduct([]byte(tt.json))
			if err == nil || !strings.Contains(err.Error(), tt.says) {
				t.Fatalf("error %v does not mention %s", err, tt.says)
			}
		})
	}
}

func TestDecodeProductBothNumbersMissing(t *testing.T) {
	_, err := DecodeProduct([]byte(`{"id":"a"}`))
	for _, f := range []string{"priceCents", "stock"} {
		if err == nil || !strings.Contains(err.Error(), f) {
			t.Errorf("error %v does not mention %s", err, f)
		}
	}
}

func TestValidateAllowsA512ByteID(t *testing.T) {
	p := valid()
	p.ID = strings.Repeat("a", 512)
	if err := p.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
}

func TestValidateListsEveryProblem(t *testing.T) {
	err := Product{}.Validate()
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, f := range []string{"id", "sku", "name", "category", "brand", "currency", "createdAt", "updatedAt"} {
		if !strings.Contains(err.Error(), f) {
			t.Errorf("error does not name %s: %v", f, err)
		}
	}
}

func TestVersionIsUpdatedAtInUnixMillis(t *testing.T) {
	if got := valid().Version(); got != 1792576800123 {
		t.Fatalf("got %d", got)
	}
}

func TestToDocDerivesInStock(t *testing.T) {
	p := valid()
	p.Stock = 0
	if ToDoc(p).InStock {
		t.Fatal("stock 0 should not be in stock")
	}
	p.Stock = 1
	if !ToDoc(p).InStock {
		t.Fatal("stock 1 should be in stock")
	}
}

func TestDocRoundTrip(t *testing.T) {
	p := valid()
	if got := FromDoc(ToDoc(p)); got != p {
		t.Fatalf("got %+v, want %+v", got, p)
	}
}

func jsonKeys(t *testing.T, v any) []string {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}

func TestProductJSONMatchesProductResponse(t *testing.T) {
	want := []string{"brand", "category", "createdAt", "currency", "description", "id", "name", "priceCents", "sku", "stock", "updatedAt"}
	if got := jsonKeys(t, valid()); !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestDocJSONIsSnakeCase(t *testing.T) {
	want := []string{"brand", "category", "created_at", "currency", "description", "id", "in_stock", "name", "price_cents", "sku", "stock", "updated_at"}
	if got := jsonKeys(t, ToDoc(valid())); !slices.Equal(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
