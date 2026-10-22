// Package httpapi is the HTTP layer: routes, JSON, error mapping and request
// logging. It depends only on the small interfaces in Deps, so it can be
// tested with fakes and knows nothing about OpenSearch.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/indexer"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/query"
)

// Indexer writes products to the index.
type Indexer interface {
	Upsert(ctx context.Context, p catalog.Product) (indexer.Outcome, error)
	Delete(ctx context.Context, id string, version int64) (indexer.Outcome, error)
	Bulk(ctx context.Context, ps []catalog.Product) (indexer.BulkResult, error)
}

// Reindexer runs the build side of an alias-swap reindex (ADR-0007).
type Reindexer interface {
	Start(ctx context.Context) (string, error)
	Bulk(ctx context.Context, build string, ps []catalog.Product) (indexer.BulkResult, error)
	Finish(ctx context.Context, build string) error
	Abort(ctx context.Context, build string) error
}

// Searcher runs searches.
type Searcher interface {
	Search(ctx context.Context, p query.Params) (query.Result, error)
}

// Deps is what the handlers need from the rest of the service.
type Deps struct {
	Indexer   Indexer
	Reindexer Reindexer
	Searcher  Searcher
	// Ready returns nil when OpenSearch answers and the alias exists.
	Ready func(ctx context.Context) error
}

type server struct {
	deps Deps
	log  *slog.Logger
}

// NewServer returns the service's HTTP handler.
func NewServer(deps Deps, log *slog.Logger) http.Handler {
	s := &server{deps: deps, log: log}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /search", s.search)
	mux.HandleFunc("PUT /products/{id}", s.putProduct)
	mux.HandleFunc("DELETE /products/{id}", s.deleteProduct)
	mux.HandleFunc("POST /products/_bulk", s.bulk)
	mux.HandleFunc("POST /reindex/start", s.reindexStart)
	mux.HandleFunc("POST /reindex/_bulk", s.reindexBulk)
	mux.HandleFunc("POST /reindex/finish", s.reindexFinish)
	mux.HandleFunc("POST /reindex/abort", s.reindexAbort)
	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("GET /readyz", s.readyz)
	return s.logRequests(mux)
}

// writeJSON writes v as JSON. HTML escaping is off so product names with &,
// < or > come back exactly as catalog-api sent them.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// fail maps an error from the indexer, reindexer or searcher to a response:
// 409 for a running or vanished build, 503 when
// OpenSearch can't serve, nothing when the client has gone, 500 otherwise.
func (s *server) fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, index.ErrBuildRunning):
		writeError(w, http.StatusConflict, index.ErrBuildRunning.Error())
	case errors.Is(err, index.ErrBuildGone):
		writeError(w, http.StatusConflict, index.ErrBuildGone.Error())
	case errors.Is(err, osclient.ErrUnavailable), errors.Is(err, index.ErrAliasMissing):
		s.log.Warn("search backend unavailable", "path", r.URL.Path, "err", err)
		writeError(w, http.StatusServiceUnavailable, "search is unavailable: "+rootCause(err))
	case errors.Is(err, context.Canceled):
		// The caller hung up; there is no one to answer.
		s.log.Debug("request cancelled by client", "path", r.URL.Path)
	default:
		s.log.Error("request failed", "path", r.URL.Path, "err", err)
		writeError(w, http.StatusInternalServerError, "internal error")
	}
}

// rootCause names the sentinel behind a 503 without leaking internals.
func rootCause(err error) string {
	if errors.Is(err, index.ErrAliasMissing) {
		return index.ErrAliasMissing.Error()
	}
	return osclient.ErrUnavailable.Error()
}

// statusRecorder remembers the status for the request log.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}

// logRequests logs one line per request; health checks only at debug.
func (s *server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		level := slog.LevelInfo
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			level = slog.LevelDebug
		}
		s.log.Log(r.Context(), level, "request",
			"method", r.Method, "path", r.URL.Path, "status", rec.status,
			"duration_ms", time.Since(start).Milliseconds())
	})
}
