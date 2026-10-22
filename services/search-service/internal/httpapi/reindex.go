package httpapi

import (
	"errors"
	"net/http"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
)

// buildRef is the body of finish and abort: {"build": "products-v2"}.
type buildRef struct {
	Build string `json:"build"`
}

const buildRequired = `body must be {"build": "<name from /reindex/start>"}`

// reindexStart opens a new build index and returns its name.
func (s *server) reindexStart(w http.ResponseWriter, r *http.Request) {
	build, err := s.deps.Reindexer.Start(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, buildRef{Build: build})
}

// reindexBulk loads products into the named build. Bodies are decoded exactly
// as for /products/_bulk, plus the build name.
func (s *server) reindexBulk(w http.ResponseWriter, r *http.Request) {
	build, products, undecodable, ok := decodeBulk(w, r)
	if !ok {
		return
	}
	if build == "" {
		writeError(w, http.StatusBadRequest, buildRequired)
		return
	}
	result, err := s.deps.Reindexer.Bulk(r.Context(), build, products)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	result.Failed = append(result.Failed, undecodable...)
	writeJSON(w, http.StatusOK, result)
}

// reindexFinish swaps the build in as the live index.
func (s *server) reindexFinish(w http.ResponseWriter, r *http.Request) {
	build, ok := decodeBuild(w, r)
	if !ok {
		return
	}
	if err := s.deps.Reindexer.Finish(r.Context(), build); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// reindexAbort drops the build. Aborting a build that is already gone is a
// 204, so a caller can abort after any failure without checking first.
func (s *server) reindexAbort(w http.ResponseWriter, r *http.Request) {
	build, ok := decodeBuild(w, r)
	if !ok {
		return
	}
	if err := s.deps.Reindexer.Abort(r.Context(), build); err != nil && !errors.Is(err, index.ErrBuildGone) {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// decodeBuild reads {"build": "..."} and rejects a missing or empty name.
func decodeBuild(w http.ResponseWriter, r *http.Request) (string, bool) {
	var b buildRef
	if !decode(w, r, maxProductBytes, &b) {
		return "", false
	}
	if b.Build == "" {
		writeError(w, http.StatusBadRequest, buildRequired)
		return "", false
	}
	return b.Build, true
}
