# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** K7 closed. Next: the user decides whether to do K8 Security basics (optional) or move to T0. The cluster `kind-catalog` (recreated 2026-10-24) runs the app as the Helm release `product-catalog` in `catalog` (revision 4: catalog-api 0.1.1 ×2–5 under an HPA, search-service 0.1.0 ×2, Postgres, Redis, and OpenSearch 3.9.0 from the official chart with 10,000 products). The platform is separate: Traefik in `traefik` (chart 42.1.3) with the Gateway from `k8s/traefik/gateway.yaml`, and metrics-server in `kube-system` (chart 3.14.0). catalog-api answers at `http://catalog.localhost`. Check: `helm list -A`, `kubectl get pods,hpa,pdb -n catalog`, `curl.exe -s http://catalog.localhost/healthz`. After a reboot, start Docker Desktop first.
- **Last session:** 2026-10-24. Closed K7 Helm (1a0a660, [note](milestones/2026-10-24-K7-helm.md)). The chart `charts/product-catalog` replaced the plain manifests. Accepted ADR-0012 (instance = release name, selectors add `component`) and ADR-0013 (migrate/seed as Helm hooks). A fresh-cluster `helm install`, an upgrade 0.1.0 → 0.1.1 and two rollbacks all ran with no errors. The AI writes the files and explains them; the user runs the commands. Quizzes stay skipped until the project is finished (revisit list in `docs/learning/progress.md`).
- **Next step:** the user's K8 decision.
  - If K8: start it with the `teach-module` skill ([plan](plan/kubernetes.md)). The cluster must be recreated with Calico or Cilium (kind's default CNI ignores NetworkPolicy). The security context can go into the chart without that.
  - If skipped: tick K8 as skipped (with the user's OK), propose the end-of-Part-2 cuts to `AGENTS.md` and `.claude/rules/` (including the out-of-date "Who writes what" line), then start T0 with `teach-module` ([plan](plan/terraform.md)).
  - From the [K7 note](milestones/2026-10-24-K7-helm.md#follow-ups): search-service crash-loops on a fresh install until OpenSearch is up; the Postgres password is in the release history; T2 decides whether Terraform installs the Helm releases.
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
- [ ] K8 Security basics (optional)

### Part 3: Terraform ([plan](plan/terraform.md))
- [ ] T0 Concepts
- [ ] T1 Language basics and drift
- [ ] T2 Local platform with Terraform
- [ ] T3 Modules and environments
- [ ] T4 Remote state and locking
- [ ] T5 AWS
