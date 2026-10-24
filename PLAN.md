# Product Catalog: K8s & Terraform Learning Project

A small two-service product catalogue, built to **learn Kubernetes and Terraform** by deploying it.
The app is deliberately simple and uses tech I already know. The new learning is the platform.

Plan written 2026-10-21. The same day it was split into the files below ([ADR-0002](docs/adr/0002-tiered-ai-context-system.md)). Progress lives in [docs/STATUS.md](docs/STATUS.md).

| Part | What | Who writes it | Est. time | Detail |
|---|---|---|---|---|
| 1 | Build the app (NestJS catalog-api + Go search-service) | The AI builds it, I review it | 2–4 days | [docs/plan/app.md](docs/plan/app.md) |
| 2 | Learn Kubernetes by deploying it to a local kind cluster | The AI writes the files and explains them; I do the rest | 1–2 weeks | [docs/plan/kubernetes.md](docs/plan/kubernetes.md) |
| 3 | Learn Terraform by managing that cluster and app, then AWS | The AI writes the files and explains them; I do the rest | about 1 week | [docs/plan/terraform.md](docs/plan/terraform.md) |
| 4 | Optional extras, only after Parts 1–3 are done | (decided then) | — | [docs/plan/extras.md](docs/plan/extras.md) |

Instructions for the AI assistant: [AGENTS.md](AGENTS.md). How the AI context system works: [docs/ai-workflow.md](docs/ai-workflow.md).

## Portfolio and honesty
- **The README is the last step of the whole project,** after T5. Nothing is pushed to GitHub until then. It opens with a short part for recruiters (what the repo is for, what the AI did, what I did, each claim linked to its proof), followed by the technical part for engineers.
- The README should show:
  - the architecture diagram
  - how to run it (Compose, kind + Helm, Terraform)
  - the trade-offs (ADRs)
  - a "what I'd change in production" section
  - a short, honest note on how AI was used: the AI built the app code with my review. In K0–K3 I wrote the Kubernetes manifests myself, with the AI reviewing. After that, for Kubernetes and Terraform, the AI wrote the files, explained them and answered my questions, while I did the rest: the design decisions, and running and checking everything on the cluster
- **On the CV**, list it as a **personal project**. Don't present it as production Kubernetes or Terraform experience. Mention the AWS deployment only if it really happened.
