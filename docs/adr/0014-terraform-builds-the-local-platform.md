# 0014. Terraform builds the whole local platform

- **Status:** Accepted (approved at the T2 close)
- **Date:** 2026-10-25

## Context
- Until K7, the local cluster was built by hand, in order: `kind create cluster`, `kind load` our images, apply the Gateway API CRDs, install Traefik, apply `k8s/traefik/gateway.yaml`, install metrics-server, then install the `product-catalog` chart (`AGENTS.md`, "Cluster" and "Platform").
- T2's goal: `terraform apply` from nothing gives a working app at `catalog.localhost`, and `terraform destroy` removes it all. Configuration in `terraform/local/`.
- A **CRD** (CustomResourceDefinition) adds a new object type to the API server. The Gateway, GatewayClass and HTTPRoute types come from the Gateway API project's CRDs, not from Kubernetes itself.
- Facts checked on 2026-10-25:
  - Traefik froze its `traefik-crds` chart at 1.18.0 (Gateway API v1.5.1). Since Traefik chart v40.2.0, installing Gateway API CRDs is no longer Traefik's job ([traefik-helm-chart#1669](https://github.com/traefik/traefik-helm-chart/issues/1669)).
  - `kubernetes_manifest` (hashicorp/kubernetes) needs the API server, and the CRD of each object, during `plan`, so it can't create a Gateway in the same apply that creates the cluster.
  - The Traefik chart's `gateway:` values render the same Gateway as `k8s/traefik/gateway.yaml` (checked with `helm template`).
  - tehcyx/kind 0.13 has a `kind_load` resource, which does what `kind load docker-image` does.

## Options
1. **Cluster:** replace the hand-built `kind-catalog` with a Terraform-built cluster of the same name and layout (chosen), or run a second cluster beside it on other host ports.
2. **Scope:** everything the app needs, including metrics-server (chosen), or only the plan's list (cluster, namespace, Traefik, the chart).
3. **Gateway API CRDs:** `terraform_data` + `local-exec` running upstream's `kubectl apply --server-side` (chosen); the frozen `traefik-crds` chart; the community `alekc/kubectl` provider; or a vendored local chart.
4. **The Gateway:** the Traefik chart's `gateway:` values (chosen), or keep `gateway.yaml` and apply it outside Helm.
5. **Images:** the `kind_load` resource (chosen), `local-exec` running `kind load`, a local registry, or a manual `kind load` between two applies.

## Decision
- **Replace, same name `catalog`:** the host ports 80/443 allow only one such cluster at a time, two clusters running OpenSearch don't fit in 8 GB, and the existing `kubectl`/`helm` commands keep working (context `kind-catalog`).
- **Everything, including metrics-server:** without it the HPA reads `<unknown>` and the cluster doesn't match what K6 built.
- **CRDs from upstream via `local-exec`:** it's upstream's documented install method, it keeps v1.6.3, and it adds no provider. The cost: the CRDs aren't in Terraform's state. They're deleted with the cluster, and changing `gateway_api_version` reapplies them.
- **Gateway from the Traefik chart:** a Helm release tracks it, and it needs no `kubernetes_manifest`. Its settings live in `k8s/traefik/values.yaml`; `k8s/traefik/gateway.yaml` was deleted at the T2 close.
- **`kind_load`:** a real resource, in state and shown in `plan`; a tag change replaces it and loads the new image. The image tags are Terraform variables, shared with the chart's `--set` values.

## Consequences
- The `kubernetes` and `helm` providers are configured from `kind_cluster` attributes. This works for create and destroy as one unit; replacing the cluster under existing releases doesn't (unknown credentials during plan). T3 splits the cluster from what runs on it.
- Terraform owns the cluster: a hand change (`helm upgrade`, `kubectl apply`) is drift that the next `apply` may undo. A release becomes: build both images, then `terraform apply "-var=catalog_api_version=<v>"`.
- Every `kind_cluster` argument forces replacement: editing the node layout destroys the cluster and its data.
- The API server's host port is pinned (`api_server_port`, default 6443). On 2026-10-25 the hand-built cluster's random port (61528) fell inside a block Windows reserved at boot (`netsh interface ipv4 show excludedportrange protocol=tcp`: 61489–61588). Docker kept the binding configured but couldn't publish it, so kubectl got "connection refused" while the app still answered on port 80. A second cluster (T3) needs a different port, such as 6444.
- Terraform is the only documented path (decided at the T2 close). The hand-run cluster, platform and install commands left `AGENTS.md`, and `k8s/kind-config.yaml` (the K0 layout, now in `1-cluster.tf`) and `k8s/traefik/gateway.yaml` were deleted; git history keeps them. The Traefik and metrics-server values files stay in `k8s/`, read by Terraform.
