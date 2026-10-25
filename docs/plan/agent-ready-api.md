# Part 5: An agent-ready API

The AI builds it; I review it, as in Part 1. Estimated time: 2–4 days.

## Why
The next project is a **separate repo**: an MCP server and a tool-calling agent that use catalog-api as their backend. The MCP server is an ordinary HTTP client of catalog-api. It doesn't live in this repo, and it builds this repo's images from a pinned git tag.

Checked on 2026-10-25: the read tools work with the API as it is, but write tools that are safe for an agent need three things the API doesn't have:

| Gap | Why it matters for an agent | Milestone |
|---|---|---|
| Search can't filter or sort by stock (only `inStock` true/false) | "Find low-stock products" would page through 10,000 products and fill the agent's context. Tools should let the server do the filtering | 5.1 |
| `PATCH` is last-write-wins | The agent reads stock = 3, a sale makes it 2, the agent writes 13 meaning "+10", and the sale is lost without any error | 5.2 |
| No authentication | Every endpoint is open, including `DELETE` and `POST /admin/reindex`, so read-only and write access can't be enforced by the API. This was already a known gap: `/admin/reindex` must be restricted before the app gets a public URL (K7 note) | 5.3 |

**Out of scope** (each could go in [extras.md](extras.md) later):
- `POST /products/:id/stock-adjustments` with an `Idempotency-Key` header. 5.2 makes absolute updates safe, which is enough for the agent.
- Rate limiting.
- A machine-readable `code` field in error bodies. The MCP server maps status codes itself.
- Several keys per scope, key rotation, OAuth.
- The MCP server and the agent themselves.

## 5.1 Stock filter and sort in search
- **search-service** (`internal/query`):
  - add a `maxStock` parameter: a whole number from 0 to `MaxInt32`, inclusive, as a `range` filter on `stock` in the `bool.filter`
  - add a `stock_asc` sort: `stock` ascending, then `id` like the other sorts
  - `stock` is already an `integer` in the mapping, so no mapping change and no reindex
  - extend the table-driven tests in `params_test.go` and `build_test.go`, and add one integration test
- **catalog-api:**
  - add `maxStock` to `SearchProductsQuery`, with the same `toOptionalInt` handling as the price params
  - add `stock_asc` to `SORTS` and `SearchSort`
  - update the DTO spec and the Swagger descriptions
  - the search cache key already includes every query field, but confirm it with a test
- **Done when:**
  - `GET /products/search?maxStock=5&sort=stock_asc` returns only products with stock ≤ 5, lowest first, with facets counting only those.
  - `maxStock=-1` and `maxStock=abc` return catalog-api's own 400.
  - Unit and integration tests pass in both services.

## 5.2 Optimistic concurrency (`If-Match`)
- **Propose ADR-0019.** Recommended design:
  - **A `version` integer column** (`NOT NULL DEFAULT 1`), incremented on every update. It is used instead of `updatedAt`, because two writes in the same millisecond would get the same `updatedAt` and the conflict would go unnoticed. Add it with a new migration, and keep the existing rows at 1.
  - **Expose it** as `version` in `ProductResponse` and as a strong `ETag: "<version>"` header on `GET`, `POST` and `PATCH /products/:id`.
  - **`If-Match: "<version>"` on `PATCH` and `DELETE`, optional for now**, so existing clients keep working. The agent's MCP server will always send it. The ADR should also cover the alternative: make it required and return `428 Precondition Required` without it.
  - **Mismatch:** return `412 Precondition Failed` with the current version in the body, for example `{"statusCode":412,"message":"product changed: you sent version 3, current is 4","error":"Precondition Failed","currentVersion":4}`. A missing product is still 404. A malformed `If-Match` (anything but one strong ETag) is 400.
  - **One query, no race:**
    1. `prisma.product.update({ where: { id, version }, data: { ...dto, version: { increment: 1 } } })`.
    2. On P2025, look the product up to tell 404 from 412.
  - **Retry after a timeout:** the retried `PATCH` gets a 412 because its own first attempt already raised the version. The client then re-reads the product. If the values it wanted are already there, the update succeeded. Document this in the ADR and in Swagger.
- **Search results don't carry `version`.**
  - Keep `version` out of the search document. The index mapping is `dynamic: strict`, so adding the field would need a mapping change and a new index.
  - Give search hits their own type, without `version`, so catalog-api's types stay honest. Go's JSON decoder ignores the extra field in index calls (no `DisallowUnknownFields`), but test it.
  - Document the rule: search may be stale, so read the product with `GET /products/:id` before writing it.
- **Redis:** the cached product includes `version`. Every write already deletes `product:<id>`, so no change is needed. Check that an e2e test covers it.
- **Tests:**
  - unit tests for the service (version match, mismatch, missing, no `If-Match`)
  - e2e tests:
    - two `PATCH`es with the same `If-Match`: the first returns 200 and the second 412
    - `DELETE` with a stale version returns 412
    - `ETag` equals `version`
- **Done when:**
  - Read a product, update it from a second client, then `PATCH` with the first `ETag`: 412 with `currentVersion`, and the product is unchanged.
  - The same `PATCH` with the new `ETag`: 200, and `version` goes up by 1.
  - A `PATCH` without `If-Match` still works.
  - Unit and e2e tests pass.
  - ADR-0019 is accepted.

## 5.3 API keys with scopes
- **Propose ADR-0020.** Recommended design:
  - **Three scopes, each including the ones below it:**
    - `read`: `GET /products`, `GET /products/:id`, `GET /products/search`
    - `write`: `POST /products`, `PATCH /products/:id`
    - `admin`: `DELETE /products/:id`, `POST /admin/reindex`
    - This lets the agent's write key create and update products, but not delete them or run a reindex.
  - **Keys:**
    - Env vars `READ_API_KEY`, `WRITE_API_KEY` and `ADMIN_API_KEY`, one key per scope.
    - `loadConfig` requires all three, at least 32 characters each, and different from each other.
    - Clients send them as `Authorization: Bearer <key>`.
  - **Open without a key:** `/healthz`, `/readyz` and `/docs`.
  - **How it's built:**
    - A global guard (`APP_GUARD`), with a `@RequireScope('write')` decorator on handlers and `@Public()` on the open ones. A handler without a scope is refused, so a new endpoint can't be open by accident.
    - Compare SHA-256 digests with `crypto.timingSafeEqual`.
    - Log the scope that was used, never the key.
  - **Errors:**
    - **401** with `WWW-Authenticate: Bearer` for a missing or unknown key.
    - **403** for a valid key without the scope, with a message naming the scope that's needed, e.g. "this endpoint needs the admin scope; your key has write".
  - **Swagger:** `addBearerAuth()`, so the endpoints can still be tried from `/docs`.
- **Everything that calls catalog-api must send a key:**
  - **Compose:** dev-only keys in `docker-compose.yml` and `.env.example`, clearly marked as not secret.
  - **Seed:** a new `CATALOG_API_KEY` env var. It needs the admin key for `POST /admin/reindex`, and it creates rows directly in Postgres. It should exit 1 with a clear message on a 401 or 403.
  - **k6 load test:** a new `API_KEY` env var for its `GET /products` calls.
  - **e2e tests:** keys in the test config, and tests for 401, 403 and each scope.
  - **Helm chart:**
    - catalog-api and the seed Job read the keys from a Secret named by `catalogApi.apiKeysSecret`. The chart doesn't create it.
    - The Secret must exist before the seed hook runs.
  - **Terraform:**
    - The `app` module generates the three keys with `random_password` and creates the Secret as a `kubernetes_secret` before the `helm_release`.
    - An output marked `sensitive` prints the keys for local use.
    - Plan and apply dev, then staging.
  - **AWS:**
    - `terraform/aws/app` gets the same Secret. Only `validate`, `tflint` and `trivy` can run: its `plan` needs the cluster.
    - Add a line to the T5 session runbook in AGENTS.md (user-owned, so propose the change).
- **Tests:** unit tests for the guard and config, e2e tests for each scope on each endpoint group, and a test that every route has either a scope or `@Public()`.
- **Done when:**
  - On Compose:
    - no key: 401
    - read key on `PATCH`: 403 naming `write`
    - write key on `DELETE`: 403 naming `admin`
    - each scope works on its own endpoints
  - `/healthz` and `/docs` work without a key.
  - `npm run seed` works with the admin key and fails clearly without it.
  - dev and staging rebuilt with `terraform apply`: the seed hook succeeds, and `curl.exe` with the key from `terraform output` works.
  - k6 runs against staging.
  - ADR-0020 is accepted.

## 5.4 Release
- **Versions:**
  - catalog-api `0.2.0` and search-service `0.2.0`, in `package.json`, the image tags and Terraform's `*_version` variables
  - the next minor version of the chart
  - **check the migration hook on an upgrade:** `terraform apply` on a running dev environment applies the `version` migration before the rollout
- **Docs:**
  - update the [app.md](app.md) endpoint tables (user-owned, so propose the changes): the new parameters, the headers, the scopes, and "No auth" removed
  - **README:**
    - status: Part 5 done
    - the scopes and the `If-Match` rule, in the architecture section
    - the "what I'd change in production" list: remove what Part 5 fixed
    - a link to the agent repo once it exists
  - **AGENTS.md "Commands":** the keys for curl, seed and k6
- **Tag:** tag the commit before 5.1 as `v1.0.0`, so the "before" version stays pinned, then tag this one `v1.1.0` and push both tags. The agent repo's Compose file builds from `v1.1.0`.
- **Done when:**
  - From a clean clone of `v1.1.0`, `docker compose up --build`, seed, and a keyed search all work.
  - `v1.1.0` is pushed.
  - The README and app.md are updated.
