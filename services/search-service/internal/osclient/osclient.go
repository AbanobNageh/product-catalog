// Package osclient builds the OpenSearch client and sorts its errors into
// "OpenSearch can't answer right now" (ErrUnavailable, a 503 for our callers)
// and everything else.
package osclient

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"

	"github.com/opensearch-project/opensearch-go/v5"
	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"
	"github.com/opensearch-project/opensearch-go/v5/opensearchtransport"
)

// ErrUnavailable means OpenSearch is unreachable, timed out, overloaded or
// failing. Callers turn it into a 503.
var ErrUnavailable = errors.New("opensearch unavailable")

// New returns a client for the OpenSearch at url.
func New(url string) (*opensearchapi.Client, error) {
	return opensearchapi.NewClient(opensearchapi.Config{
		Client: opensearch.Config{
			Addresses: []string{url},
			// ADR-0005: node discovery off. It would swap our URL for the
			// container-internal node addresses, which the host can't reach,
			// and in Kubernetes we go through the Service. With discovery off,
			// v5's default router only knows this URL, so it stays harmless.
			DiscoverNodesOnStart:  new(false),
			DiscoverNodesInterval: -1,
			// ADR-0005: no built-in retries (v5 retries 5xx and network errors
			// up to 6 times by default). The spec says no retries that hide
			// failures, and the 2s deadlines assume one attempt.
			DisableRetry: true,
			// Re-resolve DNS on every dial, so a restarted container's new IP
			// is picked up at once.
			DNSCacheRefresh: -1,
		},
	})
}

// StatusOf returns the HTTP status behind an OpenSearch call, or 0 if there is
// none. v5 errors often carry no typed status (HEAD calls, non-JSON bodies),
// so the response, which v5 returns alongside the error, is checked first.
func StatusOf(resp *opensearch.Response, err error) int {
	if resp != nil && resp.StatusCode != 0 {
		return resp.StatusCode
	}
	if se, ok := errors.AsType[*opensearch.StructError](err); ok {
		return se.Status
	}
	if se, ok := errors.AsType[*opensearch.StringError](err); ok {
		return se.Status
	}
	return 0
}

// Raw returns the HTTP response behind a typed v5 response such as
// *IndicesCreateResp, or nil. v5 often returns the typed response alongside
// an error, and its status is the reliable one (see StatusOf).
func Raw[T interface{ Inspect() opensearchapi.Inspect }](r *T) *opensearch.Response {
	if r == nil {
		return nil
	}
	return (*r).Inspect().Response
}

// ErrorType returns OpenSearch's error type (for example
// "version_conflict_engine_exception"), or "" if err doesn't carry one.
func ErrorType(err error) string {
	if se, ok := errors.AsType[*opensearch.StructError](err); ok {
		return se.Err.Type
	}
	return ""
}

// Classify wraps err in ErrUnavailable when OpenSearch couldn't answer:
// network errors (including a connection closed early), deadlines, no
// connections, 429 and 5xx. Anything else comes back unchanged, and nil
// stays nil.
func Classify(resp *opensearch.Response, err error) error {
	if err == nil {
		return nil
	}
	status := StatusOf(resp, err)
	var netErr net.Error
	switch {
	case errors.As(err, &netErr),
		errors.Is(err, context.DeadlineExceeded),
		errors.Is(err, opensearchtransport.ErrNoConnections),
		// A connection that closes before a response: Docker's port forward
		// does this while the container is down.
		errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF),
		status == 429,
		status >= 500:
		return fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	return err
}
