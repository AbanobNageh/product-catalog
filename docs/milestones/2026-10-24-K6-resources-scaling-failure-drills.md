# K6 Resources, scaling and failure drills
- Date: 2026-10-24 · Commits: 797b108

## What was built
The AI wrote this module's files and explained each new concept, as agreed at the K5 close. The user installed, applied and ran every command and drill.

- **metrics-server** from the official chart `metrics-server/metrics-server` **3.14.0** (metrics-server v0.9.0), as the Helm release `metrics-server` in `kube-system`. Values in `k8s/metrics-server/values.yaml`: `--kubelet-insecure-tls` (kind's kubelets use self-signed serving certificates) and memory request = limit 200Mi.
- **Requests and limits on every workload**, following [ADR-0011](../adr/0011-requests-limits-policy.md) (memory request = limit, CPU request only). They were sized from idle `kubectl top` numbers, plus headroom:
  - catalog-api 200m / 256Mi; Postgres 250m / 512Mi; Redis 50m / 128Mi; search-service 100m / 128Mi; Traefik 100m / 128Mi (Helm upgrade); migrate Job 100m / 256Mi; seed Job 200m / 512Mi.
  - OpenSearch went from 1Gi to **1536Mi**. Its cgroup showed 906Mi of anonymous memory and `memory.peak` at the 1Gi limit while idle. With the room, it went straight to 1099Mi.
  - CPU limits were removed from OpenSearch (2) and search-service (1).
  - Every app pod is now QoS `Burstable`. Before, catalog-api, Postgres, Redis and both Jobs were `BestEffort`.
- **Redis `maxmemory 96mb`, `allkeys-lru`** (`args` in `k8s/redis/deployment.yaml`), so a full cache evicts keys instead of growing into its 128Mi limit.
- **Readiness probes** for Redis (`exec redis-cli ping`) and Postgres (`exec sh -c pg_isready -h 127.0.0.1 …`; a probe's `exec` gets no `$(VAR)` substitution, so the shell expands the env vars).
- **HPA** `k8s/catalog-api/hpa.yaml` (`autoscaling/v2`): 2–5 pods, 70% of the CPU request, default behaviour. `replicas` was removed from `deployment.yaml`. A plain apply would have reset the Deployment to 1 (`kubectl diff` showed `replicas: 2 → 1`), so the user ran `kubectl apply set-last-applied` first, and the diff came back empty.
- **PodDisruptionBudgets** `minAvailable: 1` for catalog-api and search-service (2 pods each). None for the single-pod Postgres, Redis and OpenSearch, where a PDB would only block drains.
- **k6 load test** `loadtest/catalog-api.js`: 50 VUs, a 1m ramp, a 4m hold and a 30s ramp-down, on `GET /products?page=N&limit=100` (Postgres, uncached), through Traefik with a `Host` header.

Verified live:
- **Load test (k6 2.2.0):** 135,635 requests at 411/s, **0 failed**, p95 **6.5 ms**, max 72 ms, both thresholds ✓.
  - The HPA went 2 → 3 → 4 → 5 at 15s steps (161% peak) and held at 5 with `ScalingLimited TooManyReplicas` (it wanted about 7). It went back to 2 about 5 minutes after the load ended (`ScaleDownStabilized`, then `New size: 2`).
  - catalog-api memory peaked at 89–112Mi of 256Mi.
- **Failure drills, each seen with `get`, `describe`, `logs` and events, then fixed and checked with `kubectl diff`:**
  1. **ImagePullBackOff:** `kubectl set image … catalog-api:0.1.99`. Events showed `pull access denied` from `docker.io/library/catalog-api:0.1.99`. The rollout stalled with both old pods serving (`maxSurge` 1, `maxUnavailable` 0 at 2 replicas). Fixed with `rollout undo`.
  2. **CrashLoopBackOff:** `kubectl set env … LOG_LEVEL=loud`. Exit code 1, restarts climbing, and the cause only in `logs --previous`. Fixed with `rollout undo`.
  3. **Failing readiness (Redis outage):** Redis scaled to 0. Both catalog-api pods went `0/1 Running` with 0 restarts (readiness 503, liveness fine), and Traefik answered `503 no available server` on every path. Fixed by scaling back to 1.
  4. **OOMKilled:** Redis limit set to 32Mi (below its `maxmemory`), then filled by a Lua `EVAL`. `Last State: Terminated, Reason: OOMKilled, Exit Code: 137`, Restart Count 1, and no OOM event in the list. Fixed by re-applying the file.
  5. **OpenSearch PVC delete + reindex:**
     - The PVC stayed `Terminating` (`kubernetes.io/pvc-protection`) until the StatefulSet was scaled to 0. The PV then went with it (reclaim `Delete`).
     - Scaling back to 1 created a new empty volume. search-service stayed not-ready with 0 restarts (see the follow-ups), while catalog-api stayed ready and answered its own `503 search is temporarily unavailable` (ADR-0001).
     - Fixed with `rollout restart deploy/search-service` (which recreated the index and alias), then `POST /admin/reindex` → `{"indexed":10000,"failed":[],"swapped":true}`, and 115 hits for `phone` again.
- **Done-when:**
  - "Seen and fixed each failure": **passed**, all five drills from the plan.
  - "I can tell from `kubectl describe pod` what went wrong": shown in practice through the drills. The explain-back was **skipped by the user**, as agreed at the K5 close. To revisit.

## Decisions (link ADRs)
- **Resource policy:** memory request = limit, CPU request only, everything `Burstable`, sizes in a table: [ADR-0011](../adr/0011-requests-limits-policy.md). This settles the K4 "OpenSearch QoS" follow-up.
- **`maxReplicas: 5` is a deliberate ceiling.** Each catalog-api pod holds up to 10 Postgres connections (node-postgres's default pool), and `max_connections` is 100. The load test showed 5 pods served the load with p95 6.5 ms, even though the HPA wanted 7.
- **metrics-server through its official Helm chart, pinned to `--version 3.14.0`,** in `kube-system` as cluster plumbing, like Traefik in K5.
- **Drills break things imperatively** (`set image`, `set env`, `scale`, `set resources`) and fix them back to the files, with `kubectl diff` as the check.
- **Load generator: k6 on the Windows host,** through Traefik. A closed loop (100 ms sleep) caps the rate at about 476 req/s, so the test showed the HPA's behaviour, not catalog-api's maximum throughput.

## Follow-ups
- **App (Part 1 changes, the user's call):**
  - catalog-api's `/readyz` checks Redis, so a cache outage makes both pods unready at once: a full API outage (drill 3). Consider checking only Postgres and degrading to Postgres reads without the cache.
  - search-service creates its index and alias only at startup. After OpenSearch loses its data, `/readyz` fails until a restart, and the index stays empty until a reindex (drill 5). Recreating an empty index alone would serve 0 hits with a 200, which is worse. The real fix is an automatic reindex or an alert (Part 4 territory), or a runbook.
- **K7:**
  - The chart templates the HPA and the PDBs. It leaves `replicas` out of the Deployment when autoscaling is on, and puts resources in values.
  - metrics-server stays platform-side.
  - Still carried from K5: the HTTPRoute in the chart; the official OpenSearch chart vs the hand-written StatefulSet; Helm hooks for the migration and seed Jobs; templating the Secret; `instance` = release name vs ADR-0008.
- **K8:** `POST /admin/reindex` is reachable through the public HTTPRoute (`PathPrefix /`), so restrict it. Still carried: TLS on `websecure`, an unexposed Traefik dashboard, the NetworkPolicy.
- **T5:** re-size requests on real, smaller nodes (ADR-0011). Production extras: a LimitRange and ResourceQuota per namespace, `GOMEMLIMIT` for search-service, and VPA in recommend-only mode.
- **Not done, moved to the revisit list:**
  - the drain + PDB drill: both catalog-api pods were on `catalog-worker` at the close, the case where the PDB refuses an eviction
  - the StatefulSet delete/re-apply drill
  - the node-failure drill
  - an open-loop k6 test (`constant-arrival-rate`) to find catalog-api's real capacity
- **Windows:** `kubectl diff` needs `$env:Path += ";C:\Program Files\Git\usr\bin"` in every new terminal (it failed once in drill 4).
