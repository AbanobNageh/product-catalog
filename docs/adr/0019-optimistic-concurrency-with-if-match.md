# 0019. Optimistic concurrency with a version column and `If-Match`

- **Status:** Accepted (approved at the 5.2 close)
- **Date:** 2026-10-25

## Context
- `PATCH /products/:id` and `DELETE /products/:id` are last-write-wins. An agent reads stock = 3, a sale makes it 2, the agent writes 13 meaning "+10", and the sale is lost without any error ([Part 5 plan](../plan/agent-ready-api.md#52-optimistic-concurrency-if-match)).
- HTTP's answer is a conditional request: the client sends back the `ETag` it read in `If-Match`, and the server refuses with `412 Precondition Failed` if the resource has changed since (RFC 9110, sections 8.8.3 and 13.1.1).
- **What exists today:**
  - `updatedAt` (`@updatedAt`, millisecond precision) is the only change marker.
  - Express already adds an automatic **weak** ETag to every JSON response, a hash of the body (checked live on 2026-10-25: `ETag: W/"124-rj28…"`). It answers `If-None-Match` with a 304. Nothing reads `If-Match`.
  - catalog-api already sends search-service a `version`: `SearchIndexer.remove(id, version)`, a **millisecond timestamp** that makes deletes outrank older index writes ([ADR-0007](0007-alias-swap-reindex-with-live-writes.md)). search-service's index version is also `updatedAt` in milliseconds.
  - Existing clients send no condition: the seed (it inserts into Postgres directly and only calls `POST /admin/reindex`), the k6 load test (`GET` only), the e2e test, and anyone trying the API from Swagger or curl.
- The agent's MCP server (a separate repo) will always send `If-Match`.

## Options
1. **What to compare:**
   - (a) `updatedAt`. Two writes in the same millisecond get the same value, so a conflict between them goes unnoticed.
   - (b) **A `version` integer column**, incremented on every update. It changes exactly once per write.
   - (c) A hash of the row, which needs no column but has to be computed on every read and compared inside the update.
2. **Whether the condition is required:**
   - (a) **Optional**: without `If-Match`, `PATCH` and `DELETE` work as today.
   - (b) Required: a request without `If-Match` gets `428 Precondition Required` (RFC 6585).
3. **Which `If-Match` values are accepted:**
   - (a) **Exactly one strong ETag, `"<version>"`**: anything else (`*`, a weak `W/"3"`, a list, a bare `3`) gets 400 with the expected format.
   - (b) Full RFC 9110: `*` means "the product must exist", a weak ETag never matches (412), and a list matches if any entry does.
4. **Naming**, since `version` would then mean two different things in catalog-api:
   - (a) **Rename the existing index parameter in catalog-api's code to `indexVersion`.** search-service's `?version=` URL parameter stays as it is.
   - (b) Keep both names, and explain the difference in comments.

## Decision
1(b), 2(a), 3(a) and 4(a): the user's choices on 2026-10-25, all as the plan recommended.
- **Column:** `version INTEGER NOT NULL DEFAULT 1`, added by a new migration. Existing rows get 1. Since PostgreSQL 11, adding a column with a constant default only changes the catalog and doesn't rewrite the table.
- **Exposed** as `version` in `ProductResponse`, and as a strong `ETag: "<version>"` header on `GET`, `POST` and `PATCH /products/:id`. Setting the header ourselves replaces Express's weak ETag on those responses. Lists and search keep Express's weak one, so it can't be mistaken for a version.
- **Every update increments `version`**, with or without `If-Match`, so a client that does send one always notices a write from a client that doesn't.
- **One query, no race:** the condition goes into the write's `WHERE` clause:
  1. `prisma.product.update({ where: { id, version }, data: { ...dto, version: { increment: 1 } } })`.
  2. `delete` gets the same `where`.
  3. On Prisma's P2025 ("no row matched"), look the product up to tell the two cases apart: gone means 404, a different version means 412.
- **Status codes:**
  - A mismatch returns 412, with the current version in the body: `{"statusCode":412,"message":"product changed: you sent version 3, current is 4","error":"Precondition Failed","currentVersion":4}`.
  - A missing product is still 404, also when `If-Match` was sent.
  - A malformed `If-Match` returns 400.
- **Retries:** a `PATCH` retried after a timeout gets a 412 when its own first attempt already went through and raised the version. The client then re-reads the product: if the values it wanted are already there, the first attempt succeeded. This is documented in Swagger.
- **Search results don't carry `version`.**
  - The index mapping is `dynamic: strict`, so indexing the field would need a mapping change and a new index.
  - Search hits get their own response type without `version`.
  - search-service ignores the extra field in the product it receives (`json.Unmarshal` without `DisallowUnknownFields`); a test pins that.
  - The rule for clients: search results may be stale, so read `GET /products/:id` before writing.
- **Cache:** the cached product includes `version`. Every write already deletes `product:<id>`. A product cached before this release has no `version`, so it is treated as a cache miss.

## Consequences
- An agent can make "read, decide, write" safe. A lost update becomes a 412 that tells it to re-read.
- Existing clients keep working unchanged. The cost of an optional condition: a client that never sends `If-Match` is still last-write-wins. Making it required later is a separate decision, with a new ADR.
- **The rule is strict on purpose.** `*`, weak ETags and lists get a 400 even though RFC 9110 allows them. No current client needs them, and one format is easier for an agent to follow and to test.
- **A body-hash ETag sent back** (from a list or search response, or from an older release) gets a 400 that names the expected format.
- `GET /products/:id` with `If-None-Match: "<version>"` still gets a 304 from Express, now based on the version.
- **During a rolling upgrade**, pods from the previous release update rows without incrementing `version`. A conditional write can therefore miss a concurrent write from an old pod, for the length of the rollout. The migration runs before the rollout (the pre-upgrade hook, [ADR-0013](0013-migration-and-seed-as-helm-hooks.md)), and old pods ignore the new column.
- `version` and `indexVersion` are separate values: one counts writes, the other orders index writes by time.
