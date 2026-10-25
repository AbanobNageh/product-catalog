# T3 Modules and environments
- Date: 2026-10-25 · Commits: a354f0d

## What was built
The AI explained the T3 concepts before writing anything:
- root and child modules, inputs and outputs
- module sources: a local path, Git with `?ref=`, or the Registry
- CLI workspaces vs one folder per environment
- the host-port and memory limits of two kind clusters on one machine

It also corrected a claim in `STATUS.md`: modules inside one root don't remove T2's provider caveat; only a separate cluster root would. The user made four design choices, then the AI wrote every file. The user ran every command that changed a cluster.

- **`terraform/modules/`**, three child modules. Each has `versions.tf` (its own `required_providers` with minimum versions), `variables.tf`, `main.tf` and `outputs.tf`, and none configures a provider:
  - `cluster`: `kind_cluster.this` with the name, API server port and HTTP/HTTPS host ports as inputs (each validated to stay below Windows' dynamic range), plus `kind_load.images` over an `images` set. Image loading lives here because it's kind-only, which keeps the app module usable on EKS. Outputs: the name, the ID, the context and the connection details (`client_key` marked `sensitive`).
  - `platform`: the Gateway API CRDs (`terraform_data` + `local-exec`, re-run when `cluster_id` or the version changes), Traefik 42.1.3 and metrics-server 3.14.0. The versions are inputs with defaults, so every environment gets the same platform. Output: the Gateway's name and namespace.
  - `app`: `kubernetes_namespace_v1.this` and `helm_release.product_catalog`. The `values_files` input is checked with `fileexists()` during plan, and the image tags are validated (no `latest`). Outputs: the namespace and the release status.
- **`terraform/envs/dev` and `terraform/envs/staging`**, two root modules, each with its own state:
  - `versions.tf` pins the providers (`~>`). `providers.tf` configures kubernetes and helm from `module.cluster` outputs and is identical in both.
  - `main.tf` holds the three module calls. Every dependency is listed in `depends_on` on the module block, marked *required* or *also implied* (the user's T2 readability rule).
  - `variables.tf` holds the per-environment release versions; `outputs.tf` the context, URL, release status and Gateway.
  - dev: cluster `catalog-dev`, host ports 80/443, API 6443, `http://catalog.localhost`.
  - staging: cluster `catalog-staging`, host ports 8090/8443, API 6444, `http://catalog.staging.localhost:8090`.
- **Chart values:**
  - `values-dev.yaml` is now small: catalog-api 1 replica with the HPA off, search-service 1, no PDBs on either, and a catalog-api CPU request of 100m.
  - `values-staging.yaml` (new) keeps `values.yaml`'s HPA 2–5, two search-service pods and the PDBs, with catalog-api at 384Mi. Both environments are seeded.
- **`terraform/local/` deleted** after the user's `terraform destroy` there, and after the AI checked that its state was empty and `kind get clusters` no longer listed `catalog`.
- **`AGENTS.md` Commands:** "Cluster, platform and app" now covers both environments:
  - a table of folders, contexts, URLs and ports
  - explicit `--context`/`--kube-context` everywhere
  - build one environment at a time from nothing
  - cleaning up a failed release that isn't in state
  - releasing per environment, and the load test against staging (`-e BASE_URL`/`HOST`)
  - Helm 4's `helm list` without `-a`

  Each new command was run first: the load test with 3 iterations, Helm history and list per context, the OpenSearch check, and the `.tf`-only diff loop.

Verified:
- **Before handing over** (on a scratch copy, so the user's `init` stayed a first run):
  - `terraform fmt -check -recursive`, then `init`, `validate`, and `plan` → `9 to add` for each environment, with the right names, ports and values file.
  - `helm lint --strict` and `helm template` for both values files: dev has no HPA and only the OpenSearch subchart's PDB; staging has the HPA and three PDBs.
  - `Host: catalog.localhost:8090` returned 200 on the T2 cluster, which showed Traefik matches route hostnames without the port.
- **First applies (both at once): failed.** Both stopped at the release with `context deadline exceeded`. The user ran `helm status`, `kubectl get pods,jobs` and `kubectl get events`, and they read the output with the AI:
  - The OpenSearch image pull took 13m20s, because two clusters were pulling at once.
  - search-service was in `CrashLoopBackOff` waiting for OpenSearch.
  - Helm's 15-minute wait ran out before the hooks ran (no Jobs).
- **Recovery:**
  - The AI predicted `plan` would show the release as *tainted*. It showed a plain create instead: the helm provider hadn't saved the failed release to state, while Helm kept it as `failed` (`terraform state list` vs `helm list`).
  - The user ran `helm uninstall`, then `terraform apply` in each environment. The image was cached, so the installs and hooks finished in minutes.
- **Done-when:**
  - **Both environments from the same modules:**
    - dev `/healthz` → `{"status":"ok","version":"0.1.1"}`, staging (`:8090`) likewise, and search returned `SEED-*` hits in both.
    - dev: 1 catalog-api and 1 search-service pod, no HPA.
    - staging: 2 + 2 pods, HPA `cpu: 0%/70%` (2–5), three PDBs, `products-v2` with 10,000 docs.
    - Gateway `PROGRAMMED True` in both, and `terraform plan` → "No changes" in both.
    - The six nodes use about 6.9 GiB of the 15.3 GiB Docker VM.
  - **Workspaces vs folders:** argued in [ADR-0015](../adr/0015-terraform-modules-and-env-folders.md) and the close-out reply. The explain-back was skipped (finish first, study later).

## Decisions (link ADRs)
- [ADR-0015](../adr/0015-terraform-modules-and-env-folders.md), all four as recommended except the migration:
  - **One root folder per environment** (`terraform/envs/<env>`) calling `terraform/modules/{cluster,platform,app}`, with local module sources. Not CLI workspaces, and not two roots per environment.
  - **Destroy and rebuild** the T2 cluster, rather than keeping it as dev with `moved` blocks. The clusters got environment names, `catalog-dev` and `catalog-staging`.
  - **Staging at `catalog.staging.localhost:8090`**, with ports 8090/8443 and API 6444. A distinct hostname as well as a distinct port.
  - **Dev small, staging prod-like**, with the differences in per-environment chart values files (the K7 plan).

## Follow-ups
- **The first build is slow because of OpenSearch's image** (1.2 GB, pulled by the node). Two clusters at once exceeded the 15-minute timeout. Options for the user:
  - Preload it with `kind_load` from a single `docker pull` on the host (recommended).
  - Raise `timeout`.
  - Keep "one environment at a time" (now in `AGENTS.md`).
- **A failed install leaves an orphan.** When the helm provider's create fails, the release isn't saved to state but Helm keeps it as `failed`, so a plain re-apply can't install over it. Recovery is in `AGENTS.md`. The provider's `atomic = true` (roll back on failure) would avoid the orphan; it's the user's call.
- **T2's provider caveat is still there:** the cluster and its workloads share one plan per environment. Replacing a cluster under existing releases means destroying that environment and applying again.
- **T4:** each environment's state moves to MinIO under its own key. The local `.terraform.tfstate.lock.info` seen during the applies is the lock T4 replaces.
- **`AGENTS.md` session routine** (user-owned) still says `kubectl get pods -n catalog`. Proposed: add `--context kind-catalog-dev` (and staging).
- **Carried:**
  - T5's managed OpenSearch/RDS switches, re-sized requests and restricting `POST /admin/reindex`.
  - App follow-ups (the user's call): search-service crash-loops until OpenSearch is up, which made this timeout worse; Redis in `/readyz`; no index self-heal.
