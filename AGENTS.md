# AGENTS.md: Product Catalog

Instructions for any AI coding assistant working in this repo. This file is loaded every session, so it stays short. Detail lives in `docs/` and is read when needed. How this context system works: `docs/ai-workflow.md`.

## Overview
A two-service product catalogue (NestJS `catalog-api` + Go `search-service`, with PostgreSQL, Redis and OpenSearch), built to **learn Kubernetes and Terraform** by deploying it. It is also a portfolio piece that shows how I work with an AI assistant. Roadmap: `PLAN.md`. Current state: `docs/STATUS.md`. App spec: `docs/plan/app.md`.

## The learner
- Backend engineer, about 5.5 years. Strong in NestJS/TypeScript, Go, PostgreSQL, Redis and OpenSearch, so skip the basics there.
- **New to Kubernetes and Terraform.** Assume no K8s/Terraform vocabulary: define every term on first use. A little AWS (ECS services, IAM task roles through Terraform someone else wrote, S3). Pitch explanations at this level.

## Setup
- Host: Windows 11, Docker Desktop (WSL2). Give **PowerShell** commands.
- Installed: Docker 29.8, kubectl 1.36 (includes Kustomize), kind 0.33, Helm 4.3.1, Terraform 1.16.6 (winget), k6, Go 1.26, Node 24.
- Optional: k9s (`winget install Derailed.k9s`).
- **Docker Desktop memory:** WSL2 needs at least 8 GB (in `.wslconfig`).

## Commands

Infrastructure (repo root):
- Full stack: `docker compose up --build -d`. Check: `docker compose ps -a` (all `healthy`; `migrate` shows `Exited (0)`, because it applies migrations and exits). catalog-api is on http://localhost:3000. search-service has **no host port** (internal only), so test it through catalog-api, or run it natively
- Logs: `docker compose logs -f catalog-api search-service`. Stop one service, for example to test the outage path: `docker compose stop search-service` (start it again with `docker compose start search-service`)
- Optional OpenSearch Dashboards: `docker compose --profile dashboards up -d`, then http://localhost:5601
- Start Postgres + Redis only: `docker compose up -d postgres redis`. Check: `docker compose ps` (both `healthy`)
- Stop: `docker compose stop`. (`docker compose down -v` also deletes the Postgres volume, so ask first)

catalog-api (`services/catalog-api`):
- Install: `npm ci`. Approved install scripts are pinned in `package.json` `allowScripts` (npm 11)
- Local env: `Copy-Item .env.example .env`
- Run (watch): `npm run start:dev`. Swagger at http://localhost:3000/docs. It listens on port 3000, so it clashes with Compose's catalog-api: run `docker compose stop catalog-api` first
- Unit tests: `npm test`. It runs Jest with `--experimental-vm-modules`, because Nest 12 packages are ESM-only (ADR-0004)
- e2e test: `npm run test:e2e`. Needs Compose Postgres + Redis. It uses database `catalog_test` (it refuses any name not ending in `_test`) and Redis DB 1, applies migrations, and never resets or truncates
- Lint / format: `npm run lint` (oxlint, type-aware) / `npm run format` (prettier). The `unbound-method` warnings in `*.spec.ts` are Jest-mock false positives
- Build: `npm run build`. This runs `prisma generate` first; the client goes to `src/generated/` (git-ignored)
- Migrate (apply committed migrations): `npm run migrate` (`prisma migrate deploy`). Never run at app startup
- New migration after a schema change: `npm run migrate:dev -- --name <change>`. Prisma 7 doesn't regenerate the client here, so run `npm run prisma:generate` after
- Image (from the repo root): `docker build -t catalog-api:0.1.0 services/catalog-api`. Run it on the Compose network: `docker run --rm --network product-catalog_default -p 3000:3000 -e DATABASE_URL=postgresql://catalog:catalog@postgres:5432/catalog -e REDIS_URL=redis://redis:6379/0 -e SEARCH_SERVICE_URL=http://search-service:8080 catalog-api:0.1.0`
- Migration image (from the repo root): `docker build --target migrate -t catalog-api-migrate:0.1.0 services/catalog-api`. Prisma CLI, schema and migrations only (ADR-0009); its default command is `prisma migrate deploy`. Build it from the same commit as the app image, with the same tag. The version in `package.json` is what `/healthz` reports, so it must match the image tag
- Seed 10,000 products, then reindex: `npm run seed`. It needs the full Compose stack up (catalog-api on :3000). Re-running it is safe: the fixed `SEED-00001…` SKUs are skipped. Env: `DATABASE_URL` (from `.env`) and `CATALOG_API_URL` (default `http://localhost:3000`). It exits 1 if catalog-api is unreachable, or the reindex fails, reports `failed` items or doesn't swap
- Seed from inside Compose, the way a K2 Job will run it: `docker compose run --rm -e CATALOG_API_URL=http://catalog-api:3000 catalog-api node dist/seed/main.js`
- Prisma's update notice suggests `prisma@latest`. Ignore it: that tag is an 8.0 RC, and we stay pinned to 7.10.1 (ADR-0004)

search-service (`services/search-service`):
- Start OpenSearch: `docker compose up -d opensearch` (from the repo root). It takes about 30s to become `healthy`. The performance-analyzer `ERROR` lines in its log are harmless.
- Run: `go run ./cmd/search-service`. Env: `PORT` (8080), `OPENSEARCH_URL` (`http://localhost:9200`), `LOG_LEVEL` (`info`). The defaults suit a native run, so no env file is needed. Example: `$env:LOG_LEVEL='debug'; go run ./cmd/search-service`. **On this machine, port 8080 is taken by another app**, so run natively with `$env:PORT='8081'`, and use 8081 in the curl examples below and in catalog-api's `.env` `SEARCH_SERVICE_URL`. Compose isn't affected (no host port)
- Run natively against an OpenSearch other than the Compose one: it must be started with `action.auto_create_index: "-products*,+*"` (Compose sets it), or search-service refuses to start
- Unit tests: `go test ./...`
- Integration tests: `go test -tags integration ./...`. Needs Compose OpenSearch. Each test uses its own throwaway `products-it-<hex>` index and deletes it afterwards; `products-v1` is never touched
- Vet / format: `go vet ./...` / `gofmt -l .` (prints nothing when clean; `gofmt -w .` fixes)
- Load the sample data (30 products). The `@` path is relative, so change directory first: `Set-Location D:\Projects\product-catalog\services\search-service; curl.exe -s -X POST localhost:8080/products/_bulk -H "Content-Type: application/json" --data-binary "@testdata/sample-products.json"`
- Try a search: `curl.exe -s "localhost:8080/search?q=phone&category=electronics&minPrice=10000&inStock=true&sort=price_asc"`
- Image (from the repo root): `docker build -t search-service:0.1.0 services/search-service`. Run it on the Compose network: `docker run --rm --network product-catalog_default -p 8080:8080 -e OPENSEARCH_URL=http://opensearch:9200 search-service:0.1.0`

Cluster, platform and app: built by Terraform in `terraform/local` (ADR-0014). Run from that folder:
- Before the first apply: our three images must exist locally (`catalog-api:<v>`, `catalog-api-migrate:<v>`, `search-service:<v>`; see the image commands above), and after a fresh clone, restore the chart's OpenSearch subchart from the repo root: `helm dependency build charts/product-catalog` (`helm dependency update` only to change its version)
- Build everything: `terraform init` (first run, and after a provider change), `terraform plan` (from nothing: `9 to add`), `terraform apply`. About 10 minutes from nothing; each node pulls the OpenSearch image itself (1.2 GB). It creates the kind cluster `catalog` (context `kind-catalog`, 1 control-plane and 2 workers), loads our images, applies the Gateway API CRDs v1.6.3, installs Traefik 42.1.3 (with our Gateway), metrics-server 3.14.0, the `catalog` namespace and the `product-catalog` release
- Remove everything: `terraform destroy`. It deletes the cluster and its data, so ask first. Don't use `kind delete cluster` for this cluster: Terraform still thinks it exists
- Terraform owns the releases: a hand `helm upgrade`/`helm rollback` or `kubectl apply` is drift that the next `apply` undoes. Change the values files (`k8s/traefik/values.yaml`, `k8s/metrics-server/values.yaml`, `charts/product-catalog/values-dev.yaml`) or `variables.tf`, then `terraform plan` and `terraform apply`
- Any change to `kind_cluster` (nodes, port mappings, node image) destroys and recreates the cluster. `127.0.0.1:80/443` go to `catalog-worker` (labelled `catalog/role=gateway-node`)
- The API server is pinned to `127.0.0.1:6443` (`api_server_port`). kind's random port can land in a range Windows reserves at boot (`netsh interface ipv4 show excludedportrange protocol=tcp`); then kubectl gets "connection refused" while the app still answers
- Release catalog-api `<v>`: build both images from the same commit (see catalog-api above), set `catalog_api_version` to `<v>` in `variables.tf`, then `terraform apply`: `kind_load` loads the new images, and the release upgrade runs the pre-upgrade migration hook before the rollout. search-service: `search_service_version`. A one-off `terraform apply "-var=catalog_api_version=<v>"` (quoted, PowerShell 5.1) also works, but the next apply without it rolls back. Roll back the same way: the previous version, then apply. No migration is undone
- Read-only Helm still works: `helm list -A`, `helm history product-catalog -n catalog`, `helm get values product-catalog -n catalog --revision <n>` (`--all` for the merged values)
- Render the chart without touching the cluster (repo root): `helm template product-catalog charts/product-catalog -n catalog -f charts/product-catalog/values-dev.yaml` (add `-s templates/<path>` for one file). Lint: `helm lint charts/product-catalog -f charts/product-catalog/values-dev.yaml --strict`
- After a reboot: start Docker Desktop first. The kind nodes restart with it, and the pods come back within a minute or two (search-service restarts a couple of times while OpenSearch boots)

App checks and operations (release `product-catalog` in namespace `catalog`; ADR-0012, ADR-0013):
- Hook logs: `kubectl logs job/catalog-api-migrate -n catalog`, `kubectl logs job/catalog-api-seed -n catalog`. `helm uninstall` leaves these Jobs behind
- Check: `kubectl get pods,hpa,pdb -n catalog`, `kubectl get gateway -n traefik` (`PROGRAMMED True`), `kubectl top nodes`, `curl.exe -s http://catalog.localhost/healthz`, `curl.exe -s "http://catalog.localhost/products/search?q=phone"`. Plain `localhost` returns 404 (no route for that Host)
- Check OpenSearch: `kubectl exec -n catalog search-service-opensearch-0 -- curl -s "localhost:9200/_cat/indices/products*?v"`
- Reseed (re-running is safe; a Job's template is immutable, so delete it first): `kubectl delete job catalog-api-seed -n catalog --ignore-not-found`, `helm template product-catalog charts/product-catalog -n catalog -f charts/product-catalog/values-dev.yaml -s templates/catalog-api/seed-job.yaml | kubectl apply -f -`, then `kubectl wait --for=condition=complete job/catalog-api-seed -n catalog --timeout=10m`
- Requests and limits follow ADR-0011 (memory request = limit, CPU request only) and live in `values.yaml`. A container's real memory: `kubectl exec <pod> -n catalog -- cat /sys/fs/cgroup/memory.stat` (`anon` can't be reclaimed)
- The HPA owns catalog-api's replica count: the Deployment template leaves `replicas` out while `catalogApi.autoscaling.enabled` is true
- Load test (k6: `winget install k6 --source winget`): `k6 run loadtest/catalog-api.js` (50 VUs, 5½ min). Watch with `kubectl get hpa catalog-api -n catalog -w`; it scales back down 5 min after the load ends

Terraform (run each command from the config's folder, or pass `-chdir=<folder>`). After `winget install Hashicorp.Terraform`, open a new terminal so `terraform` is on the PATH. winget lags behind upstream, so ignore the "out of date" notice:
- `terraform/docker-basics` (T0–T1, Docker provider, no cluster needed): first `Copy-Item terraform.tfvars.example terraform.tfvars` (git-ignored; `containers` has no default). Then `terraform init` (first run, and after a provider change; it fills `.terraform/` and writes the committed `.terraform.lock.hcl`), `terraform plan`, `terraform apply` (type `yes`), `terraform destroy`. It runs `tf-redis-cache`, `-sessions` and `-queue` on `127.0.0.1:6380`–`6382` (one per `containers` entry, via `for_each`) plus `tf-redis-legacy` on 6383 (imported in T1). Compose's Redis keeps 6379. Check: `terraform output`, `docker exec tf-redis-cache redis-cli ping`
- `terraform/local` (T2, kind + kubernetes + helm providers): the cluster, platform and app. See "Cluster, platform and app" above
- Drift: `terraform plan -refresh-only` shows what changed outside Terraform without proposing fixes; plain `plan` proposes the fixes and `apply` reverts them
- PowerShell 5.1 quoting: quote arguments with `=` and a dot (`"-var-file=dev.tfvars"`, `"-out=t1.tfplan"`), or Terraform reports "Too many command line arguments". Escape quotes inside addresses: `'docker_container.redis[\"cache\"]'`
- State: `terraform state list`, `terraform state show <address>` (for example `docker_container.legacy`, or `'docker_container.redis[\"cache\"]'` for a `for_each` instance). `terraform.tfstate` is local and git-ignored
- Format / validate: `terraform fmt -check` (`terraform fmt` fixes) / `terraform validate`

## Who writes what
- **Part 1, the app (`services/`, `docker-compose.yml`):** done (1.1–1.5). The AI changes it only when I ask, for example to fix something Part 2 uncovers.
- **Parts 2–3, Kubernetes and Terraform (`k8s/`, `charts/`, `terraform/`):** since K4, the AI writes every manifest, chart and HCL file and explains every new term in it, following `.claude/skills/teach-module/SKILL.md` and `.claude/rules/tutor-mode.md`. I make the design decisions and run every apply, install and upgrade. Quizzes and explain-backs are paused until the project is finished.

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
