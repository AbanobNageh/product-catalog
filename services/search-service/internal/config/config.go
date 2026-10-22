// Package config reads the service's settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"strconv"
	"strings"
)

// Config is everything the service needs to start.
type Config struct {
	Port          int
	OpenSearchURL string
	LogLevel      slog.Level
}

// Load reads PORT, OPENSEARCH_URL and LOG_LEVEL through getenv (os.Getenv in
// main, a map in tests). Unset values get defaults. The returned error lists
// every invalid variable, not just the first.
func Load(getenv func(string) string) (Config, error) {
	cfg := Config{Port: 8080, OpenSearchURL: "http://localhost:9200", LogLevel: slog.LevelInfo}
	var errs []error

	if v := getenv("PORT"); v != "" {
		port, err := strconv.Atoi(v)
		if err != nil || port < 1 || port > 65535 {
			errs = append(errs, fmt.Errorf("PORT must be 1-65535, got %q", v))
		} else {
			cfg.Port = port
		}
	}

	if v := getenv("OPENSEARCH_URL"); v != "" {
		u, err := url.Parse(v)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			errs = append(errs, fmt.Errorf("OPENSEARCH_URL must be an http(s) URL with a host, got %q", v))
		} else {
			cfg.OpenSearchURL = v
		}
	}

	if v := getenv("LOG_LEVEL"); v != "" {
		var level slog.Level
		switch strings.ToLower(v) {
		case "debug":
			level = slog.LevelDebug
		case "info":
			level = slog.LevelInfo
		case "warn":
			level = slog.LevelWarn
		case "error":
			level = slog.LevelError
		default:
			errs = append(errs, fmt.Errorf("LOG_LEVEL must be debug, info, warn or error, got %q", v))
		}
		cfg.LogLevel = level
	}

	if len(errs) > 0 {
		return Config{}, fmt.Errorf("invalid config: %w", errors.Join(errs...))
	}
	return cfg, nil
}
