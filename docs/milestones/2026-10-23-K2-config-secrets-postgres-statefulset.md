# K2 Config, Secrets, Postgres StatefulSet
- Date: 2026-10-23 · Commits: 3ea04da

## What was built
In `k8s/postgres/`:
- `secret.yaml`: Secret `catalog-api-postgres` with `POSTGRES_USER` and `POSTGRES_PASSWORD` (base64 under `data:`, local-only values matching Compose).
- `configmap.yaml`: ConfigMap `catalog-api-postgres` with `POSTGRES_DB: catalog`.
- `service.yaml`: headless Service `catalog-api-postgres` (`clusterIP: None`), port 5432 named `postgres`, with a selector of `name` + `instance`.
- `statefulset.yaml`: StatefulSet `catalog-api-postgres` with 1 replica, `serviceName: catalog-api-postgres` and `postgres:18-alpine` (the same image as Compose).
  - Each env var comes from the ConfigMap or Secret with `valueFrom`.
  - A `volumeClaimTemplates` entry `catalog-api-postgres-volume` requests 1Gi, `ReadWriteOnce`, `storageClassName: standard`. It's mounted at `/var/lib/postgresql`: Postgres 18 images keep data in `/var/lib/postgresql/18/docker`, so the old `.../data` mount would miss it.
- Every object carries the ADR-0008 labels and `namespace: catalog`.

Verified live:
- The PVC went `Pending` → `Bound` on first schedule (`WaitForFirstConsumer`). `rancher.io/local-path` provisioned the PV dynamically.
- **The data survived a pod deletion.** A row was inserted into a `k2_test` table, `catalog-api-postgres-0` was deleted and recreated under the same name, and the row and the PVC were still there.
- `show data_directory` returns `/var/lib/postgresql/18/docker`, which is on the volume.
- The PV is a host folder with node affinity `catalog-worker2`, so the pod can only run on that node. local-path doesn't enforce the 1Gi size.
- At close: StatefulSet 1/1, PVC Bound, and `kubectl diff -f k8s/postgres/` is clean. `apply --dry-run=server` still reports the StatefulSet as `configured`, a known client-side apply quirk with `volumeClaimTemplates` defaults.

## Decisions (link ADRs)
- **Names and labels** follow [ADR-0008](../adr/0008-k8s-naming-and-labels.md), with `component: database`. The ConfigMap and Secret share the name `catalog-api-postgres` with the StatefulSet and Service, with no kind suffix.
- **The Secret manifest is committed** with local-only credentials, mirroring Compose, rather than created with `kubectl create secret`. Not acceptable for a real environment; see Follow-ups.
- **Env vars per key (`valueFrom`)** rather than `envFrom`: explicit, and it fails clearly if a key is missing.
- **`storageClassName: standard` is set explicitly** rather than relying on the default class.
- **The claim template is named `catalog-api-postgres-volume`**, so the PVC is `catalog-api-postgres-volume-catalog-api-postgres-0`. Renaming it later would orphan the existing PVC (the new pod would get an empty volume).
- **The database name lives in the ConfigMap; user and password in the Secret.**

## Follow-ups
- **K3:**
  - catalog-api's `DATABASE_URL` will point at `catalog-api-postgres:5432/catalog`. Decide whether to build it from the existing Secret's keys or add a catalog-api Secret.
  - The migration Job uses the same database.
  - A `pg_isready` readiness probe for Postgres.
  - Name the container port `postgres` and use it as the Service's `targetPort`.
  - Still carried: `REDIS_URL=redis://catalog-api-redis:6379/0`; a real image change and `rollout undo`; a readiness probe for Redis; the migration image and `kind load docker-image` (never `:latest`).
- **K4:**
  - The seed runs as a Job. It needs catalog-api and search-service, so it moved here from K2.
  - Still carried: OpenSearch `action.auto_create_index: "-products*,+*"` (also K7).
- **K6:**
  - Resource requests and limits for Postgres.
  - Drills: delete and re-apply only the StatefulSet (the PVC should reattach), and a node failure with a node-pinned local PV.
  - The "delete the OpenSearch PVC" drill depends on `reclaimPolicy: Delete` on the `standard` class.
- **K7:**
  - Template the Secret instead of committing values.
  - Still carried: Helm's `instance` = release-name convention vs ADR-0008.
- **K8:** RBAC on Secrets, and encryption at rest (not on by default in kind).
- **Production nits, no action yet:**
  - pin `postgres:18.x-alpine` or a digest
  - committed Secret → External Secrets Operator (AWS Secrets Manager) in T5
  - password rotation needs `ALTER USER`, because `POSTGRES_PASSWORD` only applies on first init
  - HA needs replication (an operator), not `replicas: 2`
- Still carried from K0:
  - K5: Traefik hostPort and nodeSelector, plus the Option A/B ADR.
  - Version skew: kubectl 1.36 vs cluster 1.37.
