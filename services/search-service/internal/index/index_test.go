package index

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

func TestBody(t *testing.T) {
	var b struct {
		Settings struct {
			NumberOfShards   int `json:"number_of_shards"`
			NumberOfReplicas int `json:"number_of_replicas"`
		} `json:"settings"`
		Mappings struct {
			Dynamic    string `json:"dynamic"`
			Properties map[string]struct {
				Type   string                     `json:"type"`
				Fields map[string]json.RawMessage `json:"fields"`
			} `json:"properties"`
		} `json:"mappings"`
		Aliases map[string]json.RawMessage `json:"aliases"`
	}
	if err := json.Unmarshal(Body("products"), &b); err != nil {
		t.Fatalf("Body is not JSON: %v", err)
	}
	if b.Settings.NumberOfShards != 1 || b.Settings.NumberOfReplicas != 0 {
		t.Errorf("settings %+v", b.Settings)
	}
	if b.Mappings.Dynamic != "strict" {
		t.Errorf("dynamic %q", b.Mappings.Dynamic)
	}
	want := map[string]string{
		"id": "keyword", "sku": "keyword", "name": "text", "description": "text",
		"category": "keyword", "brand": "keyword", "price_cents": "integer",
		"currency": "keyword", "stock": "integer", "in_stock": "boolean",
		"created_at": "date", "updated_at": "date",
	}
	if len(b.Mappings.Properties) != len(want) {
		t.Errorf("got %d fields, want %d", len(b.Mappings.Properties), len(want))
	}
	for field, typ := range want {
		if got := b.Mappings.Properties[field].Type; got != typ {
			t.Errorf("%s: type %q, want %q", field, got, typ)
		}
	}
	if _, ok := b.Mappings.Properties["name"].Fields["keyword"]; !ok {
		t.Error("name has no keyword subfield")
	}
	if _, ok := b.Aliases["products"]; !ok {
		t.Errorf("aliases %v", b.Aliases)
	}
}

// The build alias is the write index of its build, so a second index can't
// join it: a start that races another start fails instead of leaving two
// indices behind the alias.
func TestBuildBody(t *testing.T) {
	var b struct {
		Settings map[string]any `json:"settings"`
		Aliases  map[string]struct {
			IsWriteIndex *bool `json:"is_write_index"`
		} `json:"aliases"`
	}
	if err := json.Unmarshal(BuildBody("products-build"), &b); err != nil {
		t.Fatalf("BuildBody is not JSON: %v", err)
	}
	if b.Settings["refresh_interval"] != "-1" || b.Settings["gc_deletes"] != "10m" {
		t.Errorf("settings %v", b.Settings)
	}
	a, ok := b.Aliases["products-build"]
	if !ok || len(b.Aliases) != 1 {
		t.Fatalf("aliases %v, want only products-build", b.Aliases)
	}
	if a.IsWriteIndex == nil || !*a.IsWriteIndex {
		t.Error("products-build must be created with is_write_index: true")
	}
}

func TestWaitForSucceedsAfterRetries(t *testing.T) {
	calls := 0
	err := WaitFor(context.Background(), func(context.Context) error {
		calls++
		if calls < 3 {
			return osclient.ErrUnavailable
		}
		return nil
	}, time.Millisecond, time.Second)
	if err != nil || calls != 3 {
		t.Fatalf("err %v after %d calls", err, calls)
	}
}

func TestWaitForGivesUpAfterMax(t *testing.T) {
	start := time.Now()
	err := WaitFor(context.Background(), func(context.Context) error {
		return osclient.ErrUnavailable
	}, 5*time.Millisecond, 50*time.Millisecond)
	if !errors.Is(err, osclient.ErrUnavailable) {
		t.Fatalf("got %v", err)
	}
	if time.Since(start) > time.Second {
		t.Fatalf("took %v", time.Since(start))
	}
}

func TestWaitForStopsOnAPermanentError(t *testing.T) {
	calls := 0
	boom := errors.New("mapping rejected")
	err := WaitFor(context.Background(), func(context.Context) error {
		calls++
		return boom
	}, time.Millisecond, time.Second)
	if !errors.Is(err, boom) || calls != 1 {
		t.Fatalf("err %v after %d calls", err, calls)
	}
}

func TestWaitForStopsWhenCancelled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := WaitFor(ctx, func(context.Context) error { return osclient.ErrUnavailable }, time.Millisecond, time.Second)
	if err == nil {
		t.Fatal("expected an error")
	}
}
