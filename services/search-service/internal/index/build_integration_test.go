//go:build integration

package index_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/index"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/ittest"
	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

func TestStartBuildCreatesBuildIndex(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	build, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("StartBuild: %v", err)
	}
	if want := n.Alias + "-v2"; build != want {
		t.Fatalf("build = %q, want %q", build, want)
	}
	assertCurrentBuild(t, c, n, build)

	s := indexSettings(t, c, build)
	if got := deref(s.RefreshInterval); got != "-1" {
		t.Errorf("refresh_interval = %q, want -1", got)
	}
	if got := deref(s.GCDeletes); got != "10m" {
		t.Errorf("gc_deletes = %q, want 10m", got)
	}
	assertAliasOn(t, c, n.Alias, n.Index)
}

func TestStartWhileRunning(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	first, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("first StartBuild: %v", err)
	}
	if _, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter); !errors.Is(err, index.ErrBuildRunning) {
		t.Fatalf("second StartBuild: got %v, want ErrBuildRunning", err)
	}
	assertCurrentBuild(t, c, n, first)
	if !indexExists(t, c, first) {
		t.Fatalf("%s was deleted", first)
	}
}

// Starts at once: they may all see no build, and a later one may number its
// index after an earlier one's create (v3 beside v2). Exactly one must win,
// and the build alias must point at only its index. The starts are spread
// over a few tens of milliseconds, about one index create, because starts
// that begin together all pick the same number and collide on the name.
func TestConcurrentStarts(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	const starts = 32
	var (
		wg     sync.WaitGroup
		ready  = make(chan struct{})
		builds [starts]string
		errs   [starts]error
	)
	for i := range starts {
		wg.Go(func() {
			<-ready
			time.Sleep(time.Duration(i) * 2 * time.Millisecond)
			builds[i], errs[i] = index.StartBuild(ctx, c, n, index.BuildStaleAfter)
		})
	}
	close(ready)
	wg.Wait()

	var winner string
	for i, err := range errs {
		switch {
		case err == nil:
			if winner != "" {
				t.Fatalf("two starts succeeded: %s and %s", winner, builds[i])
			}
			winner = builds[i]
		case !errors.Is(err, index.ErrBuildRunning):
			t.Fatalf("start %d: got %v, want ErrBuildRunning", i, err)
		}
	}
	if winner == "" {
		t.Fatalf("no start succeeded: %v", errs)
	}
	assertCurrentBuild(t, c, n, winner)
	// A losing create must leave no index behind.
	if got, want := versionIndices(t, c, n), []string{n.Index, winner}; !slices.Equal(got, want) {
		t.Fatalf("indices %v, want %v", got, want)
	}
}

func TestStartTakesOverStaleBuild(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	first, err := index.StartBuild(ctx, c, n, 0)
	if err != nil {
		t.Fatalf("first StartBuild: %v", err)
	}
	second, err := index.StartBuild(ctx, c, n, 0)
	if err != nil {
		t.Fatalf("second StartBuild: %v", err)
	}
	if want := n.Alias + "-v3"; second != want {
		t.Fatalf("second = %q, want %q", second, want)
	}
	if indexExists(t, c, first) {
		t.Fatalf("abandoned build %s still exists", first)
	}
	assertCurrentBuild(t, c, n, second)
}

func TestFinishSwapsAndDropsOld(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	build, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("StartBuild: %v", err)
	}
	// ghost exists only in the old index, so it must vanish with the swap.
	putDoc(t, c, n.Alias, "ghost")
	putDoc(t, c, n.BuildAlias, "keep")

	if err := index.FinishBuild(ctx, c, n, build); err != nil {
		t.Fatalf("FinishBuild: %v", err)
	}

	assertAliasOn(t, c, n.Alias, build)
	if indexExists(t, c, n.Index) {
		t.Fatalf("old index %s still exists", n.Index)
	}
	assertNoBuild(t, c, n)

	// A search, not a GET: GET is realtime and would pass without a refresh.
	ids := searchIDs(t, c, n.Alias)
	if !slices.Contains(ids, "keep") || slices.Contains(ids, "ghost") {
		t.Fatalf("search found %v, want keep and not ghost", ids)
	}

	s := indexSettings(t, c, build)
	if s.RefreshInterval != nil || s.GCDeletes != nil {
		t.Fatalf("settings not reset: refresh_interval=%q gc_deletes=%q", deref(s.RefreshInterval), deref(s.GCDeletes))
	}
}

func TestFinishWithStaleBuildName(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	stale, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("first StartBuild: %v", err)
	}
	current, err := index.StartBuild(ctx, c, n, 0)
	if err != nil {
		t.Fatalf("takeover StartBuild: %v", err)
	}

	if err := index.FinishBuild(ctx, c, n, stale); !errors.Is(err, index.ErrBuildGone) {
		t.Fatalf("FinishBuild(%s): got %v, want ErrBuildGone", stale, err)
	}
	assertAliasOn(t, c, n.Alias, n.Index)
	assertCurrentBuild(t, c, n, current)
}

func TestAbortDropsOnlyTheBuild(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	build, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("StartBuild: %v", err)
	}
	if err := index.AbortBuild(ctx, c, n, build); err != nil {
		t.Fatalf("AbortBuild: %v", err)
	}
	assertNoBuild(t, c, n)
	// The index stays, so its number isn't reused; the next start sweeps it.
	if !indexExists(t, c, build) {
		t.Fatalf("build %s was deleted by abort", build)
	}
	assertAliasOn(t, c, n.Alias, n.Index)

	if err := index.AbortBuild(ctx, c, n, build); !errors.Is(err, index.ErrBuildGone) {
		t.Fatalf("second AbortBuild: got %v, want ErrBuildGone", err)
	}
}

// An aborted run's later calls must never match the next run's index.
func TestBuildNamesAreNeverReused(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	aborted, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("first StartBuild: %v", err)
	}
	if err := index.AbortBuild(ctx, c, n, aborted); err != nil {
		t.Fatalf("AbortBuild: %v", err)
	}
	if err := index.FinishBuild(ctx, c, n, aborted); !errors.Is(err, index.ErrBuildGone) {
		t.Fatalf("FinishBuild(%s) after abort: got %v, want ErrBuildGone", aborted, err)
	}

	next, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("second StartBuild: %v", err)
	}
	if want := n.Alias + "-v3"; next != want {
		t.Fatalf("second build = %q, want %q", next, want)
	}
	if indexExists(t, c, aborted) {
		t.Fatalf("aborted build %s was not swept", aborted)
	}
	if err := index.FinishBuild(ctx, c, n, aborted); !errors.Is(err, index.ErrBuildGone) {
		t.Fatalf("FinishBuild(%s) after the next start: got %v, want ErrBuildGone", aborted, err)
	}
	if err := index.AbortBuild(ctx, c, n, aborted); !errors.Is(err, index.ErrBuildGone) {
		t.Fatalf("AbortBuild(%s) after the next start: got %v, want ErrBuildGone", aborted, err)
	}
	assertCurrentBuild(t, c, n, next)
	assertAliasOn(t, c, n.Alias, n.Index)
}

// A start whose create fails must not sweep first: if the highest number is
// an aborted build, sweeping it lowers the next number, and a later start
// would reuse the aborted run's name.
func TestFailedStartKeepsNumbering(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	aborted, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("first StartBuild: %v", err)
	}
	if err := index.AbortBuild(ctx, c, n, aborted); err != nil {
		t.Fatalf("AbortBuild: %v", err)
	}

	// An alias named like the next build makes its create fail. It sits on
	// an index named <alias>-v<non-digits>, which numbering ignores and the
	// test cleanup deletes.
	blocked := n.Alias + "-v3"
	holder := n.Alias + "-vblock"
	if _, err := c.Indices.Create(ctx, opensearchapi.IndicesCreateReq{
		Index:      holder,
		BodyReader: strings.NewReader(`{"aliases": {"` + blocked + `": {}}}`),
	}); err != nil {
		t.Fatalf("create %s: %v", holder, err)
	}
	if _, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter); err == nil {
		t.Fatalf("StartBuild with %s taken: want an error", blocked)
	}
	if !indexExists(t, c, aborted) {
		t.Fatalf("a start whose create failed swept %s", aborted)
	}

	if _, err := c.Indices.DeleteAlias(ctx, &opensearchapi.IndicesDeleteAliasReq{Indices: []string{holder}, Name: []string{blocked}}); err != nil {
		t.Fatalf("remove alias %s: %v", blocked, err)
	}
	next, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("StartBuild: %v", err)
	}
	if next != blocked {
		t.Fatalf("next build = %q, want %q (never %q again)", next, blocked, aborted)
	}
	if indexExists(t, c, aborted) {
		t.Fatalf("aborted build %s was not swept after the create", aborted)
	}
	assertCurrentBuild(t, c, n, next)
}

// If the live alias already includes the build, finish must not remove the
// alias from the build or delete it as an old index.
func TestFinishWhenLiveAlreadyIncludesBuild(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	build, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("StartBuild: %v", err)
	}
	if _, err := c.Indices.PutAlias(ctx, opensearchapi.IndicesPutAliasReq{Name: n.Alias, Indices: []string{build}}); err != nil {
		t.Fatalf("put live alias on build: %v", err)
	}

	if err := index.FinishBuild(ctx, c, n, build); err != nil {
		t.Fatalf("FinishBuild: %v", err)
	}
	if !indexExists(t, c, build) {
		t.Fatalf("build %s was deleted", build)
	}
	assertAliasOn(t, c, n.Alias, build)
	if indexExists(t, c, n.Index) {
		t.Fatalf("old index %s still exists", n.Index)
	}
}

// An abort that loses the race with finish must not delete the index that
// has just gone live.
func TestAbortAfterFinishLeavesLiveIndex(t *testing.T) {
	ctx := context.Background()
	c := ittest.Client(t)
	n := ittest.Index(t, c)

	build, err := index.StartBuild(ctx, c, n, index.BuildStaleAfter)
	if err != nil {
		t.Fatalf("StartBuild: %v", err)
	}
	if err := index.FinishBuild(ctx, c, n, build); err != nil {
		t.Fatalf("FinishBuild: %v", err)
	}
	if err := index.AbortBuild(ctx, c, n, build); !errors.Is(err, index.ErrBuildGone) {
		t.Fatalf("AbortBuild after finish: got %v, want ErrBuildGone", err)
	}
	assertAliasOn(t, c, n.Alias, build)
}

func assertCurrentBuild(t *testing.T, c *opensearchapi.Client, n index.Names, want string) {
	t.Helper()
	got, ok, err := index.CurrentBuild(context.Background(), c, n)
	if err != nil || !ok || got != want {
		t.Fatalf("CurrentBuild = %q, %v, %v; want %q", got, ok, err, want)
	}
}

func assertNoBuild(t *testing.T, c *opensearchapi.Client, n index.Names) {
	t.Helper()
	got, ok, err := index.CurrentBuild(context.Background(), c, n)
	if err != nil || ok {
		t.Fatalf("CurrentBuild = %q, %v, %v; want none", got, ok, err)
	}
}

// assertAliasOn checks that alias resolves to exactly want.
func assertAliasOn(t *testing.T, c *opensearchapi.Client, alias, want string) {
	t.Helper()
	resp, err := c.Indices.GetAlias(context.Background(), &opensearchapi.IndicesGetAliasReq{Name: []string{alias}})
	if err != nil {
		t.Fatalf("get alias %s: %v", alias, err)
	}
	if len(resp.Entries) != 1 {
		t.Fatalf("alias %s points at %d indices, want only %s", alias, len(resp.Entries), want)
	}
	if _, ok := resp.Entries[want]; !ok {
		t.Fatalf("alias %s does not point at %s: %v", alias, want, resp.Entries)
	}
}

// versionIndices returns the sorted names of every <alias>-v* index.
func versionIndices(t *testing.T, c *opensearchapi.Client, n index.Names) []string {
	t.Helper()
	resp, err := c.Indices.GetAlias(context.Background(), &opensearchapi.IndicesGetAliasReq{
		Indices: []string{n.Alias + "-v*"},
		Params:  &opensearchapi.IndicesGetAliasParams{AllowNoIndices: new(true), ExpandWildcards: []string{"all"}},
	})
	if err != nil {
		t.Fatalf("list %s-v*: %v", n.Alias, err)
	}
	var names []string
	for name := range resp.Entries {
		names = append(names, name)
	}
	slices.Sort(names)
	return names
}

func indexExists(t *testing.T, c *opensearchapi.Client, name string) bool {
	t.Helper()
	resp, err := c.Indices.Exists(context.Background(), &opensearchapi.IndicesExistsReq{Indices: []string{name}})
	switch osclient.StatusOf(resp, err) {
	case 200:
		return true
	case 404:
		return false
	}
	t.Fatalf("exists %s: %v", name, err)
	return false
}

// indexSettings returns the index-level settings that are set explicitly;
// one left at its default is nil.
func indexSettings(t *testing.T, c *opensearchapi.Client, name string) *opensearchapi.IndicesIndexSettings {
	t.Helper()
	resp, err := c.Indices.GetSettings(context.Background(), &opensearchapi.IndicesGetSettingsReq{Indices: []string{name}})
	if err != nil {
		t.Fatalf("get settings %s: %v", name, err)
	}
	st, ok := resp.Entries[name]
	if !ok || st.Settings == nil || st.Settings.Index == nil {
		t.Fatalf("no index settings for %s", name)
	}
	return st.Settings.Index
}

// putDoc indexes a minimal document without a refresh.
func putDoc(t *testing.T, c *opensearchapi.Client, target, id string) {
	t.Helper()
	_, err := c.Doc.Index(context.Background(), opensearchapi.IndexReq{
		Index:  target,
		ID:     id,
		Body:   strings.NewReader(`{"id":"` + id + `"}`),
		Params: &opensearchapi.IndexParams{Refresh: "false", RequireAlias: new(true)},
	})
	if err != nil {
		t.Fatalf("index %s into %s: %v", id, target, err)
	}
}

func searchIDs(t *testing.T, c *opensearchapi.Client, target string) []string {
	t.Helper()
	resp, err := c.Search(context.Background(), &opensearchapi.SearchReq{Indices: []string{target}})
	if err != nil {
		t.Fatalf("search %s: %v", target, err)
	}
	var ids []string
	for _, h := range resp.Hits.Hits {
		ids = append(ids, deref(h.ID))
	}
	return ids
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
