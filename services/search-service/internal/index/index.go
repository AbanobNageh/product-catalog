// Package index owns the products index: its mapping, creating it with its
// alias on startup, and the readiness check. All reads and writes go through
// the alias, so a later reindex can build products-v2 and swap the alias.
package index

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/opensearch-project/opensearch-go/v5"
	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

// callTimeout bounds each OpenSearch call made here.
const callTimeout = 2 * time.Second

// Names are the first concrete index, the live alias in front of it, and the
// build alias that points at the index a reindex is building (ADR-0007).
// Tests use throwaway names so they never touch the real index.
type Names struct {
	Index      string
	Alias      string
	BuildAlias string
}

// Default is the index the service runs on.
var Default = Names{Index: "products-v1", Alias: "products", BuildAlias: "products-build"}

// ErrAliasMissing means the alias doesn't exist, so search and writes can't
// work. Callers turn it into a 503.
var ErrAliasMissing = errors.New("search alias missing")

// Body is the create-index request: settings, mapping and the alias, so the
// index and its alias appear in one atomic call.
func Body(alias string) []byte {
	return body(alias, "", "")
}

// body is Body with extra index settings, given as JSON members that follow
// a comma, and the alias's properties, given as JSON members.
func body(alias, extraSettings, aliasProps string) []byte {
	return fmt.Appendf(nil, `{
  "settings": {"number_of_shards": 1, "number_of_replicas": 0%s},
  "mappings": {
    "dynamic": "strict",
    "properties": {
      "id":          {"type": "keyword"},
      "sku":         {"type": "keyword"},
      "name":        {"type": "text", "fields": {"keyword": {"type": "keyword", "ignore_above": 256}}},
      "description": {"type": "text"},
      "category":    {"type": "keyword"},
      "brand":       {"type": "keyword"},
      "price_cents": {"type": "integer"},
      "currency":    {"type": "keyword"},
      "stock":       {"type": "integer"},
      "in_stock":    {"type": "boolean"},
      "created_at":  {"type": "date"},
      "updated_at":  {"type": "date"}
    }
  },
  "aliases": {%q: {%s}}
}`, extraSettings, alias, aliasProps)
}

// Ensure makes sure the alias exists, creating the index with it if needed.
// It is safe to run from several replicas at once: losing the race to create
// the index counts as success.
func Ensure(ctx context.Context, c *opensearchapi.Client, n Names) error {
	ok, err := aliasExists(ctx, c, n.Alias)
	if err != nil || ok {
		return err
	}

	exists, err := indexExists(ctx, c, n.Index)
	if err != nil {
		return err
	}
	if !exists {
		cctx, cancel := context.WithTimeout(ctx, callTimeout)
		defer cancel()
		resp, err := c.Indices.Create(cctx, opensearchapi.IndicesCreateReq{
			Index:      n.Index,
			BodyReader: bytes.NewReader(Body(n.Alias)),
		})
		switch {
		case err == nil:
			return nil
		case osclient.ErrorType(err) == "resource_already_exists_exception":
			// Another replica created it first; fall through and check the alias.
		default:
			return fmt.Errorf("create index %s: %w", n.Index, osclient.Classify(osclient.Raw(resp), err))
		}
		if ok, err := aliasExists(ctx, c, n.Alias); err != nil || ok {
			return err
		}
	}

	cctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	resp, err := c.Indices.PutAlias(cctx, opensearchapi.IndicesPutAliasReq{Name: n.Alias, Indices: []string{n.Index}})
	if err != nil {
		return fmt.Errorf("put alias %s: %w", n.Alias, osclient.Classify(osclient.Raw(resp), err))
	}
	return nil
}

// Ready reports whether OpenSearch answers and the alias exists.
func Ready(ctx context.Context, c *opensearchapi.Client, n Names) error {
	ok, err := aliasExists(ctx, c, n.Alias)
	if err != nil {
		return err
	}
	if !ok {
		return ErrAliasMissing
	}
	return nil
}

// WaitFor calls try every interval until it succeeds, returns an error that
// isn't osclient.ErrUnavailable, or max has passed. It is only for startup,
// when OpenSearch may still be booting; nothing else retries.
func WaitFor(ctx context.Context, try func(context.Context) error, every, max time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, max)
	defer cancel()
	for {
		err := try(ctx)
		if err == nil || !errors.Is(err, osclient.ErrUnavailable) {
			return err
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("gave up after %v: %w", max, err)
		case <-time.After(every):
		}
	}
}

func aliasExists(ctx context.Context, c *opensearchapi.Client, alias string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	resp, err := c.Indices.ExistsAlias(ctx, &opensearchapi.IndicesExistsAliasReq{Name: []string{alias}})
	return found(resp, err, "alias "+alias)
}

func indexExists(ctx context.Context, c *opensearchapi.Client, index string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	resp, err := c.Indices.Exists(ctx, &opensearchapi.IndicesExistsReq{Indices: []string{index}})
	return found(resp, err, "index "+index)
}

// found reads a HEAD response: 200 is true, 404 is false, anything else is an
// error. v5 returns a plain error for a 404, so the status decides.
func found(resp *opensearch.Response, err error, what string) (bool, error) {
	switch osclient.StatusOf(resp, err) {
	case 200:
		return true, nil
	case 404:
		return false, nil
	}
	if err == nil {
		err = fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return false, fmt.Errorf("check %s: %w", what, osclient.Classify(resp, err))
}
