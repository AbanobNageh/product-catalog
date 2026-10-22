package healthcheck

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestCheck(t *testing.T) {
	tests := []struct {
		name    string
		handler http.HandlerFunc
		closed  bool          // close the server before the call
		timeout time.Duration // ctx deadline; 0 means 2s
		wantErr string        // "" means healthy; otherwise a substring of the error
	}{
		{
			name:    "200 is healthy",
			handler: func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) },
		},
		{
			name:    "503 is unhealthy",
			handler: func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) },
			wantErr: "503",
		},
		{
			name:    "nothing listening is unhealthy",
			handler: func(w http.ResponseWriter, _ *http.Request) {},
			closed:  true,
			wantErr: "readyz",
		},
		{
			name: "a slow answer past the deadline is unhealthy",
			handler: func(w http.ResponseWriter, r *http.Request) {
				select {
				case <-time.After(500 * time.Millisecond):
				case <-r.Context().Done():
				}
			},
			timeout: 50 * time.Millisecond,
			wantErr: "deadline",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(tt.handler)
			defer srv.Close()
			if tt.closed {
				srv.Close()
			}
			timeout := tt.timeout
			if timeout == 0 {
				timeout = 2 * time.Second
			}
			ctx, cancel := context.WithTimeout(context.Background(), timeout)
			defer cancel()

			start := time.Now()
			err := Check(ctx, srv.Client(), srv.URL+"/readyz")
			elapsed := time.Since(start)

			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Check: %v, want nil", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("Check: %v, want an error containing %q", err, tt.wantErr)
			}
			if elapsed > 400*time.Millisecond {
				t.Fatalf("Check took %v, want under 400ms", elapsed)
			}
		})
	}
}
