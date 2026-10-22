# Part 4: Optional extras (later, one at a time, only if I ask)

- **CI (GitHub Actions):** lint, tests, image builds, a kind cluster + Helm install smoke test, and `terraform fmt -check`/`validate`.
- **Observability:** `kube-prometheus-stack` (Prometheus + Grafana), OpenTelemetry traces across both services, and a dashboard for request rate, errors and latency.
- **Event-driven indexing:** replace the synchronous index call with a transactional outbox in Postgres plus a queue (Redpanda/Kafka, or SQS on LocalStack). The Go consumer must be idempotent and have retries and a dead-letter queue. (Zero-downtime reindexing by swapping the alias moved to 1.5: [ADR-0007](../adr/0007-alias-swap-reindex-with-live-writes.md). The outbox can reuse it.)
- **GitOps:** Argo CD syncing the Helm chart from the repo.
- **Postgres operator:** replace my StatefulSet with CloudNativePG, to learn operators and CRDs.
