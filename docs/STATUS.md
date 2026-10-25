# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** Parts 1–3 and 5 done. **Part 5 closed 2026-10-25 with 5.4 Release:** README and `app.md` updated (50f9430), `v1.1.0` tagged on 50f9430 and `v1.0.0` on 245789e, both pushed with main (checked with `git ls-remote`). Public repo: https://github.com/AbanobNageh/product-catalog. **Running:** the Compose stack at 0.2.0 (seeded), MinIO (`catalog-state`), and the kind clusters **dev and staging at 0.2.0** (about 7 GiB; the user hasn't decided whether to keep them: `terraform destroy` in each env folder removes them). `terraform/aws/infra` and `app/` never applied; only `aws/bootstrap` exists (state bucket, budget).
- **Last session:** 2026-10-25. Closed 5.4 ([note](milestones/2026-10-25-5.4-release.md)): docs only; the clean clone of `v1.1.0` built, seeded and answered a keyed search with only Docker; the fresh reviewer's findings fixed before the commit. End-of-Part cuts applied: `.claude/rules/terraform-pitfalls.md` deleted, the AGENTS.md seed line reworded, a Part 5 line in "Who writes what". The 5.3 row of the experiment log was repaired (a heredoc had split it with a literal newline).
- **Next step:** nothing planned in this repo. Candidates, the user's call: (1) the separate agent repo (an MCP server and a tool-calling agent) that builds from `v1.1.0`; then add its link to the README; (2) the T5 paid AWS session once AWS lifts the restriction (see blockers), then an addendum to the T5 note and Cost Explorer for that day; (3) decide whether to keep or `terraform destroy` the dev and staging clusters; (4) [extras.md](plan/extras.md) (Part 4); (5) app follow-ups below.
  - Deferred Minors from 5.3 (in its note): class-level `@Public()` on HealthController, read-scope routes document an impossible 403, routes.spec walker gaps.
  - App follow-ups (the user's call): search-service crash-loops on a fresh install until OpenSearch is up; Redis in catalog-api's `/readyz`; no index self-heal after OpenSearch loses data.
  - From the [T4 note](milestones/2026-10-25-T4-remote-state-and-locking.md#follow-ups), the user's call: add the state backend's `ps` to the session routine. From the [T3 note](milestones/2026-10-25-T3-modules-and-environments.md#follow-ups): preload OpenSearch with `kind_load`, `atomic = true` on the release, and `--context` in the `AGENTS.md` session routine (user-owned).
  - How Part 5 worked (reuse for app work): the AI reads the code, asks the real decisions (AskUserQuestion), writes a Proposed ADR when there's a real choice and a plan file in `docs/milestones/` with a Review Focus; the user picks Native mode; the AI builds test-first and commits nothing until the close; a fresh Opus reviewer checks the whole uncommitted diff; findings re-graded by their effect and fixed (test-first for code); then `close-milestone`. The user's short approvals ("close it", "go ahead") have meant: commit (and accept the milestone's ADR).
  - Session gotchas (PowerShell 5.1): commit messages with double quotes break `git commit -m`, so use `git commit -F <file>`; never pipe a running `terraform` into `Select-Object -First` (AGENTS.md). `core.autocrlf` is true, so working copies are CRLF and git stores LF; edit with the Edit tool or Python with explicit bytes, not `Set-Content`/`Add-Content`. Shell heredocs mangle quotes and backslash escapes: write files with the Write/Edit tools or a Python script file. Prettier: some files aren't Prettier-formatted; check before running `--write`.
- **Open questions / blockers:** **T5 paid session blocked (2026-10-25):** the account's EC2 quota "Running On-Demand Standard instances" is **0 vCPUs**, and `request-service-quota-increase` returns AccessDenied. The user opened an Account and billing → Account Reinstatement case on 2026-10-25, citing the two older cases ("Account Suspension Warning", "Please review your AWS Account and credentials"); keep those open until AWS confirms. The partial `infra/` stack was destroyed the same day (only the bootstrap budget and bucket remain). Resume at runbook step 2 once `aws service-quotas get-service-quota --service-code ec2 --quota-code L-1216C47A --profile catalog-aws --query "Quota.Value"` is above 0.

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

### Part 3: Terraform ([plan](plan/terraform.md))
- [x] T0 Concepts · 2026-10-24 · 798968a · [note](milestones/2026-10-24-T0-concepts.md)
- [x] T1 Language basics and drift · 2026-10-25 · cbff8e5 · [note](milestones/2026-10-25-T1-language-basics-and-drift.md)
- [x] T2 Local platform with Terraform · 2026-10-25 · ce6a4a8 · [note](milestones/2026-10-25-T2-local-platform-with-terraform.md)
- [x] T3 Modules and environments · 2026-10-25 · a354f0d · [note](milestones/2026-10-25-T3-modules-and-environments.md)
- [x] T4 Remote state and locking · 2026-10-25 · c7aabcf · [note](milestones/2026-10-25-T4-remote-state-and-locking.md)
- [x] T5 AWS · 2026-10-25 · 91b6561 · [note](milestones/2026-10-25-T5-aws.md)

### Part 5: agent-ready API ([plan](plan/agent-ready-api.md))
- [x] 5.1 Stock filter and sort in search · 2026-10-25 · 1d8f3c8 · [note](milestones/2026-10-25-5.1-stock-filter-and-sort-in-search.md)
- [x] 5.2 Optimistic concurrency (`If-Match`) · 2026-10-25 · 410fcab · [note](milestones/2026-10-25-5.2-optimistic-concurrency-if-match.md)
- [x] 5.3 API keys with scopes · 2026-10-25 · 4176754 · [note](milestones/2026-10-25-5.3-api-keys-with-scopes.md)
- [x] 5.4 Release · 2026-10-25 · 50f9430 · [note](milestones/2026-10-25-5.4-release.md)
