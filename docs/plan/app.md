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
- **No auth, no frontend.** Swagger UI on catalog-api is the UI.

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
| created_at, updated_at | timestamptz | |

Migrations live in the repo and run as a **separate command** (for example `npm run migrate`), not automatically when the app starts. In Part 2 they'll run as a Kubernetes Job.

## catalog-api (NestJS 11, TypeScript)

ORM: **Prisma** ([ADR-0003](../adr/0003-prisma-as-orm.md)). `prisma migrate deploy` makes a clean Kubernetes Job.

Endpoints:

| method | path | what it does |
|---|---|---|
| POST | /products | create, then index (sync call to search-service) |
| GET | /products/:id | Redis cache-aside, TTL 5 minutes |
| GET | /products?page&limit | list from Postgres, no cache |
| PATCH | /products/:id | update, invalidate the cache, re-index |
| DELETE | /products/:id | delete, invalidate the cache, remove from the index |
| GET | /products/search?q&category&brand&minPrice&maxPrice&inStock&sort&page&size | proxies to search-service; caches results in Redis for 60s, keyed by the normalised query |
| POST | /admin/reindex | pages through Postgres and sends products in bulk to search-service |
| GET | /healthz | liveness: the process is up (no dependency checks) |
| GET | /readyz | readiness: Postgres and Redis reachable |

- `sort`: `relevance` (default), `price_asc`, `price_desc` or `newest`.
- **Validation:** `class-validator` DTOs.
- **Swagger:** `@nestjs/swagger` at `/docs`.
- **Seed:** `npm run seed` creates about 10,000 fake products with `@faker-js/faker`, across about 10 categories and 30 brands, then calls reindex.
- **Errors:** if search-service is down, the search endpoint returns 503 with a clear message, and writes still succeed (with the error logged).

## search-service (Go 1.26)

Built with the standard library `net/http` (Go 1.22+ routing patterns), the official `opensearch-go` client (v4), and `log/slog` JSON logs. Avoid frameworks.

Endpoints:

| method | path | what it does |
|---|---|---|
| GET | /search | same query params as above; returns hits, total, and facets |
| PUT | /products/{id} | index or replace one product |
| DELETE | /products/{id} | remove one product |
| POST | /products/_bulk | bulk index (used by reindex) |
| GET | /healthz | liveness |
| GET | /readyz | readiness: OpenSearch reachable and index exists |

- **On startup:** create index `products-v1` with an explicit mapping, plus an alias `products`, if they don't exist. All reads and writes go through the alias.
- **Mapping:**
  - `name`: text, with a `.keyword` subfield
  - `description`: text
  - `category` and `brand`: keyword
  - `price_cents` and `stock`: integer
  - `in_stock`: boolean, derived from stock
  - `created_at`: date
- **Query:**
  - `multi_match` on `name^3` and `description`, with `fuzziness: AUTO`
  - filters (category, brand, price range, in_stock) in a `bool.filter`
  - facets: `terms` aggregations on category and brand, plus a `range` aggregation on price buckets
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
- Finish the README: how to run it, the architecture diagram, and the trade-offs.
- Images tagged `0.1.0`.
- **Done when:** a stranger could run it from the README alone.
