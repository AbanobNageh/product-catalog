# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** K5 Ingress, then Gateway API (not started). The cluster `kind-catalog` runs the full app in `catalog`: Redis, Postgres, catalog-api 0.1.1 (2 replicas), OpenSearch (`search-service-opensearch-0`, 10,000 products seeded) and search-service 0.1.0 (2 replicas); check it with `kubectl get pods,pvc -n catalog`.
- **Last session:** 2026-10-23. Closed K4 OpenSearch + search-service (095a0c4, [note](milestones/2026-10-23-K4-opensearch-search-service.md)). The user asked the AI to write K4's manifests and skipped the quiz; the search-side commands are in `AGENTS.md` (Cluster).
- **Next step:** start K5 with the `teach-module` skill ([plan](plan/kubernetes.md)), after reading `docs/learning/progress.md`. Define every new term on first use. Follow ADR-0008 for names and labels.
  - K5: Traefik needs hostPort 80/443 plus a nodeSelector `catalog/role=gateway-node`. Confirm Option A vs B and write the ADR then. Only catalog-api is exposed; search-service and OpenSearch stay internal.
  - From the [K4 note](milestones/2026-10-23-K4-opensearch-search-service.md#follow-ups):
    - K6: requests and limits on catalog-api, Postgres, Redis and both Jobs; OpenSearch QoS; the OpenSearch PVC-delete drill; a Redis-outage drill; readiness probes for Redis and Postgres; the StatefulSet delete/re-apply and node-failure drills.
    - K7: the official OpenSearch chart vs the hand-written StatefulSet; Helm hooks for the migration and seed Jobs; template the Secret; Helm's `instance` = release-name convention vs ADR-0008.
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
- [ ] K5 Ingress, then Gateway API
- [ ] K6 Resources, scaling, failure drills
- [ ] K7 Helm
- [ ] K8 Security basics (optional)

### Part 3: Terraform ([plan](plan/terraform.md))
- [ ] T0 Concepts
- [ ] T1 Language basics and drift
- [ ] T2 Local platform with Terraform
- [ ] T3 Modules and environments
- [ ] T4 Remote state and locking
- [ ] T5 AWS
