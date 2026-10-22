# AGENTS.md: Product Catalog

Instructions for any AI coding assistant working in this repo. This file is loaded every session, so it stays short. Detail lives in `docs/` and is read when needed. How this context system works: `docs/ai-workflow.md`.

## Overview
A two-service product catalogue (NestJS `catalog-api` + Go `search-service`, with PostgreSQL, Redis and OpenSearch), built to **learn Kubernetes and Terraform** by deploying it. It is also a portfolio piece that shows how I work with an AI assistant. Roadmap: `PLAN.md`. Current state: `docs/STATUS.md`. App spec: `docs/plan/app.md`.

## The learner
- Backend engineer, about 5.5 years. Strong in NestJS/TypeScript, Go, PostgreSQL, Redis and OpenSearch, so skip the basics there.
- **New to Kubernetes and Terraform.** A little AWS (ECS services, IAM task roles through Terraform someone else wrote, S3). Pitch explanations at this level.

## Setup
- Host: Windows 11, Docker Desktop (WSL2). Give **PowerShell** commands.
- Installed: Docker 29.8, kubectl 1.36 (includes Kustomize), Go 1.26, Node 24, minikube 1.39 (unused; this project uses kind).
- Install when the module starts: kind (`winget install Kubernetes.kind`), Helm (`winget install Helm.Helm`), Terraform (`winget install Hashicorp.Terraform`). Optional: k9s (`winget install Derailed.k9s`), `hey` or k6.
- **Docker Desktop memory:** WSL2 needs at least 8 GB (in `.wslconfig`).
- **OpenSearch** 2.12+ needs `OPENSEARCH_INITIAL_ADMIN_PASSWORD`, or `DISABLE_SECURITY_PLUGIN=true` (fine locally). Use `discovery.type=single-node` and a 512 MB JVM heap. If it complains about `vm.max_map_count`: `wsl -d docker-desktop sysctl -w vm.max_map_count=262144`.

## Commands
_Added as each service is built (milestones 1.2–1.4): install, run, test, migrate, seed._

Infrastructure (repo root):
- Start Postgres + Redis: `docker compose up -d postgres redis`. Check: `docker compose ps` (both `healthy`)
- Stop: `docker compose stop`. (`docker compose down -v` also deletes the Postgres volume, so ask first)

catalog-api (`services/catalog-api`):
- Install: `npm ci`. Approved install scripts are pinned in `package.json` `allowScripts` (npm 11)
- Local env: `Copy-Item .env.example .env`
- Run (watch): `npm run start:dev`. Swagger at http://localhost:3000/docs
- Unit tests: `npm test`. It runs Jest with `--experimental-vm-modules`, because Nest 12 packages are ESM-only (ADR-0004)
- e2e test: `npm run test:e2e`. Needs Compose Postgres + Redis. It uses database `catalog_test` (it refuses any name not ending in `_test`) and Redis DB 1, applies migrations, and never resets or truncates
- Lint / format: `npm run lint` (oxlint, type-aware) / `npm run format` (prettier). The `unbound-method` warnings in `*.spec.ts` are Jest-mock false positives
- Build: `npm run build`. This runs `prisma generate` first; the client goes to `src/generated/` (git-ignored)
- Migrate (apply committed migrations): `npm run migrate` (`prisma migrate deploy`). Never run at app startup
- New migration after a schema change: `npm run migrate:dev -- --name <change>`. Prisma 7 doesn't regenerate the client here, so run `npm run prisma:generate` after
- Image (from the repo root): `docker build -t catalog-api:dev services/catalog-api`. Run it on the Compose network: `docker run --rm --network product-catalog_default -p 3000:3000 -e DATABASE_URL=postgresql://catalog:catalog@postgres:5432/catalog -e REDIS_URL=redis://redis:6379/0 catalog-api:dev`
- Prisma's update notice suggests `prisma@latest`. Ignore it: that tag is an 8.0 RC, and we stay pinned to 7.10.1 (ADR-0004)

search-service (`services/search-service`):
- Start OpenSearch: `docker compose up -d opensearch` (from the repo root). It takes about 30s to become `healthy`. The performance-analyzer `ERROR` lines in its log are harmless. The image is pinned to `3.9.0`: `latest` is the 2.19 line (ADR-0005)
- Run: `go run ./cmd/search-service`. Env: `PORT` (8080), `OPENSEARCH_URL` (`http://localhost:9200`), `LOG_LEVEL` (`info`). The defaults suit a native run, so no env file is needed. Example: `$env:LOG_LEVEL='debug'; go run ./cmd/search-service`
- Unit tests: `go test ./...`
- Integration tests: `go test -tags integration ./...`. Needs Compose OpenSearch. Each test uses its own throwaway `it-<random>` index and deletes it afterwards; `products-v1` is never touched
- Vet / format: `go vet ./...` / `gofmt -l .` (prints nothing when clean; `gofmt -w .` fixes)
- Load the sample data (30 products). The `@` path is relative, so change directory first: `Set-Location D:\Projects\product-catalog\services\search-service; curl.exe -s -X POST localhost:8080/products/_bulk -H "Content-Type: application/json" --data-binary "@testdata/sample-products.json"`
- Try a search: `curl.exe -s "localhost:8080/search?q=phone&category=electronics&minPrice=10000&inStock=true&sort=price_asc"`
- Image (from the repo root): `docker build -t search-service:dev services/search-service`. Run it on the Compose network: `docker run --rm --network product-catalog_default -p 8080:8080 -e OPENSEARCH_URL=http://opensearch:9200 search-service:dev`

## Who writes what
- **Part 1, the app (`services/`, `docker-compose.yml`):** the AI writes the code, one milestone at a time, and stops at each milestone's "Done when" check for my review. At the end of each milestone it gives a short tour (files, key decisions) I could repeat in an interview.
- **Parts 2–3, Kubernetes and Terraform (`k8s/`, `charts/`, `terraform/`):** I write every manifest, chart and HCL file. The AI teaches, hints, reviews and quizzes, following `.claude/skills/teach-module/SKILL.md`. It never writes the solution unless I ask for it.

## Rules
- One milestone or module at a time. No scope beyond the plan without asking.
- Prefer official docs (kubernetes.io, helm.sh, developer.hashicorp.com, opensearch.org) and current versions. Warn me when a common tutorial approach is outdated.
- **Never run anything that costs money** (for example `terraform apply` against real AWS) or **deletes my data or clusters** without my go-ahead in that moment.
- When something breaks, teach me to debug it (`describe`, `logs`, events) rather than just fixing it.
- Don't guess at gaps in the spec. Write `[NEEDS CLARIFICATION: ...]` and ask.
- A real decision (a choice between alternatives someone might question) gets a proposed ADR in `docs/adr/`.

## Session routine
- **Start:** `docs/STATUS.md` is already in context. Run `git log --oneline -10` and read the current milestone's section in `docs/plan/`. Then restate in 3 lines or fewer: current milestone, last thing done, next step. If something is already built or running, smoke-check it before new work (`docker compose ps`, the tests, `kubectl get pods -n catalog`).
- **During:** keep the "Now" block of `docs/STATUS.md` current when the next step changes.
- **At a "Done when" check:** follow `.claude/skills/close-milestone/SKILL.md`.

## Where things live
| Path | What | Owner and edit rule |
|---|---|---|
| `AGENTS.md`, `CLAUDE.md`, `.claude/`, `PLAN.md`, `docs/plan/` | Instructions, roadmap, spec | Me. The AI proposes changes and applies them only after I approve. Exception: the AI fills in **Commands** above as it builds each service |
| `docs/STATUS.md` | Current state and checklist | The AI. Rewrite "Now"; the checklist is tick-only |
| `docs/milestones/` | One note per finished milestone or module (plus any milestone plans) | The AI writes; frozen once committed |
| `docs/adr/` | Architecture decision records | Append-only. A changed decision gets a new ADR that supersedes the old one |
| `docs/research/` | Research behind decisions | Frozen |
| `docs/ai-workflow.md` | How this context system works, plus the experiment log | The AI drafts and appends to the log; I approve |
| `LEARNING-NOTES.md` | My notes, in my own words | Me only. The AI may remind me, never edits it |
