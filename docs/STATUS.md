# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** 1.1 Repo scaffold. Context system, docs split, ADRs 0001–0003, README skeleton and `.gitignore` drafted.
- **Last session:** 2026-10-21 (no commits yet)
- **Next step:** ADR-0001 accepted (option 2 now, option 3 in Part 4). First commit → close 1.1.
- **Open questions / blockers:** none

## Checklist
### Part 1: the app ([plan](plan/app.md))
- [ ] 1.1 Repo scaffold
- [ ] 1.2 catalog-api
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
