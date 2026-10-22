// Package indexer writes products to the search index. It is kept apart from
// the HTTP handlers (ADR-0001), so a Part 4 queue consumer can call it too.
//
// Every write is versioned by updatedAt (version_type=external_gte), so a
// write that arrives late can't replace newer data, and every write requires
// the alias, so a missing alias can never be replaced by an auto-created
// index of the same name. The one exception is BulkBuild, which writes into
// its build index by name; the auto-create guard keeps a deleted build from
// coming back. Deletes carry a version too, so their tombstone rejects an
// older copy that arrives later.
//
// While a reindex runs (ADR-0007), every single-product write goes to the
// build alias first and then to the live alias, so the edit reaches whichever
// index ends up live.
package indexer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/opensearch-project/opensearch-go/v5"
	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

const (
	// writeTimeout bounds a single live write.
	writeTimeout = 2 * time.Second
	bulkTimeout  = 10 * time.Second
)

// buildWriteTimeout bounds a single write to the build alias, so the build
// and live writes together normally fit inside catalog-api's 2s. A variable
// only so tests can shorten it.
var buildWriteTimeout = 1 * time.Second

// afterBuildCheck, when set, runs in BulkBuild between the CurrentBuild check
// and the bulk write. Only tests set it, to replace the build in that gap.
var afterBuildCheck func()

// Outcome says what a single write did.
type Outcome string

const (
	Indexed Outcome = "indexed"
	// Deleted means the product is not in the index (any more).
	Deleted Outcome = "deleted"
	// Skipped means the index already holds a newer version of the product.
	Skipped Outcome = "skipped"
)

const (
	versionConflict = "version_conflict_engine_exception"
	indexNotFound   = "index_not_found_exception"
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

// Indexer writes through the live alias and, while a reindex runs, the build
// alias.
type Indexer struct {
	c   *opensearchapi.Client
	n   index.Names
	log *slog.Logger
}

// New returns an Indexer that writes through n.Alias and n.BuildAlias.
func New(c *opensearchapi.Client, n index.Names, log *slog.Logger) *Indexer {
	return &Indexer{c: c, n: n, log: log}
}

// Upsert indexes or replaces p and waits until it is searchable. A stale
// write (older updatedAt than the stored one) is skipped, not an error.
//
// The live write runs even if the caller has given up (it is still bounded
// by writeTimeout): a slow build write may use up catalog-api's deadline,
// and the edit must still reach the live index. The same holds for Delete.
func (x *Indexer) Upsert(ctx context.Context, p catalog.Product) (Outcome, error) {
	doc, err := json.Marshal(catalog.ToDoc(p))
	if err != nil {
		return "", err
	}
	x.toBuild(ctx, "upsert", p.ID, func() error {
		resp, err := x.put(ctx, x.n.BuildAlias, p, doc, "", buildWriteTimeout)
		switch osclient.ErrorType(err) {
		case versionConflict, indexNotFound:
			return nil
		}
		return osclient.Classify(resp, err)
	})

	resp, err := x.put(context.WithoutCancel(ctx), x.n.Alias, p, doc, "wait_for", writeTimeout)
	switch osclient.ErrorType(err) {
	case "":
	case versionConflict:
		x.log.Info("stale upsert skipped", "id", p.ID, "version", p.Version())
		return Skipped, nil
	case indexNotFound:
		return "", fmt.Errorf("upsert %s: %w", p.ID, index.ErrAliasMissing)
	}
	if err != nil {
		return "", fmt.Errorf("upsert %s: %w", p.ID, osclient.Classify(resp, err))
	}
	return Indexed, nil
}

// put indexes p through target, an alias. It returns the raw error, so the
// caller decides what each OpenSearch error type means.
func (x *Indexer) put(ctx context.Context, target string, p catalog.Product, doc []byte, refresh string, timeout time.Duration) (*opensearch.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	resp, err := x.c.Doc.Index(ctx, opensearchapi.IndexReq{
		Index: target,
		ID:    p.ID,
		Body:  bytes.NewReader(doc),
		Params: &opensearchapi.IndexParams{
			Version:      new(int(p.Version())),
			VersionType:  opensearchapi.VersionTypeExternalGte,
			Refresh:      refresh,
			RequireAlias: new(true),
		},
	})
	return osclient.Raw(resp), err
}

// Delete removes one product at version (Unix ms, later than its last
// upsert) and waits until it is gone from search. Deleting a product that
// isn't indexed succeeds and leaves a tombstone. A product indexed at a
// newer version is kept, and the delete is Skipped. It goes through _bulk
// because the single-document delete API would auto-create a missing index.
func (x *Indexer) Delete(ctx context.Context, id string, version int64) (Outcome, error) {
	action, err := json.Marshal(map[string]any{"delete": map[string]any{
		"_id": id, "version": version, "version_type": "external_gte",
	}})
	if err != nil {
		return "", err
	}
	body := append(action, '\n')
	x.toBuild(ctx, "delete", id, func() error {
		item, err := x.deleteOne(ctx, x.n.BuildAlias, body, "", buildWriteTimeout)
		if err != nil {
			return err
		}
		if item.Error != nil && (item.Error.Type == versionConflict || item.Error.Type == indexNotFound) {
			return nil
		}
		return deleteItemError(item)
	})

	item, err := x.deleteOne(context.WithoutCancel(ctx), x.n.Alias, body, "wait_for", writeTimeout)
	if err != nil {
		return "", fmt.Errorf("delete %s: %w", id, err)
	}
	if item.Error != nil && item.Error.Type == versionConflict {
		x.log.Info("stale delete skipped", "id", id, "version", version)
		return Skipped, nil
	}
	if err := deleteItemError(item); err != nil {
		return "", fmt.Errorf("delete %s: %w", id, err)
	}
	return Deleted, nil
}

// deleteOne sends one delete action through target and returns its item.
func (x *Indexer) deleteOne(ctx context.Context, target string, body []byte, refresh string, timeout time.Duration) (opensearchapi.BulkRespItem, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	resp, err := x.bulk(ctx, target, true, body, refresh)
	if err != nil {
		return opensearchapi.BulkRespItem{}, err
	}
	if len(resp.Items) != 1 || resp.Items[0].Delete == nil {
		return opensearchapi.BulkRespItem{}, fmt.Errorf("unexpected bulk response with %d items", len(resp.Items))
	}
	return *resp.Items[0].Delete, nil
}

// toBuild runs one write to the build alias, before the live write
// (ADR-0007 step 2). write returns nil when the build has the change or
// doesn't need it: written, stale, already gone, or no build running. Any
// other failure aborts the build, because finishing it would lose this
// write. The build write never fails the user's write, and it never waits
// for a refresh: the build index has refresh off.
//
// If the abort fails too, the build may still swap without this edit, and
// only a new reindex after it puts the edit back, so that one Error line
// says to run it.
func (x *Indexer) toBuild(ctx context.Context, op, id string, write func() error) {
	werr := write()
	if werr == nil {
		return
	}
	x.log.Error("build write failed; aborting build", "op", op, "id", id, "err", werr)
	// Abort even if the caller has hung up: this build must not go live.
	// CurrentBuild and AbortBuild bound their own calls.
	ctx = context.WithoutCancel(ctx)
	build, ok, err := index.CurrentBuild(ctx, x.c, x.n)
	if err != nil {
		x.bothFailed(op, id, "", werr, err)
		return
	}
	if !ok {
		return // finished or aborted meanwhile
	}
	err = index.AbortBuild(ctx, x.c, x.n, build)
	switch {
	case errors.Is(err, index.ErrBuildGone):
		return // finished or aborted meanwhile
	case err != nil:
		x.bothFailed(op, id, build, werr, err)
		return
	}
	x.log.Warn("build aborted after a failed build write", "build", build)
}

// bothFailed logs a build write whose abort failed too. build is empty if
// the build couldn't be found.
func (x *Indexer) bothFailed(op, id, build string, writeErr, abortErr error) {
	x.log.Error("build write and abort both failed; rerun reindex after this build finishes",
		"op", op, "id", id, "build", build, "build_err", writeErr, "abort_err", abortErr)
}

// Bulk indexes many products and, like Upsert, waits until they are
// searchable (refresh=wait_for). catalog-api invalidates its search cache when
// a reindex returns, so unrefreshed writes would let the next search cache
// pre-reindex results (1.4 finding A). Invalid products and items OpenSearch
// rejects are reported in Failed; the rest are indexed.
func (x *Indexer) Bulk(ctx context.Context, ps []catalog.Product) (BulkResult, error) {
	result, err := x.bulkProducts(ctx, x.n.Alias, true, ps, "wait_for")
	if err != nil {
		return BulkResult{}, fmt.Errorf("bulk: %w", err)
	}
	return result, nil
}

// BulkBuild loads products into build, the index a reindex is building
// (ADR-0007 step 3), with no refresh. It returns index.ErrBuildGone if build
// isn't the current build, or is deleted during the call (the run was
// aborted or taken over). Results are reported as for Bulk.
//
// It writes into build by name, not through the build alias: if the build is
// replaced between the check and the write, the alias would carry this run's
// stale batch into the next run's index, where this run's delete tombstones
// don't exist. A swept build answers index_not_found, because the
// auto-create guard keeps OpenSearch from creating it again. An aborted build
// not yet swept takes the write harmlessly, and the run's finish then fails
// with ErrBuildGone.
func (x *Indexer) BulkBuild(ctx context.Context, build string, ps []catalog.Product) (BulkResult, error) {
	cur, ok, err := index.CurrentBuild(ctx, x.c, x.n)
	if err != nil {
		return BulkResult{}, fmt.Errorf("bulk into %s: %w", build, err)
	}
	if !ok || cur != build {
		return BulkResult{}, fmt.Errorf("bulk into %s: %w", build, index.ErrBuildGone)
	}
	if afterBuildCheck != nil {
		afterBuildCheck()
	}
	result, err := x.bulkProducts(ctx, build, false, ps, "")
	if errors.Is(err, index.ErrAliasMissing) || osclient.ErrorType(err) == indexNotFound {
		return BulkResult{}, fmt.Errorf("bulk into %s: %w", build, index.ErrBuildGone)
	}
	if err != nil {
		return BulkResult{}, fmt.Errorf("bulk into %s: %w", build, err)
	}
	return result, nil
}

// bulkProducts indexes ps into target and reports the result per item.
// requireAlias says whether target must be an alias.
func (x *Indexer) bulkProducts(ctx context.Context, target string, requireAlias bool, ps []catalog.Product, refresh string) (BulkResult, error) {
	body, invalid := bulkLines(ps)
	result := BulkResult{Failed: []Failure{}}
	if len(body) > 0 {
		ctx, cancel := context.WithTimeout(ctx, bulkTimeout)
		defer cancel()
		resp, err := x.bulk(ctx, target, requireAlias, body, refresh)
		if err != nil {
			return BulkResult{}, err
		}
		if result, err = ParseBulkItems(resp.Items); err != nil {
			return BulkResult{}, err
		}
	}
	result.Failed = append(result.Failed, invalid...)
	return result, nil
}

// bulk sends a _bulk request to target, which must be an alias if
// requireAlias is set. Partial item failures are not an error here: the
// caller reads the items.
func (x *Indexer) bulk(ctx context.Context, target string, requireAlias bool, body []byte, refresh string) (*opensearchapi.BulkResp, error) {
	resp, err := x.c.Doc.Bulk(ctx, opensearchapi.BulkReq{
		Index:  target,
		Body:   bytes.NewReader(body),
		Params: &opensearchapi.BulkParams{RequireAlias: new(requireAlias), Refresh: refresh},
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
