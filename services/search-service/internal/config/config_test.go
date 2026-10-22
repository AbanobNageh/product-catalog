package config

import (
	"log/slog"
	"strings"
	"testing"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestLoadDefaults(t *testing.T) {
	got, err := Load(env(nil))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := Config{Port: 8080, OpenSearchURL: "http://localhost:9200", LogLevel: slog.LevelInfo}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestLoadValues(t *testing.T) {
	got, err := Load(env(map[string]string{
		"PORT":           "9000",
		"OPENSEARCH_URL": "http://opensearch:9200",
		"LOG_LEVEL":      "DEBUG",
	}))
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	want := Config{Port: 9000, OpenSearchURL: "http://opensearch:9200", LogLevel: slog.LevelDebug}
	if got != want {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestLoadErrors(t *testing.T) {
	tests := []struct {
		name string
		env  map[string]string
		want []string // every one must appear in the error
	}{
		{"port not a number", map[string]string{"PORT": "abc"}, []string{"PORT"}},
		{"port zero", map[string]string{"PORT": "0"}, []string{"PORT"}},
		{"port too big", map[string]string{"PORT": "70000"}, []string{"PORT"}},
		{"unknown log level", map[string]string{"LOG_LEVEL": "loud"}, []string{"LOG_LEVEL"}},
		{"url without scheme", map[string]string{"OPENSEARCH_URL": "not a url"}, []string{"OPENSEARCH_URL"}},
		{"url with other scheme", map[string]string{"OPENSEARCH_URL": "ftp://x:9200"}, []string{"OPENSEARCH_URL"}},
		{"every problem listed", map[string]string{"PORT": "abc", "LOG_LEVEL": "loud"}, []string{"PORT", "LOG_LEVEL"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Load(env(tt.env))
			if err == nil {
				t.Fatal("expected an error")
			}
			for _, w := range tt.want {
				if !strings.Contains(err.Error(), w) {
					t.Errorf("error %q does not mention %s", err, w)
				}
			}
		})
	}
}
