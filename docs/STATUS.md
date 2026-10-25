# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** Part 3 in progress: T0–T3 done, next T4 Remote state and locking. Part 2 done (K0–K7); Security basics (formerly K8) moved to [Part 4 extras](plan/extras.md) as a possible future module. Terraform 1.16.6 is installed (winget). `terraform/docker-basics/` is applied: `tf-redis-cache`/`-sessions`/`-queue` on `127.0.0.1:6380`–`6382` and the imported `tf-redis-legacy` on 6383; `terraform destroy` there removes all four. Two environments run at once (ADR-0015), each a root in `terraform/envs/<env>` calling `terraform/modules/{cluster,platform,app}` with its own local state: **dev** (kind cluster `catalog-dev`, context `kind-catalog-dev`, API 6443, `http://catalog.localhost`, 1 catalog-api + 1 search-service, no HPA) and **staging** (`catalog-staging`, `kind-catalog-staging`, API 6444, `http://catalog.staging.localhost:8090`, catalog-api 2–5 under an HPA, search-service ×2, PDBs). Both run catalog-api 0.1.1, search-service 0.1.0, Traefik 42.1.3, metrics-server 3.14.0, Gateway API CRDs v1.6.3, and OpenSearch 3.9.0 seeded with 10,000 products; about 6.9 GiB together. Check: `terraform plan` in each env folder ("No changes"), `kubectl get pods,hpa,pdb -n catalog --context kind-catalog-<env>`, both `/healthz` URLs. After a reboot, start Docker Desktop first.
- **Last session:** 2026-10-25. Closed T3 Modules and environments (a354f0d, [note](milestones/2026-10-25-T3-modules-and-environments.md)). The user chose a folder per environment over CLI workspaces, destroy-and-rebuild over `moved` blocks, staging on its own hostname and ports, and dev small / staging prod-like via values files (ADR-0015). The AI wrote the three modules, both env roots and `values-staging.yaml`, and deleted `terraform/local/` after the user destroyed it. Both first applies at once timed out (two clusters pulling the 1.2 GB OpenSearch image); the user read `helm status`/pods/events with the AI, found the orphaned `failed` release (in Helm, not in state), ran `helm uninstall` and re-applied. `AGENTS.md` Commands now cover both environments. Explain-back skipped.
- **Next step:** start T4 with the `teach-module` skill ([plan](plan/terraform.md)): run MinIO in Docker, move each environment's state to the S3 backend pointed at MinIO with `use_lockfile = true` (one key per environment), then run two applies at once and watch the lock stop the second. New terms: backends, remote state, state locking, `terraform init -migrate-state`. First decisions: how MinIO runs (Compose service, `docker run`, or Terraform's Docker provider, which has its own chicken-and-egg state question), bucket and key layout, and where the MinIO credentials live (never in committed `.tf`).
  - From the [T3 note](milestones/2026-10-25-T3-modules-and-environments.md#follow-ups), the user's call: preload OpenSearch with `kind_load` to speed up first builds, `atomic = true` on the release to avoid orphaned failed installs, and adding `--context` to the `AGENTS.md` session routine (user-owned).
  - For Part 3, from the [K7 note](milestones/2026-10-24-K7-helm.md#follow-ups): T5 uses `opensearch.enabled: false` + `searchService.opensearchUrl` for a managed OpenSearch (Postgres needs the same switch for RDS), re-sizes requests on real nodes, and must restrict `POST /admin/reindex` before the app gets a public URL.
  - App follow-ups (the user's call): search-service crash-loops on a fresh install until OpenSearch is up; Redis in catalog-api's `/readyz`; no index self-heal after OpenSearch loses data.
- **Open questions / blockers:** the branch `backup/before-quiz-removal` (old K0/K1 history) can be deleted once the user confirms.

## Checklist
### Part 1: the app ([plan](plan/app.md))
- [x] 1.1 Repo scaffold · 2026-10-21 · b7ada79 · [note](milestones/2026-10-21-1.1-repo-scaffold.md)
- [x] 1.2 catalog-api · 2026-10-21 · 803731c · [note](milestones/2026-10-21-1.2-catalog-api.md)
- [x] 1.3 search-service · 2026-10-22 · 99ca6da · [note](milestones/2026-10-22-1.3-search-service.md)
- [x] 1.4 Wire up + Compose · 2026-10-22 · a3e4e74 · [note](milestones/2026-10-22-1.4-wire-up-compose.md)
- [x] 1.5 Polish · 2026-10-22 · bdae727 · [note](milestones/2026-10-22-1.5-polish.md)

### Part 2: Kubernetes ([plan](plan/kubernetes.md))
- [x] K0 Concepts and setup · 2026-10-23 · e32c5ff · [note](milestones/2026-10-23-K0-concepts-and-setup.md)
- [x] K1 Pods, Deployments, Services · 2026-10-23 · c91723f · [note](milestones/2026-10-23-K1-pods-deployments-services.md)
- [x] K2 Config, Secrets, Postgres StatefulSet · 2026-10-23 · 3ea04da · [note](milestones/2026-10-23-K2-config-secrets-postgres-statefulset.md)
- [x] K3 catalog-api: probes, migrations, rollouts · 2026-10-23 · 9c15d79 · [note](milestones/2026-10-23-K3-catalog-api-probes-migrations-rollouts.md)
- [x] K4 OpenSearch + search-service · 2026-10-23 · 095a0c4 · [note](milestones/2026-10-23-K4-opensearch-search-service.md)
- [x] K5 Ingress, then Gateway API · 2026-10-24 · ab01eff · [note](milestones/2026-10-24-K5-ingress-then-gateway-api.md)
- [x] K6 Resources, scaling, failure drills · 2026-10-24 · 797b108 · [note](milestones/2026-10-24-K6-resources-scaling-failure-drills.md)
- [x] K7 Helm · 2026-10-24 · 1a0a660 · [note](milestones/2026-10-24-K7-helm.md)

### Part 3: Terraform ([plan](plan/terraform.md))
- [x] T0 Concepts · 2026-10-24 · 798968a · [note](milestones/2026-10-24-T0-concepts.md)
- [x] T1 Language basics and drift · 2026-10-25 · cbff8e5 · [note](milestones/2026-10-25-T1-language-basics-and-drift.md)
- [x] T2 Local platform with Terraform · 2026-10-25 · ce6a4a8 · [note](milestones/2026-10-25-T2-local-platform-with-terraform.md)
- [x] T3 Modules and environments · 2026-10-25 · a354f0d · [note](milestones/2026-10-25-T3-modules-and-environments.md)
- [ ] T4 Remote state and locking
- [ ] T5 AWS
