# Part 3: Terraform (the AI writes and explains, I do the rest)

Estimated time: about 1 week.

How each module runs: `.claude/skills/teach-module/SKILL.md`. Cost safety: the Rules in `AGENTS.md`.

**T0. Concepts**
- **Learn:** providers, resources, data sources, state, `init`/`plan`/`apply`/`destroy`, HCL basics, the lock file.
- **Do:** install Terraform. With the Docker provider (`kreuzwerker/docker`), run a single Redis container from Terraform.
- **Done when:** I can explain what the state file holds, and what `plan` compares against what.

**T1. Language basics and drift**
- **Learn:** variables (with types and validation), outputs, locals, `.tfvars`, `count` vs `for_each`, `terraform fmt`/`validate`, drift.
- **Do:**
  - Parameterise the Docker example and create 3 containers with `for_each`.
  - Change one container by hand with the Docker CLI and watch `plan` detect the drift.
  - Practise `terraform state list`/`show`, and `import` for a container created outside Terraform.
- **Done when:** I can explain drift and import, and when to use `count` vs `for_each`.

**T2. Terraform builds my local platform**
- **Learn:**
  - Multiple providers
  - Provider configuration that depends on another resource (the cluster must exist before Kubernetes resources can be applied)
  - `depends_on`
- **Do:** in `terraform/local/`:
  - Create the kind cluster (the `tehcyx/kind` provider).
  - Create the namespace (the `kubernetes` provider).
  - Install Traefik and my `product-catalog` chart (the `helm` provider, v3 syntax).
- **Done when:** `terraform apply` from nothing gives a working app at `catalog.localhost`, and `terraform destroy` removes it all.

**T3. Modules and environments**
- **Learn:** modules (inputs and outputs), module sources, structuring a repo, workspaces vs separate folders per environment.
- **Do:**
  - Split into modules: `cluster`, `platform` (Traefik, metrics-server) and `app`.
  - Create `dev` and `staging` environments with different replicas and resources, on separate kind clusters.
- **Done when:** both environments come up from the same modules, and I can argue for workspaces or folders.

**T4. Remote state and locking**
- **Learn:** why local state is a problem for teams, remote backends, state locking.
- **Do:**
  - Run **MinIO** (S3-compatible, free) in Docker.
  - Move state to the S3 backend pointed at MinIO, with S3-native locking (`use_lockfile = true`).
  - Run two applies at once and watch the lock stop the second one.
- **Done when:** state lives in MinIO, and I can explain locking.

**T5. AWS (plan first, then a short real apply)**
- **Learn:**
  - The AWS provider, credentials and profiles
  - The community modules (`terraform-aws-modules/vpc` and `/eks`)
  - The cost model, and checking code with `tflint` and `trivy config` (or checkov)
- **Do (free part):** in `terraform/aws/`, write the AWS version:
  - VPC (2 availability zones, public and private subnets, one NAT gateway)
  - EKS with a small managed node group
  - ECR repositories
  - RDS Postgres (smallest instance)
  - ElastiCache Redis (smallest)
  - Amazon OpenSearch Service (smallest), or keep OpenSearch in the cluster to save money
  - Get it through `validate`, `tflint`, `trivy` and `plan`. `plan` needs AWS credentials but creates nothing.
- **Optional paid part (ask me first):**
  - Set up an **AWS Budgets alert** first.
  - Apply, push the images to ECR, deploy the Helm chart to EKS, take screenshots, then **destroy in the same session**.
  - Rough cost while running: about USD 0.30–0.60/hour (EKS control plane USD 0.10/hour, plus the NAT gateway, nodes and small databases). New-account AWS credits may cover it. Double-check pricing before applying.
- **LocalStack:** its free tier emulates S3, SQS, IAM and similar, but not EKS, RDS, ElastiCache or OpenSearch, and its licence terms have been changing. Use it only if a module adds S3 or SQS.
- **Done when:** the AWS code passes `plan` and the checks, and I can explain each part of the architecture and what it costs. If I did the paid part, it also ran on EKS and everything was destroyed afterwards (confirmed in the AWS console and in billing).
