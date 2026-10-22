package index

import (
	"errors"
	"testing"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"
)

func TestGuardVerdict(t *testing.T) {
	tests := []struct {
		name        string
		item        opensearchapi.BulkRespItem
		wantCreated bool
		wantAllowed bool // err is ErrAutoCreateAllowed
		wantOtherEr bool // err is some other error
	}{
		{
			name: "index not found: auto-create is blocked",
			item: opensearchapi.BulkRespItem{Status: 404, Error: &opensearchapi.ErrorCause{Type: "index_not_found_exception"}},
		},
		{
			name:        "404 not_found without error: the index was created",
			item:        opensearchapi.BulkRespItem{Status: 404, Result: new("not_found")},
			wantCreated: true,
			wantAllowed: true,
		},
		{
			name:        "200: the index was created",
			item:        opensearchapi.BulkRespItem{Status: 200},
			wantCreated: true,
			wantAllowed: true,
		},
		{
			name:        "other error is not a verdict",
			item:        opensearchapi.BulkRespItem{Status: 403, Error: &opensearchapi.ErrorCause{Type: "cluster_block_exception"}},
			wantOtherEr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			created, err := guardVerdict(tt.item)
			if created != tt.wantCreated {
				t.Errorf("created = %v, want %v", created, tt.wantCreated)
			}
			switch {
			case tt.wantAllowed && !errors.Is(err, ErrAutoCreateAllowed):
				t.Errorf("err = %v, want ErrAutoCreateAllowed", err)
			case tt.wantOtherEr && (err == nil || errors.Is(err, ErrAutoCreateAllowed)):
				t.Errorf("err = %v, want a non-ErrAutoCreateAllowed error", err)
			case !tt.wantAllowed && !tt.wantOtherEr && err != nil:
				t.Errorf("err = %v, want nil", err)
			}
		})
	}
}
