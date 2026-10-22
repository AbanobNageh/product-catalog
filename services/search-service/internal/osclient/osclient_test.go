package osclient

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"testing"

	"github.com/opensearch-project/opensearch-go/v5"
	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"
	"github.com/opensearch-project/opensearch-go/v5/opensearchtransport"
)

func resp(status int) *opensearch.Response { return &opensearch.Response{StatusCode: status} }

func TestClassify(t *testing.T) {
	plain := errors.New("status: 503 Service Unavailable") // no typed status, as v5 HEAD calls return
	bad := &opensearch.StructError{Status: 400, Err: opensearch.Err{Type: "parsing_exception"}}
	tests := []struct {
		name        string
		resp        *opensearch.Response
		err         error
		unavailable bool
	}{
		{"network error", nil, &net.OpError{Op: "dial", Err: errors.New("refused")}, true},
		{"deadline", nil, fmt.Errorf("wrapped: %w", context.DeadlineExceeded), true},
		{"no connections", nil, opensearchtransport.ErrNoConnections, true},
		// Docker's port forward accepts the connection while the container is
		// down, then closes it: the client sees EOF, not a net.Error.
		{"connection closed (EOF)", nil, fmt.Errorf(`"POST" "http://localhost:9200/products/_search": %w`, io.EOF), true},
		{"connection cut mid-response", nil, fmt.Errorf("read body: %w", io.ErrUnexpectedEOF), true},
		{"5xx from the response, plain error", resp(503), plain, true},
		{"429", resp(429), errors.New("too many"), true},
		{"5xx struct error", nil, &opensearch.StructError{Status: 502}, true},
		{"400 is not unavailable", resp(400), bad, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Classify(tt.resp, tt.err)
			if errors.Is(got, ErrUnavailable) != tt.unavailable {
				t.Fatalf("Classify = %v, unavailable want %v", got, tt.unavailable)
			}
			if !tt.unavailable && got != tt.err {
				t.Fatalf("non-transient errors must come back unchanged, got %v", got)
			}
			if tt.unavailable && !errors.Is(got, tt.err) {
				t.Fatalf("the original error must stay in the chain, got %v", got)
			}
		})
	}
}

func TestClassifyNil(t *testing.T) {
	if err := Classify(nil, nil); err != nil {
		t.Fatalf("got %v", err)
	}
	if err := Classify(resp(200), nil); err != nil {
		t.Fatalf("got %v", err)
	}
}

func TestStatusOf(t *testing.T) {
	tests := []struct {
		name string
		resp *opensearch.Response
		err  error
		want int
	}{
		{"from the response", resp(404), errors.New("status: 404 Not Found"), 404},
		{"from a struct error", nil, &opensearch.StructError{Status: 409}, 409},
		{"wrapped struct error", nil, fmt.Errorf("x: %w", &opensearch.StructError{Status: 409}), 409},
		{"unknown", nil, errors.New("x"), 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := StatusOf(tt.resp, tt.err); got != tt.want {
				t.Fatalf("got %d, want %d", got, tt.want)
			}
		})
	}
}

func TestRawHandlesNil(t *testing.T) {
	var r *opensearchapi.IndicesCreateResp
	if got := Raw(r); got != nil {
		t.Fatalf("got %v", got)
	}
	if got := Raw(&opensearchapi.IndicesCreateResp{}); got != nil {
		t.Fatalf("a response with no raw response should give nil, got %v", got)
	}
}

func TestErrorType(t *testing.T) {
	err := fmt.Errorf("x: %w", &opensearch.StructError{Status: 409, Err: opensearch.Err{Type: "version_conflict_engine_exception"}})
	if got := ErrorType(err); got != "version_conflict_engine_exception" {
		t.Fatalf("got %q", got)
	}
	if got := ErrorType(errors.New("x")); got != "" {
		t.Fatalf("got %q", got)
	}
}
