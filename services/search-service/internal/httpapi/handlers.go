package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/catalog"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/indexer"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/query"
)

const (
	maxProductBytes = 1 << 20  // one product
	maxBulkBytes    = 10 << 20 // one bulk request
	maxBulkProducts = 1000
)

// healthz is liveness: the process is up. It checks no dependencies.
func (s *server) healthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// readyz is readiness: OpenSearch answers and the alias exists.
func (s *server) readyz(w http.ResponseWriter, r *http.Request) {
	if err := s.deps.Ready(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "error", "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) search(w http.ResponseWriter, r *http.Request) {
	p, err := query.ParseParams(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	result, err := s.deps.Searcher.Search(r.Context(), p)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) putProduct(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if !decode(w, r, maxProductBytes, &raw) {
		return
	}
	p, err := catalog.DecodeProduct(raw)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if id := r.PathValue("id"); p.ID != id {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("id in the body (%q) must match the path (%q)", p.ID, id))
		return
	}
	outcome, err := s.deps.Indexer.Upsert(r.Context(), p)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"result": outcome})
}

// deleteProduct removes one product at ?version= (Unix ms, later than its
// last upsert), so a stale copy written later can't bring it back
// (ADR-0007). A delete skipped because a newer upsert won is still a 204.
func (s *server) deleteProduct(w http.ResponseWriter, r *http.Request) {
	version, err := strconv.ParseInt(r.URL.Query().Get("version"), 10, 64)
	if err != nil || version <= 0 {
		writeError(w, http.StatusBadRequest, "version must be a positive integer (ms)")
		return
	}
	if _, err := s.deps.Indexer.Delete(r.Context(), r.PathValue("id"), version); err != nil {
		s.fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// bulk indexes many products. Each item is decoded on its own, so a missing
// or wrongly typed field is reported for that item rather than rejecting the
// batch; only a malformed body is a 400.
func (s *server) bulk(w http.ResponseWriter, r *http.Request) {
	_, products, undecodable, ok := decodeBulk(w, r)
	if !ok {
		return
	}
	result, err := s.deps.Indexer.Bulk(r.Context(), products)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	result.Failed = append(result.Failed, undecodable...)
	writeJSON(w, http.StatusOK, result)
}

// decodeBulk reads a bulk body, {"products": [...]} plus an optional "build"
// (used by the reindex endpoints), and decodes each product on its own. It
// returns the good products and a failure for each one that didn't decode.
// On a bad body it writes the 400 or 413 and returns ok=false.
func decodeBulk(w http.ResponseWriter, r *http.Request) (build string, products []catalog.Product, undecodable []indexer.Failure, ok bool) {
	var body struct {
		Build    string             `json:"build"`
		Products *[]json.RawMessage `json:"products"`
	}
	if !decode(w, r, maxBulkBytes, &body) {
		return "", nil, nil, false
	}
	if body.Products == nil {
		writeError(w, http.StatusBadRequest, `body must be {"products": [...]}`)
		return "", nil, nil, false
	}
	if n := len(*body.Products); n > maxBulkProducts {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("at most %d products per request, got %d", maxBulkProducts, n))
		return "", nil, nil, false
	}

	products = make([]catalog.Product, 0, len(*body.Products))
	for _, raw := range *body.Products {
		p, err := catalog.DecodeProduct(raw)
		if err != nil {
			undecodable = append(undecodable, indexer.Failure{ID: idOf(raw), Status: http.StatusBadRequest, Reason: err.Error()})
			continue
		}
		products = append(products, p)
	}
	return body.Build, products, undecodable, true
}

// idOf reads the id of a product that failed to decode, so its failure can
// still be matched up and reindexed. It returns "" if there is none.
func idOf(raw json.RawMessage) string {
	var v struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(raw, &v)
	return v.ID
}

// decode reads a JSON body of at most limit bytes into v. On failure it
// writes 413 (too big) or 400 and returns false.
func decode(w http.ResponseWriter, r *http.Request, limit int64, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, limit)
	err := json.NewDecoder(r.Body).Decode(v)
	if err == nil {
		return true
	}
	if _, tooBig := errors.AsType[*http.MaxBytesError](err); tooBig {
		writeError(w, http.StatusRequestEntityTooLarge, fmt.Sprintf("body must be at most %d bytes", limit))
		return false
	}
	writeError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
	return false
}
