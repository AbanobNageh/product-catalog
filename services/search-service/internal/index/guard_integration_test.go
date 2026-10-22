//go:build integration

package index_test

import (
	"context"
	"testing"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/ittest"
)

func TestGuardPassesOnCompose(t *testing.T) {
	c := ittest.Client(t)
	ctx := context.Background()

	if err := index.CheckAutoCreateGuard(ctx, c); err != nil {
		t.Fatalf("CheckAutoCreateGuard: %v", err)
	}
	resp, err := c.Indices.Exists(ctx, &opensearchapi.IndicesExistsReq{Indices: []string{"products-autocreate-probe"}})
	if err == nil && resp != nil && resp.StatusCode == 200 {
		t.Fatal("probe index exists after the guard ran")
	}
}
