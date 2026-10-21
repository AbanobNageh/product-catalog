import type { SearchQuery } from './search.ports';

/**
 * Cache key for a search: `search:v<version>:<normalised query>`. Equivalent
 * queries (field order, q case/whitespace, unset fields) share a key. Bumping
 * the version on every product write makes all older entries unreachable;
 * they expire through their TTL.
 */
export function searchCacheKey(query: SearchQuery, version: number): string {
  const normalised: Record<string, unknown> = {};
  for (const name of Object.keys(query).sort()) {
    let value = query[name as keyof SearchQuery];
    if (name === 'q' && typeof value === 'string') {
      value = value.trim().toLowerCase();
    }
    if (value === undefined || value === '') continue;
    normalised[name] = value;
  }
  return `search:v${version}:${JSON.stringify(normalised)}`;
}
