# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** 1.5 Polish (not started).
- **Last session:** 2026-10-22. Closed 1.4 Wire up + Compose (a3e4e74, [note](milestones/2026-10-22-1.4-wire-up-compose.md)). ADR-0006 accepted.
- **Next step:** plan 1.5.
  - The README: how to run it (Compose, seed, Dashboards), the architecture diagram and the trade-offs.
  - Images tagged `0.1.0`.
  - The user added an **alias-swap reindex** to 1.5: build a fresh `products-<n>` index, refresh once, swap the alias. Reindex then removes products deleted while search-service was down, and the 21s per-batch refresh goes away.
  - Deferred review minors are in the [1.4 note](milestones/2026-10-22-1.4-wire-up-compose.md#follow-ups).
- **Open questions / blockers:** none.

## Checklist
### Part 1: the app ([plan](plan/app.md))
- [x] 1.1 Repo scaffold · 2026-10-21 · b7ada79 · [note](milestones/2026-10-21-1.1-repo-scaffold.md)
- [x] 1.2 catalog-api · 2026-10-21 · 803731c · [note](milestones/2026-10-21-1.2-catalog-api.md)
- [x] 1.3 search-service · 2026-10-22 · 99ca6da · [note](milestones/2026-10-22-1.3-search-service.md)
- [x] 1.4 Wire up + Compose · 2026-10-22 · a3e4e74 · [note](milestones/2026-10-22-1.4-wire-up-compose.md)
- [ ] 1.5 Polish

### Part 2: Kubernetes ([plan](plan/kubernetes.md))
- [ ] K0 Concepts and setup
- [ ] K1 Pods, Deployments, Services
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
