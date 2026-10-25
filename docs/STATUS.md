# Status

> Edit rules: the AI rewrites **Now** whenever the next step changes. The **Checklist** is tick-only: change `[ ]` to `[x]` and append `· date · commit · note link`. Never reword, reorder or delete items without asking.

## Now
- **Current:** Parts 1–3 done; T5 closed without its optional paid part (blocked on AWS: see blockers). Pre-publication work done on 2026-10-25: a security audit (gitleaks over all history: 0 findings; no state, tfvars, `.env`, kubeconfig or key ever committed; no IP, case ID, local path or hostname in any commit), ADRs 0015–0018 accepted, the old branch `backup/before-quiz-removal` deleted, an MIT `LICENSE`, and the README rewritten (recruiters' part, who did what, AWS not deployed). Public by design: the AWS account ID (ADR-0017), the Gmail address as commit author (the user's choice), the GitHub username in the Go module path. Nothing is running: dev and staging were destroyed (`terraform destroy`, 2026-10-25; MinIO keeps their empty states), `terraform/aws/infra` and `app/` were never applied, and only `aws/bootstrap` exists (state bucket, budget). Rebuild dev or staging with `terraform apply` in its folder, one at a time (~10 min each), after building the images and starting MinIO.
- **Last session:** 2026-10-25. Closed T5 AWS (91b6561, [note](milestones/2026-10-25-T5-aws.md)). The user set up IAM Identity Center (profile `catalog-aws`), made 16 design choices (ADR-0017, ADR-0018), applied `bootstrap/` and migrated its state into its own bucket. The AI wrote `bootstrap/`, `infra/`, `app/`, chart 0.2.0 with AWS switches, module switches with `moved` blocks (dev and staging applied, "No changes"), docs/aws-architecture.md and the session runbook; all free checks pass. The paid session's first `infra/` apply failed: RDS rejected the name `catalog` (fixed) and the account's EC2 quota is 0 vCPUs (account restriction); the user destroyed the partial stack, verified gone. Explain-back skipped.
- **Next step:** the user creates the GitHub repository (the Go module path assumes `github.com/AbanobNageh/product-catalog`), sets its About description and topics, and pushes `main`. Then, from the [T5 note](milestones/2026-10-25-T5-aws.md#follow-ups): the paid session once AWS lifts the restriction (record it as an addendum and update the README's AWS line), and Cost Explorer for 2026-10-25. After that, the study phase: `docs/learning/progress.md` has a Revisit list and saved questions for K5–T5.
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
