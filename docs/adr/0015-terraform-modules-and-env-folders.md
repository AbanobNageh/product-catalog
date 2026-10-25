# 0015. Terraform modules, and one folder per environment

- **Status:** Proposed (T3)
- **Date:** 2026-10-25

## Context
- T2 left one root module, `terraform/local/`, that builds the kind cluster, the platform and the app in one state (ADR-0014).
- T3's goal: split it into `cluster`, `platform` and `app` modules, and run `dev` and `staging` from the same modules, with different replicas and resources, on separate kind clusters.
- A **root module** is the folder you run `terraform` in; it owns a state. A **child module** is a folder called from a root with a `module` block (inputs = its variables, outputs = what the caller can read).
- Terraform offers two ways to keep environments apart: **CLI workspaces** (one folder, one state file per workspace, chosen with `terraform workspace select`) or **one root folder per environment**.
- Facts checked on 2026-10-25:
  - HashiCorp's docs say CLI workspaces aren't a suitable isolation mechanism when deployments need separate credentials and access controls.
  - Two kind clusters can't share host ports. Dev keeps 80/443 and API port 6443; 6444, 8090 and 8443 are free and outside every Windows-reserved range (`netsh interface ipv4 show excludedportrange protocol=tcp`). 8080 is taken by another app.
  - The Docker VM has 15.3 GiB; the T2 cluster used about 2.8 GiB. Two clusters fit.
  - Traefik matches an HTTPRoute hostname without the port: `Host: catalog.localhost:8090` returned 200 on the T2 cluster.

## Options
1. **Environments:** a root folder per environment, `terraform/envs/<env>/` (chosen); the same, with each environment split into a cluster root and a workloads root (two states, two applies, the second reading the first's outputs); or CLI workspaces on one root.
2. **The T2 cluster:** destroy it and build `dev` from nothing (chosen), or keep it as `dev` with `moved` blocks that rename its state entries to the module addresses.
3. **Staging's address:** `http://catalog.staging.localhost:8090` (chosen), or `http://catalog.localhost:8090`.
4. **Sizing:** dev small, staging prod-like (chosen), or dev as today and staging bigger.
5. **Where environment differences live:** a chart values file per environment (chosen, the K7 plan), or typed Terraform inputs turned into Helm values.

## Decision
- **Layout:**
  - `terraform/modules/{cluster,platform,app}` hold the code.
  - `terraform/envs/{dev,staging}` are roots: each has its own state and its own cluster, and its `main.tf` calls the three modules with that environment's inputs.
  - The folder you're in is the environment you change; nothing hidden like a selected workspace decides it.
  - Module sources are local paths (`../../modules/<name>`). There's one repo and no consumers outside it, so versioned sources (Git `?ref=` or the Registry) would add nothing yet.
- **One root per environment, not two:** a single apply per environment, as in T2. The provider caveat stays (see Consequences).
- **Rebuild:** `terraform destroy` in `terraform/local/`, then delete that folder. The clusters get new names, `catalog-dev` and `catalog-staging`, so both contexts say which environment they are.
- **Ports and URLs:**

  | Environment | URL | Host ports (HTTP / HTTPS) | API server |
  |---|---|---|---|
  | dev | `http://catalog.localhost` | 80 / 443 | 6443 |
  | staging | `http://catalog.staging.localhost:8090` | 8090 / 8443 | 6444 |

  The hostname differs as well as the port, so a request can't reach the wrong environment by accident.
- **Sizing:**
  - dev (`values-dev.yaml`): one pod each for catalog-api and search-service, no HPA, no PDBs, and a catalog-api CPU request of 100m.
  - staging (`values-staging.yaml`): `values.yaml` as written (catalog-api 2–5 under an HPA, search-service 2, PDBs), plus 384Mi for catalog-api.
  - Both are seeded.
- **Differences in values files:** the chart already works this way, `helm template -f values-<env>.yaml` shows an environment without Terraform, and T5 can add `values-aws.yaml`. Terraform passes only the image tags.
- **Who owns what:**
  - `kind_load` is in the cluster module: loading images is a kind-only step, so the app module stays usable on EKS.
  - Provider blocks are only in the roots; modules declare `required_providers` with minimum versions, and the roots pin `~>`.

## Consequences
- The kubernetes and helm providers are still configured from the cluster's outputs within one plan. Replacing a cluster under existing releases fails during plan (ADR-0014): destroy that environment and apply again. A separate cluster root would remove this, at the cost of two applies and reading remote state.
- `versions.tf` and `providers.tf` are repeated in each environment folder. That's the price of folders: compare them file by file with `git diff --no-index terraform/envs/dev/<file> terraform/envs/staging/<file>`. Diffing the whole folders would also print the git-ignored state and the kubeconfig copy, which holds the admin key.
- Each environment has its own `.terraform.lock.hcl` and state file. T4 moves each state to MinIO under its own key.
- Release versions are per environment (`envs/<env>/variables.tf`), so dev can run ahead of staging.
- `kubectl` and `helm` commands need `--context kind-catalog-dev` or `--context kind-catalog-staging`, since the current context is whichever cluster was created last.
- Both clusters running at once take about 6–7 GiB of the Docker VM.
