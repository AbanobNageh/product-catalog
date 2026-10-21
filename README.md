# Product Catalog

A small two-service product catalogue: a NestJS **catalog-api** (PostgreSQL + Redis) and a Go **search-service** (OpenSearch). I built it to learn **Kubernetes and Terraform** by deploying it: first to a local kind cluster, then with Terraform locally and on AWS.

> **Status:** early. Milestone 1.1 (repo scaffold). Progress: [docs/STATUS.md](docs/STATUS.md).

## Architecture

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

Full spec: [docs/plan/app.md](docs/plan/app.md).

## How to run
_Added as each part lands: Docker Compose (Part 1), kind + Helm (Part 2), Terraform (Part 3)._

## Trade-offs
Recorded as ADRs in [docs/adr/](docs/adr/):
- [0001: Two services, synchronous indexing](docs/adr/0001-two-services-synchronous-indexing.md)
- [0002: Tiered AI context system](docs/adr/0002-tiered-ai-context-system.md)
- [0003: Prisma as the ORM](docs/adr/0003-prisma-as-orm.md)

## What I'd change in production
_Written at the end of Part 1 and extended through Parts 2–3._

## How this was built
- **The app code (Part 1) was written by an AI assistant (Claude Code), one milestone at a time, and I reviewed every milestone** before accepting it.
- **I wrote all the Kubernetes manifests, the Helm chart and the Terraform myself.** The AI acted as tutor and reviewer.

Evidence:
- [docs/ai-workflow.md](docs/ai-workflow.md) explains how the assistant was given context and kept on track.
- [docs/milestones/](docs/milestones/) records what was built at each milestone and what I caught and corrected.
- Commits made with the AI carry a co-author trailer.
