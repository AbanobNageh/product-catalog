# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** 1.5 Polish (building on branch `1.5-polish`: Tasks 1–7 done and reviewed; final-review fixes in progress; then the live Done-when checks and close).
- **Last session:** 2026-10-22. Closed 1.4 Wire up + Compose (a3e4e74, [note](milestones/2026-10-22-1.4-wire-up-compose.md)). ADR-0006 accepted.
- **Next step:** finish the final-review fix wave, then run Task 8 (the live Done-when checks) and `close-milestone`. The plan is [here](milestones/2026-10-22-1.5-plan.md), executed subagent-driven.
  - [ADR-0007](adr/0007-alias-swap-reindex-with-live-writes.md) (alias-swap reindex with live writes) is approved as the design. It stays Proposed until the close.
  - The plan edits are applied (uncommitted):
    - `app.md`: 1.5's new scope and "Done when", plus the new endpoints
    - `extras.md`: the alias swap moved to 1.5
    - `kubernetes.md` K4: the auto-create setting
    - `PLAN.md`: the README is the last step of the whole project
- **1.5 scope (agreed):**
  - The alias-swap reindex, including versioned deletes and the `action.auto_create_index` guard.
  - Images tagged `0.1.0`.
  - The deferred review minors from the [1.4 note](milestones/2026-10-22-1.4-wire-up-compose.md#follow-ups).
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
