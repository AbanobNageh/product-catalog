# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** 1.3 search-service (not started).
- **Last session:** 2026-10-21. Closed 1.2 catalog-api (803731c, [note](milestones/2026-10-21-1.2-catalog-api.md)).
- **Next step:** plan 1.3. Go 1.26 `net/http` + `opensearch-go` v4 + OpenSearch in Compose. Implement the `SearchResult` contract from `services/catalog-api/src/search/search.ports.ts`. Include the 1.2 follow-ups: index versioning on `updatedAt` and `refresh=wait_for` on single upserts.
- **Open questions / blockers:** confirm with `/memory` that `.claude/rules/services.md` loads (not observed in 1.2).

## Checklist
### Part 1: the app ([plan](plan/app.md))
- [x] 1.1 Repo scaffold · 2026-10-21 · b7ada79 · [note](milestones/2026-10-21-1.1-repo-scaffold.md)
- [x] 1.2 catalog-api · 2026-10-21 · 803731c · [note](milestones/2026-10-21-1.2-catalog-api.md)
- [ ] 1.3 search-service
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
