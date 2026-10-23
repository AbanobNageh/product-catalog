# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** K2 Config, Secrets, Postgres StatefulSet (not started). The cluster `kind-catalog` is still running with Redis (`catalog-api-redis`) in the `catalog` namespace; check it with `kubectl get nodes` and `kubectl get pods -n catalog`.
- **Last session:** 2026-10-23. Closed K1 Pods, Deployments, Services (c91723f, [note](milestones/2026-10-23-K1-pods-deployments-services.md)). Accepted [ADR-0008](adr/0008-k8s-naming-and-labels.md) (names and labels).
- **Next step:** start K2 with the `teach-module` skill ([plan](plan/kubernetes.md)). Define every new term on first use. Follow ADR-0008 for names and labels (Postgres: `component: database`).
  - From the [K1 note](milestones/2026-10-23-K1-pods-deployments-services.md#follow-ups):
    - K2: StatefulSet vs Deployment replacement (no overlap), PersistentVolumes (the lost `demo` key).
    - K3: `REDIS_URL=redis://catalog-api-redis:6379/0`; a real image change and `rollout undo`; a readiness probe for Redis.
    - K7: Helm's `instance` = release-name convention vs ADR-0008 (selectors are immutable).
  - Still carried:
    - K2: the seed runs as a Job.
    - K3: the migration image; `kind load docker-image`, never `:latest`.
    - K4/K7: OpenSearch must run with `action.auto_create_index: "-products*,+*"`, or search-service won't start.
    - K5: Traefik needs hostPort 80/443 plus a nodeSelector `catalog/role=gateway-node`. Confirm Option A vs B and write the ADR then.
- **Open questions / blockers:** none.

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
- [ ] K2 Config, Secrets, Postgres StatefulSet
- [ ] K3 catalog-api: probes, migrations, rollouts
- [ ] K4 OpenSearch + search-service
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
