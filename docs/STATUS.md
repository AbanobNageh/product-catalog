# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** K0 Concepts and setup (not started). Part 1 is complete.
- **Last session:** 2026-10-22. Closed 1.5 Polish (bdae727, [note](milestones/2026-10-22-1.5-polish.md)). ADR-0007 accepted. Part 1 is done.
- **Next step:** start K0 with the `teach-module` skill ([plan](plan/kubernetes.md)). First install kind (`winget install Kubernetes.kind`).
  - Carried into Part 2 from the [1.5 note](milestones/2026-10-22-1.5-polish.md#follow-ups):
    - K4/K7: OpenSearch must run with `action.auto_create_index: "-products*,+*"`, or search-service won't start.
    - K2: the seed runs as a Job.
    - K3: the migration image.
- **Open questions / blockers:** none.

## Checklist
### Part 1: the app ([plan](plan/app.md))
- [x] 1.1 Repo scaffold · 2026-10-21 · b7ada79 · [note](milestones/2026-10-21-1.1-repo-scaffold.md)
- [x] 1.2 catalog-api · 2026-10-21 · 803731c · [note](milestones/2026-10-21-1.2-catalog-api.md)
- [x] 1.3 search-service · 2026-10-22 · 99ca6da · [note](milestones/2026-10-22-1.3-search-service.md)
- [x] 1.4 Wire up + Compose · 2026-10-22 · a3e4e74 · [note](milestones/2026-10-22-1.4-wire-up-compose.md)
- [x] 1.5 Polish · 2026-10-22 · bdae727 · [note](milestones/2026-10-22-1.5-polish.md)

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
