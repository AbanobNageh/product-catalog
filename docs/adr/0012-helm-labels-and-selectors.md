# 0012. Labels and selectors under Helm: instance = release name

- **Status:** Accepted (approved at the K7 close). Supersedes the `instance` value and the selector rule of [ADR-0008](0008-k8s-naming-and-labels.md); its naming rules stay.
- **Date:** 2026-10-24

## Context
- In K7 the app moves from `kubectl apply` manifests to one Helm chart, `charts/product-catalog`, installed as the release `product-catalog`. ADR-0008 left one question for K7: keep `app.kubernetes.io/instance` per workload (`catalog-api`, `catalog-api-postgres`, …), or set it to the release name, as charts conventionally do.
- The official OpenSearch subchart sets `instance` to the release name and selects on `name` + `instance`. A parent chart can't change that.
- The migration and seed Job pods carry `name: catalog-api`, like the API pods. Under ADR-0008 their distinct `instance` values (`catalog-api-migrate`, `catalog-api-seed`) kept them out of the catalog-api Service. If every workload shares `instance: product-catalog`, the selector `name` + `instance` would match the Job pods too, and a running Job pod with no readiness probe counts as ready, so it would receive API traffic.
- Selectors are immutable. Changing them on running objects means deleting and recreating the Deployments and StatefulSets. K7 installs on a fresh cluster anyway (the Done-when), so the change costs nothing now.

## Options
1. **Keep ADR-0008:** `instance` per workload, selectors on `name` + `instance`. No new rule, but it breaks the Helm convention, and the OpenSearch subchart's labels differ from everything else.
2. **`instance` = release name; selectors on `name` + `instance` + `component`.** Chosen. One convention across our templates and the subchart; `component` (`api`, `migration`, `seed`, `database`, `cache`) separates the workloads that share a `name`.
3. **`instance` = release name; Jobs get their own `name`** (`catalog-api-migrate`). Selectors stay two labels, but `name` would no longer mean "the software", which is how ADR-0008 defines it.

## Decision
- **Labels** on every object and pod template, from named templates in `templates/_helpers.tpl`:
  - `app.kubernetes.io/name`: the software (`catalog-api`, `search-service`, `postgres`, `redis`)
  - `app.kubernetes.io/instance`: the Helm release name (`product-catalog`)
  - `app.kubernetes.io/component`: the role (`api`, `migration`, `seed`, `database`, `cache`)
  - `app.kubernetes.io/part-of`: `product-catalog`
  - `app.kubernetes.io/version`: the image tag, for catalog-api and search-service
  - `app.kubernetes.io/managed-by: Helm` and `helm.sh/chart: product-catalog-<chart version>`
- **Selectors** use `name` + `instance` + `component`. Never the version, the chart label or anything else that changes.
- **StatefulSet `volumeClaimTemplates`** get only the labels that never change (selector labels + `part-of`). They are immutable, so a chart-version label there would fail every upgrade after a chart bump.
- **Object names are unchanged** (ADR-0008: `catalog-api`, `catalog-api-postgres`, `search-service-opensearch`, …), with no release-name prefix. DNS names, the HTTPRoute backend and the commands in `AGENTS.md` stay the same. The OpenSearch subchart keeps the K4 names through `fullnameOverride` and `masterService`.
- **`metadata.namespace: {{ .Release.Namespace }}`** in every template, so `helm template | kubectl apply` lands in the same namespace (ADR-0008's rule, now templated).

## Consequences
- `kubectl get pods -l app.kubernetes.io/instance=product-catalog` lists the whole release, including OpenSearch. `-l app.kubernetes.io/component=api` lists both API services.
- Because names aren't prefixed with the release name, **one release per namespace**. A second copy needs its own namespace.
- The OpenSearch subchart still differs in two labels we can't change: `component` is its StatefulSet name (`search-service-opensearch`), and its selector has no `component`. It adds `part-of` through its `labels` value.
- Moving existing objects to these labels would need a delete and recreate (immutable selectors). This happens once, on the fresh K7 cluster.
