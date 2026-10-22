# 0006. The seed script ships in the catalog-api runtime image

- **Status:** Accepted (approved at the 1.4 close)
- **Date:** 2026-10-22

## Context
- The spec asks for `npm run seed`: about 10,000 fake products made with `@faker-js/faker`, followed by a reindex.
- Module K2 later says: "run the seed (as a Job or with `kubectl exec`)". Both need the seed and faker **inside an image** in the cluster.
- The catalog-api runtime image holds only `dist/` and production dependencies (Dockerfile stage `prod-deps`), so a dev-only script wouldn't be there.
- `@faker-js/faker` 10.6.0 is about 2.9 MB unpacked and ESM-only, like Nest 12 (ADR-0004).

## Considered options
1. **The seed in `src/seed/`, compiled into `dist/`, with faker as a production dependency.** The same image runs the API, or the seed with a command override.
2. **A dev-only script** (faker as a devDependency, run from the host). The image stays smaller. In K2 you'd seed by port-forwarding Postgres and catalog-api to the host. No in-cluster Job.
3. **Seed through the public API** (`POST /products` × 10,000). No database credentials needed, but each create waits for a synchronous index call with `refresh=wait_for`, so 10,000 sequential calls take far too long. It also doesn't match the spec's "then calls reindex".

## Decision
Option 1.
- The seed writes to Postgres with `createMany` (`skipDuplicates`, deterministic `SEED-00001…` SKUs, a fixed faker seed), then calls `POST /admin/reindex` on catalog-api.
- Its env is `DATABASE_URL` and `CATALOG_API_URL` (default `http://localhost:3000`).
- `npm run seed` builds, then runs `node dist/seed/main.js`.

## Consequences
- **Good:**
  - K2 can run the seed as a Kubernetes Job using the catalog-api image with a different `command`. That's a useful pattern to learn, and needs no extra image.
  - Re-running the seed is idempotent.
  - Reindexing through the API means the search-cache version is bumped by the code that owns it.
- **Bad:**
  - The production image carries a dev-ish tool and more `node_modules`: measured at the 1.4 Done-when, `@faker-js` is 3.8 MB of a 469 MB image.
  - The seed needs network access to catalog-api, not just to Postgres.
- **Revisit** if the image ever needs to be minimal, for example for a security scan with zero unused packages. The seed can then move to its own image or a separate build target.
