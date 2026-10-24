# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** K7 Helm (not started). The cluster `kind-catalog` runs the full app in `catalog` (Redis, Postgres, catalog-api 0.1.1 ×2–5 under an HPA, OpenSearch with 10,000 products, search-service 0.1.0 ×2), Traefik in `traefik` (Helm release `traefik`, chart 42.1.3) and metrics-server in `kube-system` (Helm release `metrics-server`, chart 3.14.0). Every workload has requests and limits ([ADR-0011](adr/0011-requests-limits-policy.md)). catalog-api answers at `http://catalog.localhost`. Check: `kubectl get pods -A`, `kubectl get hpa,pdb -n catalog`, `curl.exe -s http://catalog.localhost/healthz`. After a reboot, start Docker Desktop first.
- **Last session:** 2026-10-24. Closed K6 Resources, scaling, failure drills (797b108, [note](milestones/2026-10-24-K6-resources-scaling-failure-drills.md)). Accepted ADR-0011 (memory request = limit, CPU requests only). HPA 2→5 under k6 (411 req/s, p95 6.5 ms, 0 failures); all five failure drills done. The AI writes the files and explains them; the user runs the commands. Quizzes and explain-backs stay skipped until the project is finished (revisit list in `docs/learning/progress.md`).
- **Next step:** start K7 with the `teach-module` skill ([plan](plan/kubernetes.md)). The AI writes; define every new Helm term on first use (the user has only used `helm install`/`upgrade` so far). Follow ADR-0008 for names and labels.
  - From the [K6 note](milestones/2026-10-24-K6-resources-scaling-failure-drills.md#follow-ups):
    - K7: the chart templates the HPA and both PDBs, leaves `replicas` out of the Deployment when autoscaling is on, and puts resources (ADR-0011 sizes) in values. metrics-server stays platform-side.
    - Carried from K5: the chart templates the HTTPRoute; the official OpenSearch chart vs the hand-written StatefulSet; Helm hooks for the migration and seed Jobs; template the Secret; `instance` = release name vs ADR-0008.
    - App follow-ups (the user's call, not K7): Redis in catalog-api's `/readyz`; search-service doesn't recover its index after OpenSearch loses data. K8: `POST /admin/reindex` is public.
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
- [ ] K7 Helm
- [ ] K8 Security basics (optional)

### Part 3: Terraform ([plan](plan/terraform.md))
- [ ] T0 Concepts
- [ ] T1 Language basics and drift
- [ ] T2 Local platform with Terraform
- [ ] T3 Modules and environments
- [ ] T4 Remote state and locking
- [ ] T5 AWS
