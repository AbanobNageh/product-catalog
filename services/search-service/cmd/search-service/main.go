// Command search-service owns the products search index in OpenSearch and
// serves indexing and search requests from catalog-api.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/config"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/httpapi"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/indexer"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/searcher"
)

const (
	// shutdownTimeout leaves headroom inside the spec's "exit within 10s".
	shutdownTimeout = 9 * time.Second
	// startupWait bounds how long we wait for OpenSearch before exiting 1.
	startupWait       = 30 * time.Second
	startupRetryEvery = 2 * time.Second
)

func main() {
	os.Exit(run())
}

func run() int {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		// No logger yet: still write one JSON line so log collectors parse it.
		slog.New(slog.NewJSONHandler(os.Stderr, nil)).Error("startup failed", "err", err)
		return 2
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()

	client, err := osclient.New(cfg.OpenSearchURL)
	if err != nil {
		log.Error("opensearch client", "err", err)
		return 1
	}
	defer func() { _ = client.Close() }()

	// OpenSearch may still be booting (Compose, a Kubernetes rollout), so
	// wait a bounded time for it. After that, exit and let the orchestrator
	// restart us rather than hang.
	ensure := func(ctx context.Context) error { return index.Ensure(ctx, client, index.Default) }
	if err := index.WaitFor(ctx, ensure, startupRetryEvery, startupWait); err != nil {
		log.Error("opensearch not ready", "url", cfg.OpenSearchURL, "err", err)
		return 1
	}
	log.Info("index ready", "index", index.Default.Index, "alias", index.Default.Alias)

	srv := &http.Server{
		Addr: net.JoinHostPort("", strconv.Itoa(cfg.Port)),
		Handler: httpapi.NewServer(httpapi.Deps{
			Indexer:  indexer.New(client, index.Default.Alias, log),
			Searcher: searcher.New(client, index.Default.Alias),
			Ready:    func(ctx context.Context) error { return index.Ready(ctx, client, index.Default) },
		}, log),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.ListenAndServe() }()
	log.Info("listening", "port", cfg.Port)

	select {
	case err := <-serveErr:
		log.Error("server failed", "err", err)
		return 1
	case <-ctx.Done():
	}

	log.Info("shutdown started")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Error("shutdown did not finish in time", "err", err)
		return 1
	}
	if err := <-serveErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("server failed", "err", fmt.Errorf("after shutdown: %w", err))
		return 1
	}
	log.Info("shutdown complete")
	return 0
}
