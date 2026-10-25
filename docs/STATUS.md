# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** Part 5 in progress: 5.4 Release next (5.1, 5.2 and 5.3 closed 2026-10-25). Parts 1–3 done and published at https://github.com/AbanobNageh/product-catalog. **Running:** the Compose stack at 0.2.0 (seeded), MinIO (`catalog-state`), and the kind clusters **dev and staging at 0.2.0** (about 7 GiB; the user hasn't decided whether to keep them: `terraform destroy` in each env folder removes them). `terraform/aws/infra` and `app/` never applied; only `aws/bootstrap` exists (state bucket, budget).
- **Last session:** 2026-10-25. Closed 5.3 API keys with scopes (f1bc8c8, 4176754, [note](milestones/2026-10-25-5.3-api-keys-with-scopes.md); [ADR-0020](adr/0020-api-keys-with-scopes.md) accepted): global guard with `read` < `write` < `admin`, keys from env/Secret, Terraform generates them (`terraform -chdir=terraform/envs/<env> output -raw read_api_key`), every client keyed; the 5.1 integer-param fixes; release 0.2.0 / chart 0.3.0 (moved here from 5.4 by the user); dev upgraded 0.1.1 → 0.2.0 (migration hook before rollout), staging at 0.2.0, k6 100%. Before that: 5.1 (stock filter/sort) and 5.2 (`If-Match`, ADR-0019). Nothing pushed since 8851dc4 (the Part 5 commits are local).
- **Next step:** Part 5 ([plan](plan/agent-ready-api.md); the AI builds, the user reviews, as in Part 1; per milestone: a plan file in `docs/milestones/`, a test-first build, then the `close-milestone` skill with the tour and the user's review). **Now: start 5.4 Release** ([plan](plan/agent-ready-api.md#54-release); versions already done in 5.3). Per milestone: a plan file in `docs/milestones/`, then build, then `close-milestone`. 5.4 scope: (1) `docs/plan/app.md` endpoint tables (user-owned: propose the text) — new search params `maxStock` and `sort=stock_asc`, `version`/`ETag`/`If-Match`/412, the scopes and 401/403, remove "No auth"; (2) README: status Part 5 done, scopes and the `If-Match` rule in the architecture section, the quick start with keys (`.env.example` dev keys; `npm run seed` needs `CATALOG_API_KEY`; curl with `-H "Authorization: Bearer …"`) and `0.2.0` image tags (Kubernetes section still says 0.1.1/0.1.0), the ADR table (+0019, +0020; "18 decision records" → 20), the "what I'd change in production" list (remove what Part 5 fixed), a link to the agent repo once it exists; (3) AGENTS.md "Commands" keys already done in 5.3; (4) tag `v1.1.0` and push both tags (and main) — **pushing needs the user's yes**; (5) Done when: from a clean clone of `v1.1.0`, `docker compose up --build`, seed, and a keyed search work. `v1.0.0` is tagged locally on 245789e (push it at 5.4 with `v1.1.0`). Baseline after 5.3: Go unit + integration ok, catalog-api 271 unit tests, e2e 9/9. Still pending from T5: the paid AWS session once AWS lifts the restriction (addendum to the T5 note), and Cost Explorer for 2026-10-25.
  - Noted for later Part 5 milestones (from reading the code at the 5.1 start): **5.2:** catalog-api already sends search-service a `version` that is the *milliseconds timestamp* for versioned deletes (`SearchIndexer.remove(id, version)`, ADR-0007). The new product `version` counter is different; propose in ADR-0019 to keep the search side unchanged and rename the existing parameter in catalog-api's code (for example `indexVersion`) so the two can't be confused. **5.4:** the T5 session runbook (step 4 image tags `0.1.1`/`0.1.0`) and `values-aws.yaml` need the 0.2.0 tags; `terraform/aws/app` gets the API-key Secret in 5.3.
  - Session gotchas (PowerShell 5.1): commit messages with double quotes break `git commit -m`, so write the message to a file and use `git commit -F <file>`; never pipe a running `terraform` into `Select-Object -First` (AGENTS.md). Edit files with LF/CRLF intact (the Edit tool, or Python with explicit bytes), not `Set-Content`/`Add-Content`.
  - From the [T4 note](milestones/2026-10-25-T4-remote-state-and-locking.md#follow-ups), the user's call: add the state backend's `ps` to the session routine. (The local `terraform.tfstate` and `.backup` files in both env folders were deleted on 2026-10-25 after the close; `plan` still "No changes".)
  - From the [T3 note](milestones/2026-10-25-T3-modules-and-environments.md#follow-ups), the user's call: preload OpenSearch with `kind_load` to speed up first builds, `atomic = true` on the release to avoid orphaned failed installs, and adding `--context` to the `AGENTS.md` session routine (user-owned).
  - For Part 3, from the [K7 note](milestones/2026-10-24-K7-helm.md#follow-ups): T5 uses `opensearch.enabled: false` + `searchService.opensearchUrl` for a managed OpenSearch (Postgres needs the same switch for RDS), re-sizes requests on real nodes, and must restrict `POST /admin/reindex` before the app gets a public URL.
  - App follow-ups (the user's call): search-service crash-loops on a fresh install until OpenSearch is up; Redis in catalog-api's `/readyz`; no index self-heal after OpenSearch loses data.
- **Open questions / blockers:** **T5 paid session blocked (2026-10-25):** the first `infra/` apply failed on two counts. (1) RDS rejected the DB name `catalog` ("a reserved word for this engine"): fixed to `product_catalog` (output `postgres_database`, runbook step 5 reads it; 91b6561). (2) The node group couldn't launch: the account's EC2 quota "Running On-Demand Standard instances" is **0 vCPUs**, and `request-service-quota-increase` returns AccessDenied ("contact AWS Support"). The account has two older AWS cases ("Account Suspension Warning", "Please review your AWS Account and credentials", both "Customer action completed", no reply after 7 and 22 days), which most likely explain the restriction. The user opened an Account and billing → Account Reinstatement case (web) on 2026-10-25 citing both; the old cases stay open (don't resolve them) until AWS confirms. The partial `infra/` stack was destroyed the same day (state empty, everything verified gone with direct EC2/EKS/RDS/ElastiCache/OpenSearch/ECR/IAM checks; only the bootstrap budget and bucket remain). Resume at runbook step 2 once `aws service-quotas get-service-quota --service-code ec2 --quota-code L-1216C47A --profile catalog-aws --query "Quota.Value"` is above 0.

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
- [ ] 5.4 Release
