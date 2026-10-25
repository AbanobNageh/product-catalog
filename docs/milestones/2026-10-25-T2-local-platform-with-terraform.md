# T2 Local platform with Terraform
- Date: 2026-10-25 · Commits: ce6a4a8

## What was built
The AI explained the T2 concepts (multiple providers, provider configuration that depends on a resource, `depends_on`), put the design choices to the user, then wrote every file. After the files were written, the user said they didn't understand how it worked. The AI then explained the flow from the user's own manual steps:
- the manual command each resource replaces, and what create, change and destroy do for each
- the real `terraform graph` output, as apply waves
- the three sources of graph edges: references, provider configuration, and `depends_on`
- the "connect to a cluster that doesn't exist yet" problem, shown with the plan's `(known after apply)` values

The user found the unordered, implicit style hard to read at a glance. They chose numbered files in apply order and an explicit `depends_on` for every dependency, and rejected per-resource "runs after" comments because comments go stale. The user ran every command that changed the cluster.

- **`terraform/local/`** (9 resources, providers tehcyx/kind 0.13.0, hashicorp/kubernetes 3.4.0, hashicorp/helm 3.3.0):
  - `versions.tf`, `providers.tf`: the `kubernetes` and `helm` providers are configured from `kind_cluster.this` attributes (`endpoint`, the client certificate and key, the CA). The helm provider uses v3 syntax (`kubernetes = { ... }`).
  - `variables.tf`: the cluster name, the node image pinned by digest (Kubernetes 1.37.0), `api_server_port` (default 6443, validated to stay below Windows' dynamic range), the image tags (validated: no `latest`), the Gateway API version and the chart versions.
  - `1-cluster.tf`: `kind_cluster.this` (the K0 layout: 1 control-plane, 2 workers, `127.0.0.1:80/443` to the `gateway-node` worker, API server on `127.0.0.1:6443`) and `kind_load.images`, with `for_each` over our three images.
  - `2-platform.tf`:
    - `terraform_data.gateway_api_crds`, with a `local-exec` provisioner running `kubectl apply --server-side` of the upstream v1.6.3 CRDs, then `kubectl wait --for=condition=Established`.
    - `helm_release.traefik` (42.1.3) and `helm_release.metrics_server` (3.14.0), from the existing values files.
  - `3-app.tf`: `kubernetes_namespace_v1.catalog`, and `helm_release.product_catalog` (local chart, `values-dev.yaml`, image tags via `set`, `wait`, 900 s timeout).
  - `outputs.tf`: the kubectl context, the app URL and the release status.
  - Every resource lists all its dependencies in `depends_on`. Comments mark the three that are *required* (Traefik needs the CRDs; the app needs Traefik and the images) and the ones that are *also implied*.
- **`k8s/traefik/values.yaml`** now defines our Gateway (`gateway.enabled: true`, name `product-catalog`, listener `web` on 8000, catalog-namespace selector). `k8s/kind-config.yaml` and `k8s/traefik/gateway.yaml` were deleted.
- **`AGENTS.md` Commands:** "Cluster, platform and app" replaces the hand-run Cluster, Platform and install steps. It covers prerequisites, apply/destroy, Terraform owning the releases, the pinned port, and releasing through `variables.tf`. The quoted `-var` form was tested in PowerShell 5.1 before it went in.
- **`.gitignore`:** `terraform/**/*-config`. With no `kubeconfig_path`, the kind provider also writes `./catalog-config` with the cluster's admin key. This was found in `git status` before the commit, and the provider source confirmed it.

Verified:
- **Before handing over:**
  - Checked in a scratch copy of the folder: `fmt -check`, `init`, `validate`, and `plan` → `9 to add`, plus `terraform graph` (8 edges, unchanged after adding the redundant `depends_on`).
  - `helm template` showed the Traefik chart's Gateway matches the old `gateway.yaml` (name, class, listener, selector).
  - `-var=api_server_port=55000` was rejected by the validation.
- **Smoke check at the start:** the old cluster's app still answered at `catalog.localhost`, but kubectl got "connection refused" on `127.0.0.1:61528`. Read with the user:
  - `docker port` was empty.
  - `kind get kubeconfig` failed with "slice index out of range".
  - `docker inspect` showed the binding configured (`61528`) but not published (`[]`).
  - `netsh interface ipv4 show excludedportrange protocol=tcp` listed `61489–61588`: Windows had reserved the block at boot, so Docker couldn't bind it.
  - Fix: pin the API server port.
- **Done-when:**
  - **Apply from nothing:** the user deleted the old cluster, then ran `terraform apply` from nothing. Checked afterwards:
    - 3 nodes Ready, API server on `127.0.0.1:6443`, all pods Running, migrate and seed hooks Completed.
    - Gateway `PROGRAMMED True`, HPA `cpu: 0%/70%`, `kubectl top nodes` working.
    - `/healthz` → `{"status":"ok","version":"0.1.1"}`, and search returned `SEED-*` products.
    - `terraform plan` → "No changes".
  - **Destroy:** the user ran `terraform destroy`; `kind get clusters` showed no `catalog` and the `kind-catalog` context was gone. Then `terraform apply` rebuilt everything.
  - **After the close edits:** moving the Gateway into the values file gave `1 to change` (`helm_release.traefik` values only). The user's apply made Traefik revision 2 with the Gateway still programmed, and `plan` → "No changes".

## Decisions (link ADRs)
- [ADR-0014](../adr/0014-terraform-builds-the-local-platform.md), approved at the close:
  - **Replace** `kind-catalog` with a Terraform-built cluster of the same name, rather than running a second cluster.
  - **Install everything,** including metrics-server.
  - **Gateway API CRDs from upstream via `local-exec`.** Traefik froze its `traefik-crds` chart at Gateway API v1.5.1 (found while checking the first recommendation, so the question went back to the user), and `kubernetes_manifest` can't plan against a cluster that doesn't exist yet.
  - **The Gateway from the Traefik chart's values.**
  - **Images via `kind_load`.** The provider's native resource replaced the agreed `local-exec kind load`; the AI told the user.
  - **API server port pinned** after the reserved-range incident.
  - **Terraform is the only documented path.**
- Readability (the user's choice): files numbered in apply order, and every dependency in `depends_on`, without "runs after" comments.

## Follow-ups
- **The provider configuration depends on `kind_cluster`.** Replacing the cluster under existing releases won't plan cleanly, and every `kind_cluster` change forces a replacement. T3 splits the cluster from what runs on it (`cluster` / `platform` / `app` modules).
- **T3's second cluster** needs its own `api_server_port` (for example 6444) and other host ports than 80/443, or the two can't run at once.
- **The Gateway API CRDs aren't in state.** `plan` won't notice if they're deleted by hand; changing `gateway_api_version` reapplies them.
- **A one-off `-var` release is rolled back** by the next plain `apply`. Releases go through the `variables.tf` defaults (or a tfvars file, which T3's environments will need anyway).
- **tehcyx/kind 0.13.0** was 3 days old when chosen (2026-10-22). It's a community provider; watch its releases.
- **Carried:** from K7, T3 environments as values files; T5's managed OpenSearch/RDS switches, re-sized requests and restricting `POST /admin/reindex`. App follow-ups (the user's call): search-service crash-loops until OpenSearch is up, Redis in `/readyz`, no index self-heal.
