// Package searcher runs searches through the alias. The query itself is
// built and parsed by the pure query package.
package searcher

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/query"
)

const searchTimeout = 2 * time.Second

// Searcher searches one alias.
type Searcher struct {
	c     *opensearchapi.Client
	alias string
}

// New returns a Searcher over alias.
func New(c *opensearchapi.Client, alias string) *Searcher {
	return &Searcher{c: c, alias: alias}
}

// Search runs p and returns hits, total and facets.
func (s *Searcher) Search(ctx context.Context, p query.Params) (query.Result, error) {
	body, err := json.Marshal(query.Build(p))
	if err != nil {
		return query.Result{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, searchTimeout)
	defer cancel()
	resp, err := s.c.Search(ctx, &opensearchapi.SearchReq{
		Indices:    []string{s.alias},
		BodyReader: bytes.NewReader(body),
	})
	if osclient.ErrorType(err) == "index_not_found_exception" {
		return query.Result{}, fmt.Errorf("search: %w", index.ErrAliasMissing)
	}
	if err != nil {
		return query.Result{}, fmt.Errorf("search: %w", osclient.Classify(osclient.Raw(resp), err))
	}
	raw, err := io.ReadAll(resp.RawBody())
	if err != nil {
		return query.Result{}, fmt.Errorf("search: read response: %w", err)
	}
	return query.ParseResult(raw)
}
