# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** 1.4 Wire up + Compose (not started).
- **Last session:** 2026-10-22. Closed 1.3 search-service (99ca6da, [note](milestones/2026-10-22-1.3-search-service.md)). ADR-0005 accepted.
- **Next step:** plan 1.4.
  - Replace catalog-api's search stubs with HTTP clients: 2s timeout on single calls, ≥ 10s for reindex bulk; network errors, timeouts and 5xx → `SearchUnavailableError`.
  - Reindex reports the `failed` ids from search-service.
  - The catalog-api search DTO also caps `q` (200), `page × size` (10,000) and `minPrice ≤ maxPrice`.
  - Full Compose with both services, healthchecks and `depends_on`, plus the seed script.
  - Follow-ups are in the [1.3 note](milestones/2026-10-22-1.3-search-service.md#follow-ups) and the [1.2 note](milestones/2026-10-21-1.2-catalog-api.md#follow-ups).
- **Open questions / blockers:** none.

## Checklist
### Part 1: the app ([plan](plan/app.md))
- [x] 1.1 Repo scaffold · 2026-10-21 · b7ada79 · [note](milestones/2026-10-21-1.1-repo-scaffold.md)
- [x] 1.2 catalog-api · 2026-10-21 · 803731c · [note](milestones/2026-10-21-1.2-catalog-api.md)
- [x] 1.3 search-service · 2026-10-22 · 99ca6da · [note](milestones/2026-10-22-1.3-search-service.md)
- [ ] 1.4 Wire up + Compose
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
