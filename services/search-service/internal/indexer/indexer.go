// Package indexer writes products to the search index. It is kept apart from
// the HTTP handlers (ADR-0001), so a Part 4 queue consumer can call it too.
//
// Every write is versioned by updatedAt (version_type=external_gte), so a
// write that arrives late can't replace newer data, and every write requires
// the alias, so a missing alias can never be replaced by an auto-created
// index of the same name.
package indexer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

const (
	writeTimeout = 2 * time.Second
	bulkTimeout  = 10 * time.Second
)

// Outcome says what a single upsert did.
type Outcome string

const (
	Indexed Outcome = "indexed"
	// Skipped means the index already holds a newer version of the product.
	Skipped Outcome = "skipped"
)

// BulkResult reports a bulk call item by item. Failed lists what to reindex.
type BulkResult struct {
	Indexed int       `json:"indexed"`
	Skipped int       `json:"skipped"`
	Failed  []Failure `json:"failed"`
}

// Failure is one product the bulk call couldn't index.
type Failure struct {
	ID     string `json:"id"`
	Status int    `json:"status"`
	Reason string `json:"reason"`
}

// Indexer writes through one alias.
type Indexer struct {
	c     *opensearchapi.Client
	alias string
	log   *slog.Logger
}

// New returns an Indexer that writes through alias.
func New(c *opensearchapi.Client, alias string, log *slog.Logger) *Indexer {
	return &Indexer{c: c, alias: alias, log: log}
}

// Upsert indexes or replaces p and waits until it is searchable. A stale
// write (older updatedAt than the stored one) is skipped, not an error.
func (x *Indexer) Upsert(ctx context.Context, p catalog.Product) (Outcome, error) {
	doc, err := json.Marshal(catalog.ToDoc(p))
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	resp, err := x.c.Doc.Index(ctx, opensearchapi.IndexReq{
		Index: x.alias,
		ID:    p.ID,
		Body:  bytes.NewReader(doc),
		Params: &opensearchapi.IndexParams{
			Version:      new(int(p.Version())),
			VersionType:  opensearchapi.VersionTypeExternalGte,
			Refresh:      "wait_for",
			RequireAlias: new(true),
		},
	})
	switch osclient.ErrorType(err) {
	case "":
	case "version_conflict_engine_exception":
		x.log.Info("stale upsert skipped", "id", p.ID, "version", p.Version())
		return Skipped, nil
	case "index_not_found_exception":
		return "", fmt.Errorf("upsert %s: %w", p.ID, index.ErrAliasMissing)
	}
	if err != nil {
		return "", fmt.Errorf("upsert %s: %w", p.ID, osclient.Classify(osclient.Raw(resp), err))
	}
	return Indexed, nil
}

// Delete removes one product and waits until it is gone from search. Deleting
// a product that isn't indexed succeeds. It goes through _bulk because the
// single-document delete API would auto-create a missing index.
func (x *Indexer) Delete(ctx context.Context, id string) error {
	action, err := json.Marshal(map[string]any{"delete": map[string]string{"_id": id}})
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	resp, err := x.bulk(ctx, append(action, '\n'), "wait_for")
	if err != nil {
		return fmt.Errorf("delete %s: %w", id, err)
	}
	if len(resp.Items) != 1 || resp.Items[0].Delete == nil {
		return fmt.Errorf("delete %s: unexpected bulk response with %d items", id, len(resp.Items))
	}
	if err := deleteItemError(*resp.Items[0].Delete); err != nil {
		return fmt.Errorf("delete %s: %w", id, err)
	}
	return nil
}

// Bulk indexes many products without waiting for a refresh. Invalid products
// and items OpenSearch rejects are reported in Failed; the rest are indexed.
func (x *Indexer) Bulk(ctx context.Context, ps []catalog.Product) (BulkResult, error) {
	body, invalid := bulkLines(ps)
	result := BulkResult{Failed: []Failure{}}
	if len(body) > 0 {
		ctx, cancel := context.WithTimeout(ctx, bulkTimeout)
		defer cancel()
		resp, err := x.bulk(ctx, body, "")
		if err != nil {
			return BulkResult{}, fmt.Errorf("bulk: %w", err)
		}
		if result, err = ParseBulkItems(resp.Items); err != nil {
			return BulkResult{}, fmt.Errorf("bulk: %w", err)
		}
	}
	result.Failed = append(result.Failed, invalid...)
	return result, nil
}

// bulk sends a _bulk request through the alias. Partial item failures are
// not an error here: the caller reads the items.
func (x *Indexer) bulk(ctx context.Context, body []byte, refresh string) (*opensearchapi.BulkResp, error) {
	resp, err := x.c.Doc.Bulk(ctx, opensearchapi.BulkReq{
		Index:  x.alias,
		Body:   bytes.NewReader(body),
		Params: &opensearchapi.BulkParams{RequireAlias: new(true), Refresh: refresh},
	})
	if _, partial := errors.AsType[*opensearchapi.PartialBulkError](err); partial && resp != nil {
		return resp, nil
	}
	if err != nil {
		return nil, osclient.Classify(osclient.Raw(resp), err)
	}
	return resp, nil
}

// bulkLines builds the NDJSON body for the valid products and reports the
// invalid ones as 400 failures. Invalid items must never reach OpenSearch: it
// validates the whole request first, so one bad id would reject the batch.
func bulkLines(ps []catalog.Product) ([]byte, []Failure) {
	var buf bytes.Buffer
	invalid := []Failure{}
	enc := json.NewEncoder(&buf) // Encode adds the newline NDJSON needs
	enc.SetEscapeHTML(false)
	for _, p := range ps {
		if err := p.Validate(); err != nil {
			invalid = append(invalid, Failure{ID: p.ID, Status: 400, Reason: err.Error()})
			continue
		}
		action := map[string]any{"index": map[string]any{
			"_id": p.ID, "version": p.Version(), "version_type": "external_gte",
		}}
		_ = enc.Encode(action)
		_ = enc.Encode(catalog.ToDoc(p))
	}
	return buf.Bytes(), invalid
}

// ParseBulkItems turns bulk index items into a BulkResult. A version conflict
// means the index already has newer data, so it counts as skipped. A missing
// index is a service problem, not a product one, so it fails the whole call.
func ParseBulkItems(items []opensearchapi.BulkItem) (BulkResult, error) {
	r := BulkResult{Failed: []Failure{}}
	for _, it := range items {
		item := it.Index
		if item == nil {
			continue
		}
		switch {
		case item.Status >= 200 && item.Status < 300:
			r.Indexed++
		case item.Error != nil && item.Error.Type == "version_conflict_engine_exception":
			r.Skipped++
		case item.Error != nil && item.Error.Type == "index_not_found_exception":
			return BulkResult{}, index.ErrAliasMissing
		default:
			r.Failed = append(r.Failed, Failure{ID: deref(item.ID), Status: item.Status, Reason: reason(item.Error)})
		}
	}
	return r, nil
}

// deleteItemError maps one bulk delete item to an error. A document that was
// already gone is fine; a missing index means the alias is gone.
func deleteItemError(item opensearchapi.BulkRespItem) error {
	switch {
	case item.Status >= 200 && item.Status < 300:
		return nil
	case item.Status == 404 && item.Error == nil:
		return nil
	case item.Error != nil && item.Error.Type == "index_not_found_exception":
		return index.ErrAliasMissing
	}
	return fmt.Errorf("status %d: %s", item.Status, reason(item.Error))
}

func reason(e *opensearchapi.ErrorCause) string {
	if e == nil {
		return "unknown error"
	}
	if e.Reason == nil {
		return e.Type
	}
	return e.Type + ": " + *e.Reason
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
