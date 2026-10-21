# 0001. Two services, synchronous indexing

- **Status:** Accepted (reviewed in milestone 1.1). Option 3 is planned to supersede it in Part 4.
- **Date:** 2026-10-21

## Context
The catalogue needs CRUD over products (with Postgres as the source of truth) and full-text search with filters, facets and sorting (OpenSearch). The project exists to learn Kubernetes and Terraform, so the app should have more than one deployable service and a realistic service-to-service call. It must still stay small enough to build in a few days. The search index has to follow product writes closely: a price change should show up in search within about a second.

## Considered options
1. **One service.** catalog-api talks to Postgres, Redis and OpenSearch directly.
2. **Two services, synchronous indexing.** catalog-api owns the data; an internal Go search-service owns the index. After each successful Postgres write, catalog-api calls search-service over HTTP (2s timeout).
3. **Two services, asynchronous indexing.** A transactional outbox in Postgres plus a queue (Redpanda/Kafka or SQS), with an idempotent Go consumer, retries and a dead-letter queue.

## Decision
**Option 2 now, option 3 later, on purpose.** The project teaches one new thing at a time. Option 2 uses tech I already know, so all the new learning in Parts 2–3 is Kubernetes and Terraform. It still gives two services in two languages, each owning its own datastore, plus a real internal call to secure and route in Kubernetes. The infrastructure stays at three datastores (Postgres, Redis, OpenSearch), with no message broker to run.

Option 3 is not rejected. It's postponed: replacing synchronous indexing with an outbox and Kafka/Redpanda is the planned Part 4 extra, done once the platform is familiar so the broker is the only new thing. It will get its own ADR that supersedes this one.

## Consequences
- Good: simple to build and reason about. Index updates are visible within one request round-trip. search-service stays internal, which gives Part 2 a natural NetworkPolicy and Ingress boundary.
- Bad: **the write and the index update are not atomic.** If search-service is down or times out, the Postgres write still succeeds (the client gets a success), the error is logged, and the index goes stale until `POST /admin/reindex` runs. There are no retries, on purpose: a retry would hide the failure, and the project rule is "no retries that hide failures".
- Bad: catalog-api's write latency includes the index call (bounded by the 2s timeout).
- Search returns 503 when search-service is down. CRUD keeps working.

### Built so the switch to option 3 is cheap
- In catalog-api, every index call goes through **one interface** (for example `SearchIndexer` with `upsert`, `remove`, `bulkUpsert`). Product code never calls HTTP directly. Option 3 swaps the HTTP implementation for "write an outbox row in the same transaction".
- In search-service, the indexing logic is separate from the HTTP handlers, so a Kafka consumer can call the same functions later.
- Indexing is idempotent: `PUT /products/{id}` replaces the whole document, so redelivered events in option 3 are harmless.

## Revisit when
In Part 4, the event-driven indexing extra ([extras](../plan/extras.md)): outbox + Kafka/Redpanda, an idempotent consumer with retries and a dead-letter queue, plus zero-downtime reindexing by swapping the alias. Sooner if stale index windows or write latency become a problem.
