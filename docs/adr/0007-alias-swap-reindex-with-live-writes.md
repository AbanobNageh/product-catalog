# 0007. Alias-swap reindex that keeps taking writes

- **Status:** Accepted (approved at the 1.5 close)
- **Date:** 2026-10-22

## Context
- `POST /admin/reindex` (1.4) pages through Postgres and bulk-upserts into the live index behind the `products` alias. It only **upserts**, so a product deleted while search-service was down stays searchable forever (the 1.4 "ghost" gap).
- Bulk uses `refresh=wait_for` per batch (1.4 finding A), so 10k products take about 21s.
- Writes are already versioned: upserts use `version = updatedAt` in Unix ms with `version_type=external_gte`, so a stale copy can't overwrite a newer one. **Deletes are not versioned.**
- ADR-0001 and `docs/plan/extras.md` planned "zero-downtime reindexing by swapping the alias" for Part 4. The user pulled it into 1.5 and wants **product edits to keep working while a reindex runs**. A maintenance mode (writes return 503 during reindex) was the fallback if this couldn't be made safe.

### Spikes (2026-10-22, throwaway indices, OpenSearch 3.9.0)
**Tombstones** (index with refresh off):

| Case | Result |
|---|---|
| Unversioned delete of a doc not loaded yet, then a bulk index at v100 | Doc **comes back** (today's behaviour) |
| Delete at v200 (`external_gte`) of a doc not loaded yet, then a bulk index at v100 | **409**, doc stays gone. A later v300 index succeeds |
| Doc at v100, delete at v200, then a bulk index at v150 | **409**, doc stays gone |
| As row 2, but after `gc_deletes` (lowered to 2s) and a refresh | Doc **comes back** |

So a versioned delete leaves a tombstone, even for a doc that isn't there yet. The tombstone rejects older writes for `index.gc_deletes` (default 60s).

**Auto-create** (found by the design review): a `_bulk` delete aimed at a missing index or alias, with `require_alias=true`.

| Case | Result |
|---|---|
| Unversioned (today) | 404, nothing created |
| Versioned (`external_gte`) | 404 `not_found`, but **the index is created**. `require_alias` is ignored for deletes. |

The cluster default is `action.auto_create_index: true`, which 1.3 left alone because the code protected itself (`require_alias`, and deletes through `_bulk`). Versioned deletes break that protection.

## Considered options
1. **Maintenance mode.** A Redis flag makes catalog-api's writes return 503 while reindex runs. Simple and safe, but edits are blocked, and the window grows with the catalogue.
2. **Alias swap with dual-writes** (chosen). Build a new index while live writes go to both indices, then swap the alias atomically.
3. **Alias swap plus a catch-up pass.** No dual-write: after the bulk load, re-send products with `updatedAt >= start`. This can't see hard deletes, so ghosts come back.

For the auto-create problem, the user chose between:
- **(a) Infra blocks auto-create for `products*`, and search-service checks it** (chosen).
- **(b) search-service sets the cluster setting itself.** Rejected: an app shouldn't change a cluster-wide setting or override an operator's value (for example on Amazon OpenSearch in T5).
- **(c) Maintenance mode.**

## Decision
Option 2, with auto-create blocked by infrastructure.

### Auto-create guard
- OpenSearch runs with `action.auto_create_index: "-products*,+*"`. The test-index prefix is added if the integration tests need it. The value is set:
  - now, in the Compose OpenSearch environment
  - later, in the user's Kubernetes manifests (Part 2) and Terraform (Part 3)
- search-service checks the effective setting at startup and **fails to start** with a clear error if a `products*` index could still be auto-created. That makes it fail fast, like a missing alias. Whether it reads the setting or probes it is the builder's call.
- This narrows 1.3's "no cluster settings" stance. The code still protects itself; it now does so by refusing to run on a cluster that's set up wrong.

### Index and alias layout
- `products` is the read/write alias, as today. Concrete indices are `products-v<n>`; startup `Ensure` still creates `products-v1` when the alias is missing.
- `products-build` is a second alias that exists **only while a reindex runs**. It points at the index being built. It is the shared "a rebuild is running" flag that every search-service replica sees, and the lock against a second reindex.

### Versioned deletes
- catalog-api `remove` uses the row Prisma's `delete` returns and sends `version = max(Date.now(), updatedAt_ms + 1)`. That is always later than the product's last upsert, even with clock skew between replicas (`@updatedAt` is set by the Prisma client, so it's the same kind of clock).
- `DELETE /products/{id}?version=<ms>` on search-service. `version` is required (400 without it). It's sent as `version_type=external_gte`. "Not found" stays a success. A 409 (a newer upsert exists) is treated as "skipped", like a stale upsert.

### The reindex flow
catalog-api orchestrates; search-service owns the index operations. **Each run is identified by its build index name**, which `start` returns and every later call must pass.

1. **Start:** `POST /reindex/start` returns the build index name.
   - If `products-build` exists and its index is younger than 10 minutes (`index.creation_date`), return **409**. catalog-api returns 409 to its caller ("a reindex is already running").
   - If it's older, treat it as abandoned: delete that index (which drops the alias), log it, and continue. The abandoned run's later calls then fail with 409 because their build name no longer matches.
   - Create `products-v<n+1>` with the same mapping, `refresh_interval: -1`, `gc_deletes: 10m` and the `products-build` alias, all in one create call.
2. **Dual-write:** every single-product upsert and delete goes to **both** aliases: **the build alias first, then live**. Each uses `require_alias=true`, and deletes are covered by the auto-create guard.
   - **Why that order:** a live write could resolve to the old index just before the swap, while the build write that follows finds no build alias. The old index is then deleted, and the edit is lost. Writing the build first closes that gap.
   - The live write keeps `refresh=wait_for`. The build write must **not** use `wait_for`: the build index has refresh off, so it would hang until the timeout. Verify this in a test.
   - If the build alias is missing, the build write is a no-op: no build is running, or it just finished.
   - If the build write fails for any other reason, search-service **aborts that build** and logs it. The client still gets the live write's result, so the user's edit isn't failed by a background job.
   - A live write still waiting (`wait_for`) on an old index while `finish` deletes it may return an error. That's logged like any other index failure; no data is lost, because the build write already landed.
3. **Load:** catalog-api pages through Postgres (as today) and sends each batch to `POST /reindex/_bulk` with the build name.
   - It writes to the named build index with no refresh, only if `products-build` still points at it. Otherwise it returns **409**, and catalog-api stops and reports the reindex as failed.
   - *Amended after the final review:* the batch is written to the build index **by its concrete name**, not through the alias. If it went through the alias, a run aborted between the check and the write could land its stale batch in a newer run's index. A deleted build then answers `index_not_found`, because of the auto-create guard.
   - *Also amended:* the build alias is created with `is_write_index: true`. Two starts that race then can't both attach the alias: the second create fails atomically, and the caller gets 409.
4. **Finish:** `POST /reindex/finish` with the build name.
   - Set `refresh_interval` and `gc_deletes` back to their defaults, and refresh once.
   - In **one** `_aliases` call, using `must_exist` on `products-build` so the call fails if the run was taken over or aborted:
     - add `products` → new
     - remove `products` → old
     - remove `products-build`
   - Refresh the new index **again**, so build writes that landed between the first refresh and the swap are searchable before catalog-api bumps the search-cache version.
   - Delete the old index.
   - A build name that no longer matches returns 409.
   - The swap is the commit point. A failure after it (the second refresh, or deleting the old index) is logged, not returned, so catalog-api never reports "not swapped" for a swap that happened. A leftover old index has no alias, so the next `start` cleans it up.
5. **Abort:** `POST /reindex/abort` with the build name.
   - One guarded `_aliases` call removes `products-build` from that build index with `must_exist`. That call alone settles a race with `finish`: whichever guarded call lands first wins, and the other fails.
   - The aborted index isn't deleted here. The next `start` deletes every `products-v<n>` index that has no alias, *after* it picks the new number. So build names are never reused, and an aborted run's later calls can never match a new run.
   - *Amended during the build (2026-10-22):* the first design had one `_aliases` call with `remove_index`. OpenSearch 3.9 can't do that: it applies `remove_index` before alias actions, so the guarded remove always fails. The design review also found that deleting on abort let the next start reuse the name.
   - search-service's own abort (after a failed build write) uses the same call.
6. **Failure:** on any error after a successful start, catalog-api calls abort (best effort) and reports the failure.
   - If any bulk item failed, catalog-api **does not swap**: it aborts. Swapping would silently drop those products from search, which were in the old index.
   - In every case, catalog-api bumps the search-cache version at the end, as today.

### Why the races are safe
- **An edit made after its product's batch was read** reaches the build index through the dual-write with a newer version. The bulk load's stale copy then gets a 409.
- **A delete in the gap between a batch read and its bulk write** leaves a tombstone, which rejects the stale copy (tombstone spike, rows 2–3). The gap is under a second; `gc_deletes: 10m` is the margin.
- **A write whose Postgres commit happened before `start` returned** is in Postgres before any batch is read, so the bulk load includes it, even if that write missed the build alias.
- **A write around the swap:** build first, then live (see step 2). The edit always reaches the index that ends up live.
- **A taken-over or aborted run** can't touch the new run's index, because every call carries its build name and every alias change is guarded with `must_exist`.

## Consequences
- **Good:**
  - Edits keep working during a reindex.
  - Reindex removes ghost products.
  - Search serves the old index until the new one is complete, then switches atomically.
  - With refresh off, 10k products should reindex in a few seconds instead of about 21s.
- **Bad:**
  - Each product write during a reindex costs two OpenSearch writes; outside a reindex, it costs one extra no-op call.
  - search-service gains four endpoints and some state in OpenSearch (the build alias).
  - **OpenSearch now needs a cluster setting.** Compose sets it today, Parts 2–3 must set it too, and search-service refuses to start without it.
  - A crashed reindex blocks the next one for up to 10 minutes; `abort` exists for impatient operators.
- **Contract changes** (OpenAPI and `docs/plan/app.md` updated with the code):
  - search-service: `DELETE /products/{id}?version=`, plus `POST /reindex/start | _bulk | finish | abort`, each after `start` taking the build name.
  - catalog-api: `/admin/reindex` returns 409 when one is already running, and its result says whether it swapped.
- **This doesn't supersede ADR-0001.** Indexing is still synchronous; only reindexing changed. Part 4's outbox can reuse the same alias-swap flow.

## Left to the builder
- The exact JSON of the new endpoints and the `swapped` field name.
- The index-number scheme (`products-v<n>`), and how `n` is found.
- Whether the auto-create check reads the setting or probes it.
- Whether `POST /products/_bulk` (used for the 1.3 sample data) stays on the live alias. Suggested: keep it.

## Revisit when
- Product writes during a reindex get heavy enough that double writes matter.
- A reindex takes long enough that a fixed 10-minute takeover could fire on a healthy run. Add a heartbeat then.
- Part 4 replaces synchronous indexing with an outbox.
