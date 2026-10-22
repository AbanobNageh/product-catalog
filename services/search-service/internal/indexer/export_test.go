package indexer

import "testing"

// SetAfterBuildCheck makes BulkBuild call f between its CurrentBuild check
// and its write, until the test ends.
func SetAfterBuildCheck(t testing.TB, f func()) {
	t.Helper()
	afterBuildCheck = f
	t.Cleanup(func() { afterBuildCheck = nil })
}
