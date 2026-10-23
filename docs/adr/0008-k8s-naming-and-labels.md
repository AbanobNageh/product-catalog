# 0008. Kubernetes object names and labels

- **Status:** Accepted (approved at the K1 close)
- **Date:** 2026-10-23

## Context
- K1 is the first app workload on the cluster: Redis as a Deployment and Service in the `catalog` namespace. Postgres, OpenSearch, catalog-api and search-service follow in K2–K4, and K7 turns them into a Helm chart.
- A Deployment's `spec.selector` is **immutable**, and object names can't be changed either. "Renaming" means deleting and recreating, and a Service's name is also its DNS name, which ends up in other services' config (catalog-api's `REDIS_URL` in K3).
- A Service selects pods by labels only. If two Services select on a label value that more than one workload shares (for example `app: redis` on two Redis Deployments), each Service picks up both sets of pods, and Kubernetes doesn't warn.
- Only catalog-api uses Redis (`docs/plan/app.md`). The user wanted the name to say whose Redis it is, in case another one is ever added.

## Options
1. **Short names and plain `app:` labels** (`redis`, `app: redis`). This is the tutorial default. A second instance of the same software would collide in both the name and the selector.
2. **Owner-prefixed names and plain `app:` labels with a unique value** (`app: catalog-api-redis`). This is safe, but no label is shared, so you can't list "every Redis".
3. **Owner-prefixed names and the [recommended labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/)** (`app.kubernetes.io/*`). Chosen.

## Decision
- **Names:** `<owner>-<software>` for a dependency owned by one service (`catalog-api-redis`). The app services keep their own names (`catalog-api`, `search-service`). There's no kind suffix such as `-deployment`. The Deployment and its Service share one name, so the object name and the DNS name match.
- **Labels** on every object and every pod template:
  - `app.kubernetes.io/name`: the software (`redis`)
  - `app.kubernetes.io/instance`: which one, unique (`catalog-api-redis`)
  - `app.kubernetes.io/component`: its role here (`cache`, `database`, `search`, `api`)
  - `app.kubernetes.io/part-of`: `product-catalog`
- **Selectors** use `name` + `instance` only. They never use `version`, an image tag, or anything else that changes over the app's life.
- Every namespaced manifest sets `metadata.namespace: catalog`.

## Consequences
- A second Redis (or Postgres) can be added without a selector clash. `kubectl get pods -A -l app.kubernetes.io/name=redis` still lists them all, and `-l app.kubernetes.io/part-of=product-catalog` lists the whole stack.
- The label keys are the ones Helm charts and tools such as k9s already understand.
- **K7 risk:** Helm charts conventionally set `app.kubernetes.io/instance` to the release name. If the chart does that, the selector value changes, and because selectors are immutable, the Deployments must be deleted and recreated once during the move to Helm. Decide in K7 whether to keep `instance` as defined here or adopt the release name.
- Names are longer (`catalog-api-redis.catalog.svc.cluster.local`), which is acceptable.
