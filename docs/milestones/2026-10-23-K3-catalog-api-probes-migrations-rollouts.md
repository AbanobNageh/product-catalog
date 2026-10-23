# K3 catalog-api: probes, migrations, rollouts
- Date: 2026-10-23 · Commits: 446a29b (app: migrate stage, version in `/healthz`), 1dcfc16 (app: 0.1.1), 9c15d79 (k8s)

## What was built
App side (`services/catalog-api`, written by the AI on request):
- A slim `migrate` Dockerfile stage ([ADR-0009](../adr/0009-slim-migrate-image.md)): only the Prisma CLI, the schema and the migrations, with the default command `npx prisma migrate deploy`. It's about 615 MB vs 1.3 GB for the `build` stage. Compose's `migrate` service uses it too.
- `/healthz` returns `{"status":"ok","version":"<package.json version>"}`, through a shared `src/common/app-version.ts` that Swagger also uses. `package.json` went 0.0.1 → 0.1.0, to match the image tags, then 0.1.1 for the rollout.

In `k8s/catalog-api/`:
- `configmap.yaml`: ConfigMap `catalog-api` with `REDIS_URL=redis://catalog-api-redis:6379/0` and `SEARCH_SERVICE_URL=http://search-service:8080` (the Service K4 creates).
- `migratejob.yaml`: Job `catalog-api-migrate` running `catalog-api-migrate:<version>`, with `restartPolicy: Never` and `backoffLimit: 4`. It builds `DATABASE_URL` from the `catalog-api-postgres` Secret and ConfigMap keys with `$(VAR)` references, pointing at the Service `catalog-api-postgres:5432`.
- `deployment.yaml`: Deployment `catalog-api`, 2 replicas.
  - Env comes from `envFrom` (the Postgres ConfigMap and Secret, plus the `catalog-api` ConfigMap) plus the composed `DATABASE_URL`.
  - Probes:

    | Probe | Endpoint | Settings |
    |---|---|---|
    | startup | `/healthz` | 30 × 10s |
    | liveness | `/healthz` | timeout 2s |
    | readiness | `/readyz` | timeout 3s, period 5s, failureThreshold 2 |

  - `lifecycle.preStop.sleep` 15s, with the default 30s grace period (15s sleep + up to 10s app shutdown).
  - The `kubernetes.io/change-cause` annotation.
- `service.yaml`: ClusterIP Service `catalog-api`, port 3000. Its selector of `name` + `instance` excludes the migration Job's pods, which share `name: catalog-api`.

Verified live:
- The migration Job completed in 4s and created `_prisma_migrations` and `products`. A re-run at 0.1.1 printed `No pending migrations to apply.`
- Deployment 2/2, one pod per worker. The EndpointSlice listed both pod IPs. Through the Service name, `/healthz` returned `0.1.0` and `/readyz` showed `postgres: ok, redis: ok`.
- **Rollout 0.1.0 → 0.1.1 (revision 2) and `rollout undo` (revision 3).** A busybox loop inside the cluster called `http://catalog-api:3000/healthz` 5 times a second. It switched 0.1.0 → 0.1.1 → 0.1.0 with no failed requests.
- The ReplicaSet watch:
  - the new ReplicaSet surged one pod first, and an old pod was removed only after the new one was Ready
  - each new pod took about 11s to become Ready, because of the startup probe's 10s period
  - the undo scaled the old ReplicaSet `c47b64d4` back up (same template hash) instead of creating a new one
  - the revision history went from 1, 2 to 2, 3
- `rollout undo` warned that it doesn't update `last-applied-configuration`. The cluster was then rolled forward again with `kubectl apply`, so the file and the cluster match: revision 4 on 0.1.1 (reusing ReplicaSet `6d4f7bd6c5`), 2/2 Ready, and `kubectl diff -f k8s/catalog-api/` is clean.

## Decisions (link ADRs)
- **The migration image** is a slim `migrate` stage: [ADR-0009](../adr/0009-slim-migrate-image.md), accepted at this close. It resolves the open question in ADR-0003.
- **`DATABASE_URL` is built from the Postgres Secret's and ConfigMap's keys** with `$(VAR)`, so there's no catalog-api Secret. One source of truth for the credentials. Passwords containing `@ : / #` would need percent-encoding.
- **The Job lists each key with `valueFrom`; the Deployment uses `envFrom`.** The Deployment needs whole objects and already-matching key names.
- **Migrate before rollout**, every release, even with no new migrations. A Job's pod template is immutable, so each release deletes and re-applies the Job. This is written up as a release procedure in `AGENTS.md`.
- **Liveness checks no dependencies (`/healthz`); readiness checks Postgres and Redis (`/readyz`),** as the spec says. Readiness reacts faster than the defaults (about 10s to remove a pod).
- **Startup probe 30 × 10s** (a 5-minute budget) and **preStop 15s**. Both were kept as chosen. Their cost was measured: about 11s per new pod to become Ready, and old pods linger about 15s.
- **The `k2_test` table from K2 was dropped:** `prisma migrate deploy` refuses (P3005) a non-empty database that has no migration history.
- Names and labels follow [ADR-0008](../adr/0008-k8s-naming-and-labels.md): `component: api` for the app, and `instance: catalog-api-migrate` with `component: migration` for the Job.

## Follow-ups
- **K4:**
  - Deploy search-service as the `search-service` Service that the ConfigMap already points at.
  - The seed runs as a Job (ADR-0006: the catalog-api runtime image with `node dist/seed/main.js`).
  - Still carried: OpenSearch `action.auto_create_index: "-products*,+*"` (also K7).
- **K6:**
  - Resource requests and limits for catalog-api, Postgres and Redis.
  - **Drill:** stop Redis and watch both catalog-api pods fail readiness at once, emptying the Service. `/readyz` includes a dependency every pod shares; a spec change would need an ADR.
  - Still carried: readiness probes for Redis and Postgres (`pg_isready`); the StatefulSet delete/re-apply and node-failure drills.
- **K7:**
  - Helm hooks for the migration Job (ordering, and per-release re-creation).
  - Template the Secret.
  - Still carried: Helm's `instance` = release-name convention vs ADR-0008.
- **Tuning, no action yet:**
  - startup probe: a shorter period (about 2s) with the same total budget would make new pods Ready about 9s sooner
  - preStop: a few seconds is enough for the endpoint update
  - Service `targetPort: http` and a protocol-style port name
  - the Postgres container port name `postgres`
- **Production nits:**
  - after a `rollout undo`, update the manifest (or `git revert`), or the next `apply` rolls forward again; GitOps tools such as Argo CD or Flux enforce this
  - migrations must stay backward compatible with the previous version, which keeps running during a rollout (expand/contract)
  - alert on a failed migration Job
- **Windows:** `kubectl diff` needs a `diff` executable on the PATH (Git's `usr\bin`). This is in `AGENTS.md`.
- Still carried from K0:
  - K5: Traefik hostPort and nodeSelector, plus the Option A/B ADR.
  - Version skew: kubectl 1.36 vs cluster 1.37.
