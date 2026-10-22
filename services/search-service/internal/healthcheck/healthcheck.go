// Package healthcheck lets the binary probe itself. The runtime image is
// distroless (no shell, no curl), so a Compose healthcheck runs
// `/search-service healthcheck` instead. Kubernetes doesn't need this: its
// httpGet probes call /readyz directly.
package healthcheck

import (
	"context"
	"fmt"
	"io"
	"net/http"
)

// Check GETs url and returns nil only on 200 OK. The deadline comes from ctx.
func Check(ctx context.Context, client *http.Client, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	_, _ = io.Copy(io.Discard, resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}
	return nil
}
