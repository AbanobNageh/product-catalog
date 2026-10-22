package index

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

// probeIndex is a name under products* that must never exist. The guard aims
// a versioned delete at it and checks that OpenSearch refuses to create it.
const probeIndex = "products-autocreate-probe"

// ErrAutoCreateAllowed means OpenSearch would auto-create products* indices,
// so a versioned delete aimed at a missing alias would silently make one.
var ErrAutoCreateAllowed = errors.New("opensearch would auto-create products* indices; set action.auto_create_index to \"-products*,+*\" (ADR-0007)")

// CheckAutoCreateGuard probes the cluster instead of reading its settings, so
// it also sees values from templates or managed services. It sends a
// versioned delete to a missing products* index: with auto-create blocked the
// item fails with index_not_found_exception; otherwise the index appears.
func CheckAutoCreateGuard(ctx context.Context, c *opensearchapi.Client) error {
	cctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	body := fmt.Sprintf(`{"delete":{"_index":%q,"_id":"probe","version":1,"version_type":"external_gte"}}`+"\n", probeIndex)
	resp, err := c.Bulk(cctx, opensearchapi.BulkReq{Body: strings.NewReader(body)})
	// A failed item comes back as a PartialBulkError alongside the response.
	if _, partial := errors.AsType[*opensearchapi.PartialBulkError](err); err != nil && !(partial && resp != nil) {
		return fmt.Errorf("auto-create probe: %w", osclient.Classify(osclient.Raw(resp), err))
	}
	if len(resp.Items) != 1 || resp.Items[0].Delete == nil {
		return fmt.Errorf("auto-create probe: unexpected bulk response with %d items", len(resp.Items))
	}
	created, verr := guardVerdict(*resp.Items[0].Delete)
	if created {
		// Best effort: leave the cluster as we found it.
		dctx, dcancel := context.WithTimeout(ctx, callTimeout)
		defer dcancel()
		_, _ = c.Indices.Delete(dctx, &opensearchapi.IndicesDeleteReq{Indices: []string{probeIndex}})
	}
	return verr
}

// guardVerdict reads the probe's bulk item. created says the index now exists.
func guardVerdict(item opensearchapi.BulkRespItem) (created bool, err error) {
	if item.Error != nil {
		if item.Error.Type == "index_not_found_exception" {
			return false, nil
		}
		return false, fmt.Errorf("auto-create probe: status %d: %s", item.Status, item.Error.Type)
	}
	return true, ErrAutoCreateAllowed
}
