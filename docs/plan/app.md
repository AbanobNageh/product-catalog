# Part 1: The app

The AI builds it; I review it. Estimated time: 2–4 days.

## Architecture

```
                 client (curl / Swagger UI)
                          │
                          ▼
              ┌───────────────────────┐
              │ catalog-api (NestJS)  │──── PostgreSQL (source of truth)
              │ port 3000             │──── Redis (cache)
              └──────────┬────────────┘
                         │ HTTP (sync, internal only)
                         ▼
              ┌───────────────────────┐
              │ search-service (Go)   │──── OpenSearch (search index)
              │ port 8080             │
              └───────────────────────┘
```

- **catalog-api** is the only public entry point. It owns product data in Postgres, caches reads in Redis, and keeps the search index updated by calling search-service whenever a product changes.
- **search-service** is internal only. It owns the OpenSearch index and serves search queries with filters, facets and sorting.
- **No frontend.** Swagger UI on catalog-api is the UI.
- **API keys with three scopes** (Part 5, [ADR-0020](../adr/0020-api-keys-with-scopes.md)): every catalog-api endpoint except `/healthz`, `/readyz` and `/docs` needs `Authorization: Bearer <key>`. search-service has no auth: it has no host port or public route, and only catalog-api calls it.

**Known trade-off** ([ADR-0001](../adr/0001-two-services-synchronous-indexing.md)): indexing is a synchronous HTTP call after the Postgres write. If search-service is down, the write still succeeds, the error is logged, and the index goes stale until `POST /admin/reindex` is run. This is the honest simple version, chosen so the new learning stays on Kubernetes and Terraform. Part 4 has the event-driven fix (outbox + queue). To keep that switch cheap, catalog-api makes every index call through one `SearchIndexer` interface, and search-service keeps its indexing logic separate from its HTTP handlers (see the ADR).

## Data model (PostgreSQL)

`products` table:

| column | type | notes |
|---|---|---|
| id | uuid PK | generated |
| sku | text, unique | |
| name | text | |
| description | text | |
| category | text | e.g. `electronics`, `books`; indexed |
| brand | text | |
| price_cents | integer | store money as integers |
| currency | text | default `EGP` |
| stock | integer | ≥ 0 |
| version | integer | starts at 1, +1 on every update; optimistic concurrency (Part 5, [ADR-0019](../adr/0019-optimistic-concurrency-with-if-match.md)) |
| created_at, updated_at | timestamptz | |

Migrations live in the repo and run as a **separate command** (for example `npm run migrate`), not automatically when the app starts. In Part 2 they'll run as a Kubernetes Job.

## catalog-api (NestJS 12, TypeScript)

ORM: **Prisma** ([ADR-0003](../adr/0003-prisma-as-orm.md)). `prisma migrate deploy` makes a clean Kubernetes Job.

Endpoints (Part 5, [agent-ready-api.md](agent-ready-api.md), added the scopes, `maxStock`, `stock_asc`, `version` and `If-Match`):

| method | path | scope | what it does |
|---|---|---|---|
| POST | /products | write | create, then index (sync call to search-service); returns `ETag` |
| GET | /products/:id | read | Redis cache-aside, TTL 5 minutes; returns `ETag: "<version>"` |
| GET | /products?page&limit | read | list from Postgres, no cache |
| PATCH | /products/:id | write | update, invalidate the cache, re-index; optional `If-Match: "<version>"`; returns the new `ETag` |
| DELETE | /products/:id | admin | delete, invalidate the cache, remove from the index; optional `If-Match` |
| GET | /products/search?q&category&brand&minPrice&maxPrice&maxStock&inStock&sort&page&size | read | proxies to search-service; caches results in Redis for 60s, keyed by the normalised query; any product write invalidates cached search results |
| POST | /admin/reindex | admin | builds a fresh index from Postgres and swaps it in, while writes keep working ([ADR-0007](../adr/0007-alias-swap-reindex-with-live-writes.md)); 409 if one is already running |
| GET | /healthz | none | liveness: the process is up (no dependency checks) |
| GET | /readyz | none | readiness: Postgres and Redis reachable |

- `sort`: `relevance` (default), `price_asc`, `price_desc`, `newest` or `stock_asc` (stock, lowest first). Ties are ordered by `id`.
- `minPrice` and `maxPrice` are in cents, like `price_cents`.
- `maxStock`: only products with stock ≤ `maxStock` (`0`: out of stock only).
- **Integer parameters** (`minPrice`, `maxPrice`, `maxStock`, `page`, `size`, `limit`) must be whole numbers within their bounds. A bad value gets one message: `<name> must be a whole number from <min> to <max>`.
- **Keys:** the scopes nest: `read` < `write` < `admin`. A missing or unknown key gets 401 with `WWW-Authenticate: Bearer`; a key with too low a scope gets 403, naming the scope that's needed.
- **`If-Match`:** optional. Only the ETag from `GET /products/:id`, `POST` or `PATCH` works (list and search responses carry Express's weak body hash, which isn't a version). Anything other than one strong ETag gets 400; a stale version gets 412, with `currentVersion` in the body. Search hits don't carry `version` (the index may be stale), so read the product with `GET /products/:id` before writing it.
- **Validation:** `class-validator` DTOs.
- **Swagger:** `@nestjs/swagger` at `/docs`.
- **Seed:** `npm run seed` creates about 10,000 fake products with `@faker-js/faker`, across about 10 categories and 30 brands, then calls reindex.
- **Errors:** if search-service is down, the search endpoint returns 503 with a clear message, and writes still succeed (with the error logged).

## search-service (Go 1.26)

Built with the standard library `net/http` (Go 1.22+ routing patterns), the official `opensearch-go` client (v5, [ADR-0005](../adr/0005-opensearch-go-v5.md)), and `log/slog` JSON logs. Avoid frameworks.

Endpoints:

| method | path | what it does |
|---|---|---|
| GET | /search | same query params as above; returns hits, total, and facets |
| PUT | /products/{id} | index or replace one product |
| DELETE | /products/{id}?version= | remove one product; `version` (ms, required) makes the delete versioned, so a stale bulk copy can't bring it back |
| POST | /products/_bulk | bulk index into the live alias |
| POST | /reindex/start | create the build index behind the `products-build` alias; returns its name; 409 if a fresh build exists |
| POST | /reindex/_bulk | bulk index into the named build index |
| POST | /reindex/finish | refresh, swap `products` to the build index atomically, drop the old index |
| POST | /reindex/abort | detach the named build from `products-build`; the next start deletes it. 204 even if it's already gone |
| GET | /healthz | liveness |
| GET | /readyz | readiness: OpenSearch reachable and index exists |

- **JSON is camelCase** and matches catalog-api's `SearchResult` and `ProductResponse` types exactly, so catalog-api can pass results through. Field names inside OpenSearch are snake_case.
- **Bulk with failed items** returns `200` with `{ "indexed": n, "skipped": n, "failed": [{ "id", "status", "reason" }] }`. `skipped` counts stale versions that were deliberately ignored, and `failed` lists what to reindex. A bad request body returns `400`. OpenSearch unreachable or timing out returns `503`.

- **On startup:** create index `products-v1` with an explicit mapping, plus an alias `products`, if they don't exist. All reads and writes go through the alias.
- **Reindex** ([ADR-0007](../adr/0007-alias-swap-reindex-with-live-writes.md), from 1.5): while `products-build` exists, every single-product write goes to the build index first, then to the live one. OpenSearch must run with `action.auto_create_index: "-products*,+*"`; search-service refuses to start without it.
- **Mapping:**
  - `name`: text, with a `.keyword` subfield
  - `description`: text
  - `category` and `brand`: keyword
  - `price_cents` and `stock`: integer
  - `in_stock`: boolean, derived from stock
  - `created_at`: date
  - also stored so hits return whole products: `id`, `sku` and `currency` as keyword, `updated_at` as date
- **Query:**
  - `multi_match` on `name^3` and `description`, with `fuzziness: AUTO`
  - filters (category, brand, price range, in_stock) in a `bool.filter`
  - facets: `terms` aggregations on category and brand, plus a `range` aggregation on price buckets
  - facets count only the filtered results
  - price buckets in EGP (stored as cents): under 100, 100–500, 500–2,000, 2,000–10,000, and 10,000+. They're one constant, so they're easy to change later.
- **Keep the query builder a pure function** (params in, OpenSearch request body out) so it can be unit-tested with table-driven tests.

## Requirements for both services (these make Part 2 work)
- **All config comes from environment variables** (DB URL, Redis URL, OpenSearch URL, search-service URL, port, log level). No config files baked into the image.
- **Structured JSON logs to stdout.**
- **Graceful shutdown on SIGTERM:** stop accepting requests, finish in-flight ones, close connections, then exit within 10s.
- Separate **`/healthz` and `/readyz`** endpoints, as above.
- **Multi-stage Dockerfiles, running as a non-root user.**
  - Go: build static, then run on `gcr.io/distroless/static` or `alpine`.
  - Node: build, then run on `node:24-alpine` with only production dependencies.
- **No retries that hide failures.** Short timeouts (2s) on service-to-service calls.

## Repo layout

```
product-catalog/
  AGENTS.md               AI instructions (always loaded)
  CLAUDE.md               imports AGENTS.md + docs/STATUS.md, Claude-only notes
  PLAN.md                 roadmap index
  README.md               what it is, how to run, architecture, trade-offs
  LEARNING-NOTES.md       my own notes, written by me
  .claude/                settings (permission guards), path-scoped rules, skills
  docs/
    STATUS.md             current state + progress checklist
    ai-workflow.md        how the AI context system works
    plan/                 this spec and the Part 2–4 curricula
    adr/                  architecture decision records
    milestones/           one note per finished milestone/module
    research/             research behind decisions
  services/
    catalog-api/          NestJS app (+ Dockerfile, prisma/, seed)
    search-service/       Go app (+ Dockerfile)
  docker-compose.yml      Part 1 local run
  k8s/                    Part 2 plain manifests (one folder per module is fine)
  charts/product-catalog/ Part 2 Helm chart (module K7)
  terraform/
    local/                Part 3 (kind + Kubernetes + Helm)
    aws/                  Part 3 (AWS)
```

## Milestones

**1.1 Repo scaffold**
- Create the folder structure, `.gitignore`, README skeleton, `git init`, and the first commit.
- Set up the AI context system ([ADR-0002](../adr/0002-tiered-ai-context-system.md)).
- Write ADR-001, "Two services, synchronous indexing" (it records the trade-off above).
- **Done when:** the repo is committed, and I've read and agreed with the ADR.

**1.2 catalog-api**
- Product CRUD with Prisma and migrations.
- Redis caching, validation, Swagger, health endpoints, graceful shutdown.
- The search-service client can be a stub for now.
- A few unit tests for the product service, and one e2e test.
- **Done when:** with Postgres and Redis running in Compose, I can create, read, update and delete products through Swagger. A repeated GET is served from Redis (visible in the logs).

**1.3 search-service**
- Index setup (with the alias), the index/delete/bulk endpoints, and search with filters, facets and sorting.
- Table-driven tests for the query builder.
- **Done when:** with OpenSearch running in Compose, I can bulk-index sample docs and run a filtered search with facets using curl.

**1.4 Wire up + Compose**
- Connect catalog-api to search-service.
- Full `docker-compose.yml` with both services, Postgres, Redis and OpenSearch (plus optional OpenSearch Dashboards).
- Healthchecks and `depends_on` conditions.
- The seed script.
- **Done when:**
  - `docker compose up --build` starts everything.
  - `npm run seed` loads 10k products.
  - `GET /products/search?q=phone&category=electronics&minPrice=10000` returns results with facets.
  - Updating a product's price changes it in search results within a second.
  - Stopping search-service makes search return 503 while the CRUD endpoints still work.
  - Reindex fixes the index afterwards.

**1.5 Polish**
- The alias-swap reindex that keeps taking writes ([ADR-0007](../adr/0007-alias-swap-reindex-with-live-writes.md)), including versioned deletes and the `action.auto_create_index` guard.
- Images tagged `0.1.0`.
- The deferred review minors from the [1.4 note](../milestones/2026-10-22-1.4-wire-up-compose.md#follow-ups).
- The README moved to the last step of the whole project (see [PLAN.md](../../PLAN.md)).
- **Done when:**
  - While a reindex of the 10k products runs, CRUD keeps working. After the swap, a product updated mid-reindex shows its new value in search, one deleted mid-reindex is gone, and one created mid-reindex is findable.
  - A product deleted while search-service was down is gone from search after reindex.
  - A full reindex of 10k products takes a few seconds, not 21s.
  - An integration test proves a stale bulk write can't bring back a product deleted during the build.
  - `docker compose up --build` produces `catalog-api:0.1.0` and `search-service:0.1.0`, and the stack comes up healthy.
