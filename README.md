# Product Catalog

A two-service product catalogue (NestJS **catalog-api** + Go **search-service**, with PostgreSQL, Redis and OpenSearch), which I used to **learn Kubernetes and Terraform by deploying it**. It goes from Docker Compose to a local Kubernetes cluster, then to Helm, then to Terraform-managed dev and staging environments with remote state, and finally to Terraform code for AWS (VPC, EKS, RDS, ElastiCache, OpenSearch Service).

It's also a record of how I work with an AI coding assistant (Claude Code): what it wrote, what I decided and checked, and where it got things wrong.

## At a glance

- **Who I am:** a backend engineer (about 5.5 years: NestJS/TypeScript, Go, PostgreSQL, Redis, OpenSearch). Kubernetes and Terraform were new to me when I started.
- **Status: all milestones are done.**
  - The app (5 milestones).
  - Kubernetes on kind (8 modules, K0–K7), ending with a Helm chart.
  - Terraform (6 modules, T0–T5):
    - the whole local platform from one `terraform apply`
    - reusable modules for dev and staging
    - remote state with locking
    - the AWS platform: VPC, EKS, ECR, RDS, ElastiCache, OpenSearch Service, the AWS Load Balancer Controller and the app's deployment. All of it passes `terraform plan`, `tflint` and `trivy`, and comes with a step-by-step session runbook.
- **Who did what:**

  | Part | The AI (Claude Code) | Me |
  |---|---|---|
  | The app (Part 1) | Wrote the code, one planned milestone at a time | Wrote the spec, reviewed every milestone, and asked for the corrections listed in each note's "Review findings" |
  | Kubernetes K0–K3 | Tutored and reviewed | Wrote the manifests |
  | Kubernetes K4–K7, Terraform T0–T5 | Wrote the manifests, chart and Terraform, and explained every new term in them | Made the design decisions (the ADRs), ran every apply, install, upgrade and destroy, and debugged failures with it |

- **Proof:**
  - one note per milestone in [docs/milestones/](docs/milestones/)
  - 18 decision records in [docs/adr/](docs/adr/)
  - an experiment log of what the AI got right and wrong in [docs/ai-workflow.md](docs/ai-workflow.md)
  - a co-author trailer on every commit made with the AI

## Architecture

The app ([spec](docs/plan/app.md)):

```
                 client (curl / Swagger UI)
                          │
                          ▼
              ┌───────────────────────┐
              │ catalog-api (NestJS)  │──── PostgreSQL (source of truth)
              │ port 3000             │──── Redis (cache)
              └──────────┬────────────┘
                         │ HTTP (sync, internal only)
                         ▼
              ┌───────────────────────┐
              │ search-service (Go)   │──── OpenSearch (search index)
              │ port 8080             │
              └───────────────────────┘
```

- **catalog-api:** CRUD for products, cache-aside reads, search through search-service, and `POST /admin/reindex`. The reindex builds a new index while writes continue, then swaps an alias ([ADR-0007](docs/adr/0007-alias-swap-reindex-with-live-writes.md)).
- **search-service:** full-text search with filters, facets and sorting, and an index lifecycle that can't recreate a deleted product from a stale copy.
- Both services have health and readiness endpoints, structured logs and graceful shutdown.

Where it runs:

| Environment | How | Entry point |
|---|---|---|
| Compose | `docker-compose.yml` | http://localhost:3000 (Swagger at `/docs`) |
| kind **dev** | Terraform `terraform/envs/dev`: kind cluster, Traefik with Gateway API, metrics-server, the Helm chart | http://catalog.localhost |
| kind **staging** | Terraform `terraform/envs/staging`: the same modules, with an HPA (2–5 pods) and PDBs | http://catalog.staging.localhost:8090 |
| AWS | Terraform `terraform/aws/{bootstrap,infra,app}`: VPC, EKS, ECR, RDS, ElastiCache for Valkey, OpenSearch Service, AWS Load Balancer Controller | [docs/aws-architecture.md](docs/aws-architecture.md) |

On Kubernetes, requests go: Traefik (Gateway API `HTTPRoute`) → catalog-api → search-service. Database migrations and the 10,000-product seed run as Helm hooks ([ADR-0013](docs/adr/0013-migration-and-seed-as-helm-hooks.md)).

## Run it

Prerequisites: Windows 11 with Docker Desktop (WSL2, at least 8 GB). The commands are PowerShell, but they translate directly to other shells. Every command, with what to expect from it, is in [AGENTS.md](AGENTS.md) under "Commands".

**Docker Compose** (the fastest way to try the app):
```powershell
docker compose up --build -d          # all services healthy; `migrate` exits 0
Set-Location services/catalog-api
Copy-Item .env.example .env; npm ci  # the seed reads DATABASE_URL from .env
npm run seed                         # 10,000 products, then a reindex
curl.exe -s "http://localhost:3000/products/search?q=phone"
```

**Kubernetes on kind, with Terraform** (also needs kind, kubectl, Helm and Terraform):
1. Build the three images (`catalog-api:0.1.1`, `catalog-api-migrate:0.1.1`, `search-service:0.1.0`; AGENTS.md has the commands), then run `helm dependency build charts/product-catalog`.
2. Start the state backend, a MinIO server in its own Compose project (`terraform/state-backend/`; first-time setup in AGENTS.md).
3. `terraform -chdir=terraform/envs/dev init`, then `terraform -chdir=terraform/envs/dev apply`. About 10 minutes from nothing.
4. `curl.exe -s http://catalog.localhost/healthz`

**AWS:** `terraform/aws/infra` and `terraform/aws/app` plan without creating anything (they need an AWS profile). Applying them costs about USD 0.35/hour. The session runbook, including teardown and a leftover check, is in AGENTS.md.

Tests:
- catalog-api: `npm test` (unit), `npm run test:e2e` (against Compose Postgres and Redis).
- search-service: `go test ./...`, and `go test -tags integration ./...` (against Compose OpenSearch).

## Repository map

| Path | What |
|---|---|
| `services/catalog-api`, `services/search-service` | The two services, with their Dockerfiles and tests |
| `docker-compose.yml` | The local stack |
| `charts/product-catalog` | The Helm chart; values for dev, staging and AWS |
| `k8s/` | Values for the platform charts (Traefik, metrics-server) |
| `terraform/docker-basics` | T0–T1 playground (Docker provider, `for_each`, import, drift) |
| `terraform/modules`, `terraform/envs` | The cluster, platform and app modules; the dev and staging roots |
| `terraform/state-backend` | MinIO for remote state with S3-native locking |
| `terraform/aws` | The AWS roots: `bootstrap` (state bucket and budget), `infra`, `app` |
| `loadtest/` | k6 load test used for the HPA drills |
| `docs/` | Plans, status, milestone notes, ADRs, the AWS architecture, the AI workflow |
| `AGENTS.md`, `CLAUDE.md`, `.claude/` | The AI assistant's instructions, rules and skills |

## Design decisions

Each one is an ADR, with the options considered and the consequences.

| ADR | Decision |
|---|---|
| [0001](docs/adr/0001-two-services-synchronous-indexing.md) | Two services, synchronous indexing |
| [0002](docs/adr/0002-tiered-ai-context-system.md) | A tiered context system for the AI assistant |
| [0003](docs/adr/0003-prisma-as-orm.md) | Prisma as the ORM |
| [0004](docs/adr/0004-version-pins-nest12-prisma7-ts6.md) | Version pins: NestJS 12, Prisma 7, TypeScript 6 |
| [0005](docs/adr/0005-opensearch-go-v5.md) | search-service pins: opensearch-go v5, OpenSearch 3.9, Go 1.26 |
| [0006](docs/adr/0006-seed-ships-in-runtime-image.md) | The seed ships in the runtime image |
| [0007](docs/adr/0007-alias-swap-reindex-with-live-writes.md) | Alias-swap reindex that keeps taking writes |
| [0008](docs/adr/0008-k8s-naming-and-labels.md) | Kubernetes names and labels |
| [0009](docs/adr/0009-slim-migrate-image.md) | A slim image for migrations |
| [0010](docs/adr/0010-traefik-hostport-on-gateway-node.md) | Traffic into kind: Traefik on a host port |
| [0011](docs/adr/0011-requests-limits-policy.md) | Requests and limits: memory request = limit, CPU requests only |
| [0012](docs/adr/0012-helm-labels-and-selectors.md) | Labels and selectors under Helm |
| [0013](docs/adr/0013-migration-and-seed-as-helm-hooks.md) | Migration and seed as Helm hooks |
| [0014](docs/adr/0014-terraform-builds-the-local-platform.md) | Terraform builds the whole local platform |
| [0015](docs/adr/0015-terraform-modules-and-env-folders.md) | Modules, and one folder per environment |
| [0016](docs/adr/0016-remote-state-in-minio.md) | Remote state in MinIO with S3-native locking |
| [0017](docs/adr/0017-aws-account-state-and-managed-services.md) | AWS: SSO access, a bootstrapped state bucket, managed data services |
| [0018](docs/adr/0018-deploying-to-eks.md) | Deploying to EKS: a separate root, the AWS Load Balancer Controller, TLS to RDS |

## What I'd change in production

- **Delivery:** CI on every pull request (tests, lint, image builds, `terraform plan`, `tflint`, `trivy`), signed images pushed to a registry, and GitOps (for example Argo CD) instead of applying from a laptop.
- **Secrets:** External Secrets Operator syncing from AWS Secrets Manager, instead of Helm values (kind) or a runbook command (AWS).
- **Availability:** one NAT gateway per AZ, Multi-AZ RDS, ElastiCache with a replica, an OpenSearch domain with more than one node, and a PodDisruptionBudget and topology spread for every workload.
- **Security:** TLS at the edge (a domain and an ACM certificate), OpenSearch access signed with IAM or fine-grained access control, NetworkPolicies, Pod Security Admission, and a least-privilege role for Terraform instead of AdministratorAccess.
- **Observability:** metrics, logs and traces (Prometheus, Grafana, OpenTelemetry), with alerts on the readiness signals the services already expose.
- **The app:** Redis in catalog-api's readiness check, a self-healing search index after OpenSearch loses data, and search-service waiting for OpenSearch instead of crash-looping on a fresh install.

Each milestone note's "Follow-ups" section has the details.

## How the AI was used

- **Context:** the assistant worked from a small, layered context system: `AGENTS.md` (commands and rules), `docs/STATUS.md` (where we are), path-scoped rules, and two skills, one to run a learning module and one to close a milestone. [docs/ai-workflow.md](docs/ai-workflow.md) explains the design ([ADR-0002](docs/adr/0002-tiered-ai-context-system.md)) and keeps a per-milestone log of what helped and what went wrong.
- **What it wrote and what I did:** see "Who did what" above. After K3 I chose to have it write the infrastructure files, so I could finish the project first and study the files afterwards. I kept the decisions, and ran and checked everything myself.
- **Its mistakes are recorded too.** Each one is in the milestone notes and the experiment log, for example:
  - a claim written into a comment before checking the code
  - an untested command put into the docs
  - state locks left behind by its own verification commands
  - an RDS database name that AWS rejects

## License

[MIT](LICENSE)
