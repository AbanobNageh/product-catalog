# 0020. API keys with three scopes

- **Status:** Accepted (approved at the 5.3 close)
- **Date:** 2026-10-25

## Context
- Every catalog-api endpoint is open, including `DELETE /products/:id` and `POST /admin/reindex`. The K7 note already said `/admin/reindex` must be restricted before the app gets a public URL.
- The agent's MCP server (a separate repo) needs read-only and write access that the API itself enforces: a write key that can create and update products, but not delete them or run a reindex ([Part 5 plan](../plan/agent-ready-api.md#53-api-keys-with-scopes)).
- **Who calls catalog-api today:**
  - The seed (`POST /admin/reindex`). It runs locally, in Compose and as a Helm hook Job.
  - The k6 load test (`GET /products`).
  - The e2e test.
  - Swagger UI and curl.
  - Kubernetes probes (`/healthz`, `/readyz`).
  - search-service never calls catalog-api.
- **Where configuration comes from:** `loadConfig` collects every environment problem before failing. The chart reads secrets from Secrets. Terraform's `app` module installs the chart on kind (dev and staging) and on EKS (`terraform/aws/app`).

## Options
1. **Credential:**
   - (a) **Static API keys, sent as `Authorization: Bearer <key>`.**
   - (b) OAuth 2.0 client credentials with JWTs: a token issuer to run, and more than one agent needs.
   - (c) mTLS: client certificates are hard to use from curl, Swagger and k6.
2. **Granularity:**
   - (a) **Three fixed, nested scopes:** `read` < `write` < `admin`, so each includes the ones below it.
   - (b) A permission per endpoint: more to configure, and nothing needs it yet.
3. **Where keys live:**
   - (a) **One environment variable per scope**, from a Secret: `READ_API_KEY`, `WRITE_API_KEY`, `ADMIN_API_KEY`.
   - (b) Only SHA-256 digests in the environment: a leaked pod environment no longer reveals usable keys, but Terraform still has to output the plain keys for local use, and the dev keys in Compose would need a hashing step.
   - (c) A database table of keys: rotation and many keys, out of scope for Part 5.
4. **Default for a new endpoint:**
   - (a) **Closed:** a handler without a scope (or `@Public()`) is refused.
   - (b) Open unless marked.

## Decision
1(a), 2(a), 3(a) and 4(a), as the plan recommended; the user approved them with the 5.3 plan.
- **Scopes:**
  - `read`: `GET /products`, `GET /products/:id`, `GET /products/search`
  - `write`: `POST /products`, `PATCH /products/:id`
  - `admin`: `DELETE /products/:id`, `POST /admin/reindex`
  - Open without a key: `/healthz`, `/readyz` and Swagger (`/docs`, `/docs-json`)
- **Keys:**
  - `loadConfig` requires all three variables, each at least 32 characters, and all three different.
  - Errors name the variable, never its value.
- **How it's checked:**
  - A global guard (`APP_GUARD`). Handlers declare `@RequireScope('read' | 'write' | 'admin')` or `@Public()`.
  - The key's SHA-256 digest is compared with each configured key's digest using `crypto.timingSafeEqual`. All three are compared every time, so the response time doesn't reveal which scope came close.
  - A test walks every controller in the app's module graph, and fails if a route has neither a scope nor `@Public()`.
- **Errors:**
  - **401** with `WWW-Authenticate: Bearer` for a missing header, a header that isn't `Bearer <key>`, or an unknown key.
  - **403** for a known key without the scope, naming both scopes: `this endpoint needs the admin scope; your key has write`.
  - A handler without a scope is refused with 403 and logged as an error. The route test keeps this from happening.
- **Logs:**
  - Refusals at `warn`, with the method, path, reason, and, for a 403, the key's scope.
  - Accepted requests at `debug`, with their scope.
  - Never the key.
- **Swagger:** `addBearerAuth()`, and each keyed endpoint is marked as needing it, so the **Authorize** button works in `/docs`.
- **Who sends which key:**

  | Client | Key | Where it comes from |
  |---|---|---|
  | Compose, local `.env`, e2e | dev-only keys, committed and marked "not secret" | `docker-compose.yml`, `.env.example`, `.env.test.example` |
  | Seed | the admin key (it reindexes) | new `CATALOG_API_KEY`; the seed exits 1 with a clear message when it's unset, or when catalog-api answers 401 or 403 |
  | k6 | the read key | new `API_KEY` |
  | Helm chart | all three | catalog-api and the seed Job read them from the Secret named by `catalogApi.apiKeysSecret` (default `catalog-api-keys`). The chart doesn't create it |
  | Terraform `app` module (kind and EKS) | generates all three | `random_password`, a `kubernetes_secret_v1` created before the `helm_release`, and outputs marked `sensitive` |

## Consequences
- The agent can get a write key that can't delete products or run a reindex. `/admin/reindex` is no longer open, which was a requirement before the app gets a public URL.
- Every client changes in this milestone: the seed, k6, the e2e tests, the curl examples and Swagger. A missing key is a clear 401, not a silent failure.
- **The keys are plain text** in the environment, in Terraform state (MinIO, or the encrypted S3 bucket on AWS) and in Kubernetes Secrets. Anyone who can read those can read the keys. This is the usual trade-off for static keys; option 3(b) only narrows the first place.
- **Rotation is one apply:** `terraform apply -replace` on a `random_password` changes the Secret, and the release gets a hash of the keys as a pod annotation, so the same apply rolls the catalog-api pods and no pod keeps accepting the old key (added after the 5.3 review). With one key per scope, rotating the write key logs out every client that uses it. Several keys per scope are out of scope.
- **Per-request cost:** one SHA-256 and three constant-time comparisons. That's negligible next to a database call.
- search-service stays internal and unauthenticated. Only catalog-api can reach it (no host port, ClusterIP on Kubernetes).
