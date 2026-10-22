//go:build integration

package index_test

import (
	"context"
	"errors"
	"testing"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/ittest"
)

func TestEnsureIsIdempotentAndReady(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Names(t, c)

	if err := index.Ensure(ctx, c, n); err != nil {
		t.Fatalf("first Ensure: %v", err)
	}
	if err := index.Ensure(ctx, c, n); err != nil {
		t.Fatalf("second Ensure: %v", err)
	}
	if err := index.Ready(ctx, c, n); err != nil {
		t.Fatalf("Ready: %v", err)
	}

	resp, err := c.Indices.GetAlias(ctx, &opensearchapi.IndicesGetAliasReq{Name: []string{n.Alias}})
	if err != nil {
		t.Fatalf("get alias: %v", err)
	}
	if _, ok := resp.Entries[n.Index]; !ok {
		t.Fatalf("alias %s does not point at %s: %+v", n.Alias, n.Index, resp.Entries)
	}
}

func TestEnsureAddsAMissingAliasToAnExistingIndex(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Names(t, c)
	if _, err := c.Indices.Create(ctx, opensearchapi.IndicesCreateReq{Index: n.Index}); err != nil {
		t.Fatalf("create bare index: %v", err)
	}
	if err := index.Ensure(ctx, c, n); err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	if err := index.Ready(ctx, c, n); err != nil {
		t.Fatalf("Ready: %v", err)
	}
}

func TestReadyReportsAMissingAlias(t *testing.T) {
	c := ittest.Client(t)
	n := ittest.Names(t, c)
	if err := index.Ready(context.Background(), c, n); !errors.Is(err, index.ErrAliasMissing) {
		t.Fatalf("got %v", err)
	}
}
