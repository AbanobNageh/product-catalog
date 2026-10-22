//go:build integration

// Package ittest holds helpers for integration tests against a real
// OpenSearch (the Compose one by default). Every test gets throwaway index
// names, and cleanup deletes only that index, never products-v1.
package ittest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

// Client connects to OPENSEARCH_URL, or http://localhost:9200.
func Client(t *testing.T) *opensearchapi.Client {
	t.Helper()
	url := os.Getenv("OPENSEARCH_URL")
	if url == "" {
		url = "http://localhost:9200"
	}
	c, err := osclient.New(url)
	if err != nil {
		t.Fatalf("client: %v", err)
	}
	t.Cleanup(func() { _ = c.Close() })
	return c
}

// Names returns unique index and alias names, deleting the index when the
// test ends. The index itself is not created.
func Names(t *testing.T, c *opensearchapi.Client) index.Names {
	t.Helper()
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	base := "it-" + hex.EncodeToString(b)
	n := index.Names{Index: base + "-v1", Alias: base}
	t.Cleanup(func() {
		_, _ = c.Indices.Delete(context.Background(), &opensearchapi.IndicesDeleteReq{Indices: []string{n.Index}})
	})
	return n
}

// Index returns throwaway names with the index and alias already created.
func Index(t *testing.T, c *opensearchapi.Client) index.Names {
	t.Helper()
	n := Names(t, c)
	if err := index.Ensure(context.Background(), c, n); err != nil {
		t.Fatalf("Ensure: %v", err)
	}
	return n
}
