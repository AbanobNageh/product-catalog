# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** Part 2 done (K0–K7); Security basics (formerly K8) moved to [Part 4 extras](plan/extras.md) as a possible future module. Next: T0 Concepts. The cluster `kind-catalog` (recreated 2026-10-24) runs the app as the Helm release `product-catalog` in `catalog` (revision 4: catalog-api 0.1.1 ×2–5 under an HPA, search-service 0.1.0 ×2, Postgres, Redis, and OpenSearch 3.9.0 from the official chart with 10,000 products). The platform is separate: Traefik in `traefik` (chart 42.1.3) with the Gateway from `k8s/traefik/gateway.yaml`, and metrics-server in `kube-system` (chart 3.14.0). catalog-api answers at `http://catalog.localhost`. Check: `helm list -A`, `kubectl get pods,hpa,pdb -n catalog`, `curl.exe -s http://catalog.localhost/healthz`. After a reboot, start Docker Desktop first.
- **Last session:** 2026-10-24. Closed K7 Helm (1a0a660, [note](milestones/2026-10-24-K7-helm.md)). The chart `charts/product-catalog` replaced the plain manifests. Accepted ADR-0012 (instance = release name, selectors add `component`) and ADR-0013 (migrate/seed as Helm hooks). A fresh-cluster `helm install`, an upgrade 0.1.0 → 0.1.1 and two rollbacks all ran with no errors. The AI writes the files and explains them; the user runs the commands. Quizzes stay skipped until the project is finished (revisit list in `docs/learning/progress.md`).
- **Next step:** start T0 with the `teach-module` skill ([plan](plan/terraform.md)). Terraform isn't installed yet (`winget install Hashicorp.Terraform`, then a new terminal). The AI writes; define every new Terraform term on first use.
  - For Part 3, from the [K7 note](milestones/2026-10-24-K7-helm.md#follow-ups): T2 decides whether Terraform's Helm provider installs the platform releases and this chart; T3 environments map to values files; T5 uses `opensearch.enabled: false` + `searchService.opensearchUrl` for a managed OpenSearch (Postgres needs the same switch for RDS), re-sizes requests on real nodes, and must restrict `POST /admin/reindex` before the app gets a public URL.
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
- [ ] T0 Concepts
- [ ] T1 Language basics and drift
- [ ] T2 Local platform with Terraform
- [ ] T3 Modules and environments
- [ ] T4 Remote state and locking
- [ ] T5 AWS
