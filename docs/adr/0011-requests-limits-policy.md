# 0011. Requests and limits: memory request = limit, CPU requests only

- **Status:** Accepted (approved at the K6 close)
- **Date:** 2026-10-24

## Context
- K6 sets resource requests and limits on every workload. Before K6, catalog-api, Postgres, Redis and both Jobs had none (QoS `BestEffort`). OpenSearch, search-service and Traefik had them, but each followed a different pattern: OpenSearch had memory request = limit with a 2-CPU limit, search-service had memory 64Mi/256Mi with a 1-CPU limit, and Traefik had memory 64Mi/256Mi with no CPU limit.
- The two resources fail differently. A container that goes over its **memory** limit is killed (OOMKilled); memory can't be taken back any other way. A container that goes over its **CPU** limit is throttled: it's paused for the rest of each 100 ms period, so it gets slower without any error anywhere.
- When a node is short of CPU, the kernel shares it out in proportion to the **requests**. A limit isn't needed for a fair share.
- All three kind nodes run in one Docker VM (20 CPUs, 16 GB), but each node reports the VM's full capacity. The scheduler sees 60 CPUs and about 45 GiB, so requests protect against overcommitting, but they don't reflect the real hardware.
- Idle usage measured with metrics-server on 2026-10-24 (stage 1 of K6): catalog-api about 85Mi, Postgres 38Mi, Redis 6Mi, search-service 5Mi, Traefik 24Mi, and OpenSearch 940Mi, of which 906Mi is anonymous memory (its peak reached the 1Gi limit).

## Options
1. **Guaranteed everywhere** (request = limit for CPU and memory). Eviction and OOM behaviour are the most predictable, but every pod is throttled at its request even when the node has idle CPU, and the request has to be sized for peak load.
2. **Memory request = limit; CPU request only, no CPU limit.** Chosen. A pod can never use more memory than it reserved, so the node can't be overcommitted on memory, and a pod isn't evicted for memory pressure caused by others. CPU bursts into idle capacity without throttling, and under contention each pod still gets its share by request.
3. **Requests only, no limits.** The simplest option, but one leaking pod can use up the node's memory and get other pods evicted.

## Decision
- Every container in `catalog` and `traefik`, and the metrics-server add-on, sets `requests.cpu`, `requests.memory` and `limits.memory`, with `limits.memory` equal to `requests.memory`. No `limits.cpu`.
- The QoS class is therefore `Burstable` for everything. That's accepted: with memory usage capped at the request, the kubelet ranks these pods last for memory eviction, just like `Guaranteed` ones. This settles the K4 follow-up on OpenSearch's QoS: it stays `Burstable`.
- Sizes (memory is the idle figure plus headroom for load; CPU is the expected steady usage under k6 load):

| Workload | CPU request | Memory request = limit |
|---|---|---|
| catalog-api | 200m | 256Mi |
| catalog-api-migrate Job | 100m | 256Mi |
| catalog-api-seed Job | 200m | 512Mi |
| Postgres | 250m | 512Mi |
| Redis | 50m | 128Mi (with `maxmemory 96mb`, `allkeys-lru`) |
| search-service | 100m | 128Mi |
| OpenSearch | 500m | 1536Mi (heap 512m) |
| Traefik | 100m | 128Mi |
| metrics-server | 100m | 200Mi |

- Redis gets a `maxmemory` below its limit. When the cache is full, Redis evicts the least-recently-used keys instead of growing until the kernel kills it.

## Consequences
- catalog-api's CPU request is also the baseline for the HPA (stage 3): utilization is usage divided by request.
- A pod that leaks memory is OOMKilled and restarted, instead of slowing down its neighbours or getting them evicted. The K6 drills show what that looks like.
- With no CPU limit, a busy pod can make the laptop's other work slower. That's acceptable locally.
- The sizes are a first estimate. Revisit them after the k6 load test (stage 3) and on AWS (T5), where nodes are real and smaller.
- **Production would add:** a LimitRange (per-namespace defaults, so a forgotten `resources:` block doesn't make a pod `BestEffort`); a ResourceQuota per namespace; `GOMEMLIMIT` for search-service, so Go's garbage collector works harder before the hard limit is reached; and right-sizing from real metrics (Prometheus, or a VerticalPodAutoscaler in recommend-only mode).
