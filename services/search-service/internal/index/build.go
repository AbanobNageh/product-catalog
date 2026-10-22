package index

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/opensearch-project/opensearch-go/v5"
	"github.com/opensearch-project/opensearch-go/v5/opensearchapi"

	"github.com/AbanobNageh/product-catalog/services/search-service/internal/osclient"
)

// The build lifecycle of an alias-swap reindex (ADR-0007). The build alias
// exists only while a reindex runs: it points at the index being built, and
// it is the lock against a second run. Each run is identified by its build
// index name, and every alias change checks the build alias with must_exist,
// so a taken-over or aborted run can't touch the next run's index.

// buildTimeout bounds each OpenSearch call made by the build lifecycle. These
// calls create, refresh and delete whole indices, so they get longer than
// callTimeout.
const buildTimeout = 10 * time.Second

// BuildStaleAfter is how old a build index must be before a new reindex may
// take it over as abandoned.
const BuildStaleAfter = 10 * time.Minute

// ErrBuildRunning means another reindex holds the build alias. Callers turn
// it into a 409.
var ErrBuildRunning = errors.New("a reindex is already running")

// ErrBuildGone means the named build is no longer behind the build alias: it
// was aborted, finished, or taken over. Callers turn it into a 409.
var ErrBuildGone = errors.New("the reindex build was aborted or replaced")

// BuildBody is Body for a build index: the same mapping, with refresh off
// for a fast bulk load, and tombstones kept for 10 minutes so a versioned
// delete still rejects the bulk load's stale copy (ADR-0007). The build alias
// is the index's write index, so a second index can never join it: a start
// that races another start (and numbered its index after the other's create)
// fails to create its index instead of leaving two behind the alias.
func BuildBody(buildAlias string) []byte {
	return body(buildAlias, `, "refresh_interval": "-1", "gc_deletes": "10m"`, `"is_write_index": true`)
}

// StartBuild creates the next <alias>-v<n> index behind the build alias and
// returns its name. If a build younger than staleAfter is running it returns
// ErrBuildRunning; an older one is aborted and taken over. Once the new index
// exists, it deletes every <alias>-v<n> index that has no aliases: aborted
// builds, and old indices a finish failed to delete.
func StartBuild(ctx context.Context, c *opensearchapi.Client, n Names, staleAfter time.Duration) (string, error) {
	cur, ok, err := CurrentBuild(ctx, c, n)
	if err != nil {
		return "", err
	}
	var age time.Duration
	if ok {
		created, err := creationTime(ctx, c, cur)
		if err != nil {
			return "", err
		}
		if age = time.Since(created); age < staleAfter {
			return "", ErrBuildRunning
		}
	}

	// Number the new build before anything is swept, and sweep only once it
	// exists, so the highest number only grows and a name is never reused:
	// an aborted run's later calls must never match a newer run's index. (A
	// sweep before a create that then failed could delete the highest
	// number, and the next start would number its build the same.)
	vs, err := listVersions(ctx, c, n.Alias)
	if err != nil {
		return "", err
	}
	next := n.Alias + "-v" + strconv.Itoa(maxVersion(vs)+1)
	if ok {
		// ErrBuildGone means someone else aborted or took it over first,
		// which is what we wanted anyway.
		if err := AbortBuild(ctx, c, n, cur); err != nil && !errors.Is(err, ErrBuildGone) {
			return "", fmt.Errorf("take over build %s: %w", cur, err)
		}
		slog.WarnContext(ctx, "abandoned build taken over", "index", cur, "age", age.Round(time.Second).String())
		// List again, so OpenSearch decides what's unused now, not what we
		// expect the takeover did (the old build might have just gone live).
		if vs, err = listVersions(ctx, c, n.Alias); err != nil {
			return "", err
		}
	}

	cctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	resp, err := c.Indices.Create(cctx, opensearchapi.IndicesCreateReq{
		Index:      next,
		BodyReader: bytes.NewReader(BuildBody(n.BuildAlias)),
	})
	switch {
	case err == nil:
		// vs was listed before the create, so it can't hold the new build,
		// which has the build alias anyway.
		sweep(ctx, c, vs)
		return next, nil
	case osclient.ErrorType(err) == "resource_already_exists_exception":
		// A concurrent start picked the same number and won.
		return "", ErrBuildRunning
	case osclient.ErrorType(err) == "illegal_state_exception":
		// A concurrent start created its index after we numbered ours, so
		// the build alias already has a write index. OpenSearch answers 500,
		// which Classify would make a 503, so it is matched first.
		return "", ErrBuildRunning
	default:
		return "", fmt.Errorf("create build index %s: %w", next, osclient.Classify(osclient.Raw(resp), err))
	}
}

// CurrentBuild returns the index behind the build alias, and false if no
// reindex is running.
func CurrentBuild(ctx context.Context, c *opensearchapi.Client, n Names) (string, bool, error) {
	ctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	resp, err := c.Indices.GetAlias(ctx, &opensearchapi.IndicesGetAliasReq{Name: []string{n.BuildAlias}})
	if osclient.StatusOf(osclient.Raw(resp), err) == 404 {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("get alias %s: %w", n.BuildAlias, osclient.Classify(osclient.Raw(resp), err))
	}
	switch len(resp.Entries) {
	case 0:
		return "", false, nil
	case 1:
		for name := range resp.Entries {
			return name, true, nil
		}
	}
	// Only a start racing another start can get here. Aborting each index
	// by name clears it.
	return "", false, fmt.Errorf("alias %s points at %d indices", n.BuildAlias, len(resp.Entries))
}

// FinishBuild makes build live: it restores the default settings, refreshes,
// moves the live alias from the old index to build and drops the build alias
// in one guarded call, refreshes again, and deletes the old index. It returns
// ErrBuildGone if build is no longer the current build. The swap is the
// commit point: failures after it are logged, not returned, and an old index
// left behind is swept by the next StartBuild.
func FinishBuild(ctx context.Context, c *opensearchapi.Client, n Names, build string) error {
	cur, ok, err := CurrentBuild(ctx, c, n)
	if err != nil {
		return err
	}
	if !ok || cur != build {
		return fmt.Errorf("finish %s: %w", build, ErrBuildGone)
	}

	// null resets refresh_interval and gc_deletes to their defaults.
	cctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	sresp, err := c.Indices.PutSettings(cctx, &opensearchapi.IndicesPutSettingsReq{
		Indices:    []string{build},
		BodyReader: strings.NewReader(`{"index": {"refresh_interval": null, "gc_deletes": null}}`),
	})
	if err != nil {
		return buildErr("reset settings of "+build, osclient.Raw(sresp), err)
	}
	if resp, err := refresh(ctx, c, build); err != nil {
		return buildErr("refresh "+build, resp, err)
	}

	old, err := liveIndices(ctx, c, n.Alias)
	if err != nil {
		return err
	}
	actions := []opensearchapi.IndicesUpdateAliasesAction{
		removeAlias(build, n.BuildAlias),
		{Add: &opensearchapi.IndicesUpdateAliasesAddAction{Index: new(build), Alias: new(n.Alias)}},
	}
	for _, o := range old {
		if o == build {
			continue
		}
		actions = append(actions, opensearchapi.IndicesUpdateAliasesAction{
			Remove: &opensearchapi.IndicesUpdateAliasesRemoveAction{Index: new(o), Alias: new(n.Alias)},
		})
	}
	if err := updateAliases(ctx, c, "swap "+n.Alias+" to "+build, actions); err != nil {
		return err
	}

	// The build is live from here on. Refresh again so build writes that
	// landed between the first refresh and the swap are searchable before
	// catalog-api bumps its search-cache version. With refresh_interval back
	// at its default, a failed refresh only delays that by about a second.
	if resp, err := refresh(ctx, c, build); err != nil {
		slog.WarnContext(ctx, "refresh after swap failed", "index", build, "err", osclient.Classify(resp, err))
	}
	for _, o := range old {
		if o == build {
			continue
		}
		if err := deleteIndex(ctx, c, o); err != nil {
			slog.WarnContext(ctx, "delete of old index after swap failed; the next reindex sweeps it", "index", o, "err", err)
		}
	}
	return nil
}

// AbortBuild removes the build alias from build, or returns ErrBuildGone if
// it isn't there. The must_exist remove is the guard: once it succeeds, no
// finish can make build live. The index stays until the next StartBuild
// sweeps it, so its number is never reused. (It can't be dropped in the same
// call: OpenSearch applies remove_index before the alias actions of an
// _aliases call, so the guarded remove would always fail with
// index_not_found_exception.)
func AbortBuild(ctx context.Context, c *opensearchapi.Client, n Names, build string) error {
	return updateAliases(ctx, c, "abort "+build, []opensearchapi.IndicesUpdateAliasesAction{
		removeAlias(build, n.BuildAlias),
	})
}

// removeAlias removes alias from index, failing the whole _aliases call if
// the alias isn't on that index.
func removeAlias(index, alias string) opensearchapi.IndicesUpdateAliasesAction {
	return opensearchapi.IndicesUpdateAliasesAction{
		Remove: &opensearchapi.IndicesUpdateAliasesRemoveAction{Index: new(index), Alias: new(alias), MustExist: new(true)},
	}
}

// updateAliases applies actions atomically. A missing index or alias means
// the build was aborted or replaced.
func updateAliases(ctx context.Context, c *opensearchapi.Client, what string, actions []opensearchapi.IndicesUpdateAliasesAction) error {
	ctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	resp, err := c.Indices.UpdateAliases(ctx, &opensearchapi.IndicesUpdateAliasesReq{
		Body: &opensearchapi.IndicesUpdateAliasesBody{Actions: actions},
	})
	if err != nil {
		return buildErr(what, osclient.Raw(resp), err)
	}
	return nil
}

// buildErr maps a missing index or alias to ErrBuildGone and classifies
// anything else.
func buildErr(what string, resp *opensearch.Response, err error) error {
	switch t := osclient.ErrorType(err); t {
	case "index_not_found_exception", "aliases_not_found_exception":
		return fmt.Errorf("%s: %w (%s)", what, ErrBuildGone, t)
	}
	return fmt.Errorf("%s: %w", what, osclient.Classify(resp, err))
}

// refresh returns the raw response and error, so the caller decides whether
// a missing index means ErrBuildGone (before the swap) or not (after it).
func refresh(ctx context.Context, c *opensearchapi.Client, index string) (*opensearch.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	resp, err := c.Indices.Refresh(ctx, &opensearchapi.IndicesRefreshReq{Indices: []string{index}})
	return osclient.Raw(resp), err
}

// deleteIndex deletes index by name. Already gone counts as success.
func deleteIndex(ctx context.Context, c *opensearchapi.Client, index string) error {
	ctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	resp, err := c.Indices.Delete(ctx, &opensearchapi.IndicesDeleteReq{Indices: []string{index}})
	if err != nil && osclient.ErrorType(err) != "index_not_found_exception" {
		return fmt.Errorf("delete index %s: %w", index, osclient.Classify(osclient.Raw(resp), err))
	}
	return nil
}

// liveIndices returns the indices behind alias, or none if it's missing.
func liveIndices(ctx context.Context, c *opensearchapi.Client, alias string) ([]string, error) {
	ctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	resp, err := c.Indices.GetAlias(ctx, &opensearchapi.IndicesGetAliasReq{Name: []string{alias}})
	if osclient.StatusOf(osclient.Raw(resp), err) == 404 {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get alias %s: %w", alias, osclient.Classify(osclient.Raw(resp), err))
	}
	names := make([]string, 0, len(resp.Entries))
	for name := range resp.Entries {
		names = append(names, name)
	}
	return names, nil
}

// creationTime reads index.creation_date (epoch ms, sent as a string).
func creationTime(ctx context.Context, c *opensearchapi.Client, index string) (time.Time, error) {
	ctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	resp, err := c.Indices.GetSettings(ctx, &opensearchapi.IndicesGetSettingsReq{
		Indices: []string{index},
		Name:    []string{"index.creation_date"},
	})
	if err != nil {
		return time.Time{}, fmt.Errorf("get creation date of %s: %w", index, osclient.Classify(osclient.Raw(resp), err))
	}
	st := resp.Entries[index]
	if st.Settings == nil || st.Settings.Index == nil || st.Settings.Index.CreationDate == nil {
		return time.Time{}, fmt.Errorf("index %s has no creation date", index)
	}
	cd := st.Settings.Index.CreationDate
	ms, err := cd.Int64()
	if err != nil {
		s, serr := cd.String()
		if serr != nil {
			return time.Time{}, fmt.Errorf("creation date of %s: %w", index, serr)
		}
		if ms, err = strconv.ParseInt(s, 10, 64); err != nil {
			return time.Time{}, fmt.Errorf("creation date of %s: %w", index, err)
		}
	}
	return time.UnixMilli(ms), nil
}

// version is one <alias>-v<n> index.
type version struct {
	name    string
	n       int
	aliased bool
}

// listVersions returns every <alias>-v<digits> index, open or closed, and
// whether it has any alias.
func listVersions(ctx context.Context, c *opensearchapi.Client, alias string) ([]version, error) {
	ctx, cancel := context.WithTimeout(ctx, buildTimeout)
	defer cancel()
	prefix := alias + "-v"
	resp, err := c.Indices.GetAlias(ctx, &opensearchapi.IndicesGetAliasReq{
		Indices: []string{prefix + "*"},
		Params: &opensearchapi.IndicesGetAliasParams{
			AllowNoIndices:    new(true),
			IgnoreUnavailable: new(true),
			ExpandWildcards:   []string{"all"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("list %s*: %w", prefix, osclient.Classify(osclient.Raw(resp), err))
	}
	var vs []version
	for name, a := range resp.Entries {
		digits, ok := strings.CutPrefix(name, prefix)
		// Atoi accepts a sign; a version is digits only.
		if !ok || digits == "" || digits[0] < '0' || digits[0] > '9' {
			continue
		}
		if v, err := strconv.Atoi(digits); err == nil {
			vs = append(vs, version{name: name, n: v, aliased: len(a.Aliases) > 0})
		}
	}
	return vs, nil
}

func maxVersion(vs []version) int {
	m := 0
	for _, v := range vs {
		m = max(m, v.n)
	}
	return m
}

// sweep deletes every listed index that has no aliases. Nothing needs one: a
// build has the build alias from its create call until finish swaps in the
// live alias in the same call that drops it. A failed delete is only logged;
// the next start tries again.
func sweep(ctx context.Context, c *opensearchapi.Client, vs []version) {
	for _, v := range vs {
		if v.aliased {
			continue
		}
		if err := deleteIndex(ctx, c, v.name); err != nil {
			slog.WarnContext(ctx, "sweep of unused index failed", "index", v.name, "err", err)
		}
	}
}
