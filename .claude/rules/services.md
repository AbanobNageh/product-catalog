---
paths:
  - "services/**"
  - "docker-compose.yml"
---
# Services (Part 1)

- The spec is `docs/plan/app.md`. Read the section for the service you're changing before writing code. Its "Requirements for both services" are non-negotiable because Part 2 depends on them.
- Keep it simple: no extra libraries, layers or features beyond the spec without asking.
- Change the API surface and its Swagger/OpenAPI annotations in the same change. The OpenAPI document is the contract.
- When you add or change a run, test, migrate or seed command, update **Commands** in `AGENTS.md` in the same change.
