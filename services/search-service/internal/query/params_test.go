package query

import (
	"net/url"
	"strings"
	"testing"
)

func parse(t *testing.T, raw string) (Params, error) {
	t.Helper()
	v, err := url.ParseQuery(raw)
	if err != nil {
		t.Fatal(err)
	}
	return ParseParams(v)
}

func TestParseParamsDefaults(t *testing.T) {
	got, err := parse(t, "")
	if err != nil {
		t.Fatal(err)
	}
	if got.Sort != Relevance || got.Page != 1 || got.Size != 20 || got.Q != "" ||
		got.MinPrice != nil || got.MaxPrice != nil || got.InStock != nil || got.Category != "" || got.Brand != "" {
		t.Fatalf("got %+v", got)
	}
}

func TestParseParamsValues(t *testing.T) {
	got, err := parse(t, "q=++phone+&category=electronics&brand=Acme&minPrice=10000&maxPrice=50000&inStock=false&maxStock=5&sort=stock_asc&page=3&size=100")
	if err != nil {
		t.Fatal(err)
	}
	if got.Q != "phone" || got.Category != "electronics" || got.Brand != "Acme" {
		t.Fatalf("strings %+v", got)
	}
	if got.MinPrice == nil || *got.MinPrice != 10000 || got.MaxPrice == nil || *got.MaxPrice != 50000 {
		t.Fatalf("prices %v %v", got.MinPrice, got.MaxPrice)
	}
	if got.InStock == nil || *got.InStock {
		t.Fatalf("inStock %v", got.InStock)
	}
	if got.MaxStock == nil || *got.MaxStock != 5 {
		t.Fatalf("maxStock %v", got.MaxStock)
	}
	if got.Sort != StockAsc || got.Page != 3 || got.Size != 100 {
		t.Fatalf("paging %+v", got)
	}
}

func TestParseParamsBlankMeansUnset(t *testing.T) {
	got, err := parse(t, "q=&category=&brand=&minPrice=&maxPrice=&inStock=&maxStock=&sort=&page=&size=")
	if err != nil {
		t.Fatal(err)
	}
	if got.Category != "" || got.MinPrice != nil || got.InStock != nil || got.MaxStock != nil || got.Sort != Relevance || got.Page != 1 || got.Size != 20 {
		t.Fatalf("got %+v", got)
	}
	if got, err := parse(t, "maxStock=%20"); err != nil || got.MaxStock != nil {
		t.Fatalf("maxStock=%%20: %v %v", got.MaxStock, err)
	}
}

// maxStock=0 is a real filter (out of stock only), not "no filter".
func TestParseParamsAcceptsMaxStockZero(t *testing.T) {
	got, err := parse(t, "maxStock=0")
	if err != nil || got.MaxStock == nil || *got.MaxStock != 0 {
		t.Fatalf("maxStock=0: %v %v", got.MaxStock, err)
	}
}

func TestParseParamsAllowsA200CharacterQuery(t *testing.T) {
	q := strings.Repeat("é", 200) // characters, not bytes
	got, err := parse(t, "q="+url.QueryEscape(q))
	if err != nil || got.Q != q {
		t.Fatalf("%v", err)
	}
}

func TestParseParamsAcceptsTheLastAllowedPage(t *testing.T) {
	if _, err := parse(t, "page=500&size=20"); err != nil {
		t.Fatalf("page 500 x 20 = 10000 is allowed: %v", err)
	}
	if got, err := parse(t, "inStock=true"); err != nil || got.InStock == nil || !*got.InStock {
		t.Fatalf("inStock=true: %v %v", got.InStock, err)
	}
}

func TestParseParamsErrors(t *testing.T) {
	tests := []struct {
		query string
		want  []string
	}{
		{"minPrice=50000&maxPrice=10000", []string{"minPrice"}},
		{"minPrice=-1", []string{"minPrice"}},
		{"minPrice=1e3", []string{"minPrice"}},
		{"maxPrice=10.5", []string{"maxPrice"}},
		{"maxPrice=2147483648", []string{"maxPrice"}},
		{"inStock=yes", []string{"inStock"}},
		{"maxStock=-1", []string{"maxStock"}},
		{"maxStock=abc", []string{"maxStock"}},
		{"maxStock=2147483648", []string{"maxStock"}},
		{"maxStock=1.5", []string{"maxStock"}},
		// The message lists the allowed sorts, so it must name the new one.
		{"sort=cheap", []string{"sort", "stock_asc"}},
		{"page=0", []string{"page"}},
		{"size=0", []string{"size"}},
		{"size=101", []string{"size"}},
		{"page=501&size=20", []string{"10000"}},
		{"sort=cheap&size=101&inStock=yes", []string{"sort", "size", "inStock"}},
		// Review finding: a very long fuzzy q makes OpenSearch fail with
		// too_many_clauses, which surfaced as a 500.
		{"q=" + strings.Repeat("phone+", 40), []string{"q", "200"}},
	}
	for _, tt := range tests {
		t.Run(tt.query, func(t *testing.T) {
			_, err := parse(t, tt.query)
			if err == nil {
				t.Fatal("expected an error")
			}
			for _, w := range tt.want {
				if !strings.Contains(err.Error(), w) {
					t.Errorf("error %q does not mention %s", err, w)
				}
			}
		})
	}
}
