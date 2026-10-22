package indexer

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
)

func product(id string) catalog.Product {
	return catalog.Product{
		ID: id, SKU: "SKU-" + id, Name: "Phone " + id, Description: "d",
		Category: "electronics", Brand: "Acme", PriceCents: 10000, Currency: "EGP",
		Stock: 1, CreatedAt: "2026-10-20T09:00:00Z", UpdatedAt: "2026-10-21T10:00:00.123Z",
	}
}

func item(id string, status int, errType string) opensearchapi.BulkItem {
	it := &opensearchapi.BulkRespItem{ID: &id, Status: status}
	if errType != "" {
		reason := errType + " reason"
		it.Error = &opensearchapi.ErrorCause{Type: errType, Reason: &reason}
	}
	return opensearchapi.BulkItem{Index: it}
}

func TestParseBulkItems(t *testing.T) {
	got, err := ParseBulkItems([]opensearchapi.BulkItem{
		item("a", 201, ""),
		item("b", 200, ""),
		item("c", 409, "version_conflict_engine_exception"),
		item("d", 400, "mapper_parsing_exception"),
	})
	if err != nil {
		t.Fatalf("ParseBulkItems: %v", err)
	}
	want := BulkResult{Indexed: 2, Skipped: 1, Failed: []Failure{{ID: "d", Status: 400, Reason: "mapper_parsing_exception: mapper_parsing_exception reason"}}}
	if got.Indexed != want.Indexed || got.Skipped != want.Skipped || len(got.Failed) != 1 || got.Failed[0] != want.Failed[0] {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestParseBulkItemsTreatsAMissingAliasAsUnavailable(t *testing.T) {
	_, err := ParseBulkItems([]opensearchapi.BulkItem{item("a", 404, "index_not_found_exception")})
	if !errors.Is(err, index.ErrAliasMissing) {
		t.Fatalf("got %v", err)
	}
}

func TestBulkLines(t *testing.T) {
	bad := product("bad")
	bad.Name = ""
	body, invalid := bulkLines([]catalog.Product{product("a"), bad, product("b")})

	if len(invalid) != 1 || invalid[0].ID != "bad" || invalid[0].Status != 400 || !strings.Contains(invalid[0].Reason, "name") {
		t.Fatalf("invalid %+v", invalid)
	}
	if !bytes.HasSuffix(body, []byte("\n")) {
		t.Fatal("a bulk body must end with a newline")
	}

	var lines []map[string]any
	sc := bufio.NewScanner(bytes.NewReader(body))
	for sc.Scan() {
		var m map[string]any
		if err := json.Unmarshal(sc.Bytes(), &m); err != nil {
			t.Fatalf("line %q: %v", sc.Text(), err)
		}
		lines = append(lines, m)
	}
	if len(lines) != 4 {
		t.Fatalf("got %d lines, want 4 (action + doc for each valid product)", len(lines))
	}
	action := lines[0]["index"].(map[string]any)
	if action["_id"] != "a" || action["version"] != float64(1792576800123) || action["version_type"] != "external_gte" {
		t.Fatalf("action %v", action)
	}
	if lines[1]["price_cents"] != float64(10000) || lines[1]["in_stock"] != true {
		t.Fatalf("doc %v", lines[1])
	}
	if lines[2]["index"].(map[string]any)["_id"] != "b" {
		t.Fatalf("second action %v", lines[2])
	}
}

func TestBulkLinesAllInvalid(t *testing.T) {
	bad := product("x")
	bad.SKU = ""
	body, invalid := bulkLines([]catalog.Product{bad})
	if len(body) != 0 || len(invalid) != 1 {
		t.Fatalf("body %q invalid %+v", body, invalid)
	}
}

func TestDeleteItemError(t *testing.T) {
	notFound := "not_found"
	missingDoc := opensearchapi.BulkRespItem{Status: 404, Result: &notFound}
	if err := deleteItemError(missingDoc); err != nil {
		t.Fatalf("a missing document is fine, got %v", err)
	}
	deleted := "deleted"
	if err := deleteItemError(opensearchapi.BulkRespItem{Status: 200, Result: &deleted}); err != nil {
		t.Fatalf("got %v", err)
	}
	reason := "no such index"
	noIndex := opensearchapi.BulkRespItem{Status: 404, Error: &opensearchapi.ErrorCause{Type: "index_not_found_exception", Reason: &reason}}
	if err := deleteItemError(noIndex); !errors.Is(err, index.ErrAliasMissing) {
		t.Fatalf("a missing index must be ErrAliasMissing, got %v", err)
	}
	other := opensearchapi.BulkRespItem{Status: 400, Error: &opensearchapi.ErrorCause{Type: "illegal_argument_exception", Reason: &reason}}
	if err := deleteItemError(other); err == nil || !strings.Contains(err.Error(), "illegal_argument_exception") {
		t.Fatalf("got %v", err)
	}
}
