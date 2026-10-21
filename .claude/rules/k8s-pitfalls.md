---
paths:
  - "k8s/**"
  - "charts/**"
---
# Kubernetes pitfalls (as of late 2026; verify if unsure)

- **ingress-nginx was retired** by the Kubernetes project (announced November 2025, maintenance ended around March 2026). Don't follow tutorials that install it. This project uses **Traefik** for Ingress, then **Gateway API**.
- **Bitnami's free images and charts were restricted in August 2025**, so older tutorials' `bitnami/postgresql` and `bitnami/redis` charts no longer work as written. Postgres and Redis use the user's own manifests; OpenSearch uses the **official `opensearch-project/helm-charts`** chart.
- **Image tags in kind:** never `:latest` for the project's own images. Tag them (`:0.1.0`) and load them with `kind load docker-image`. `:latest` defaults `imagePullPolicy` to `Always`, so Kubernetes tries to pull from a registry.
