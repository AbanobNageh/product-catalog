# K4 OpenSearch + search-service
- Date: 2026-10-23 · Commits: 095a0c4

## What was built
The user asked the AI to write this module's manifests, to speed up (an exception to tutor mode, recorded here). The AI explained each new concept in them; the user applied them in order.

In `k8s/opensearch/`:
- `statefulset.yaml`: StatefulSet `search-service-opensearch`, 1 replica, `opensearchproject/opensearch:3.9.0` (ADR-0005).
  - Env: `discovery.type=single-node`, `DISABLE_SECURITY_PLUGIN=true`, `OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m`, `action.auto_create_index=-products*,+*` (ADR-0007). Kubernetes accepts env names with dots; the image turns them into settings, as in Compose.
  - Resources: requests 500m CPU / 1Gi memory, limits 2 CPU / 1Gi memory. Heap ≈ 50% of the container, because the JVM and Lucene use memory outside the heap. Memory request = limit.
  - Probes:

    | Probe | Endpoint | Settings |
    |---|---|---|
    | startup | `/` | 36 × 5s (3 minutes) |
    | liveness | `/` | timeout 5s, period 10s, failureThreshold 3 |
    | readiness | `/_cluster/health?wait_for_status=yellow&timeout=1s` | timeout 3s, period 5s, failureThreshold 3 |

  - A 1Gi `standard` PVC on `/usr/share/opensearch/data`.
- `service.yaml`: headless Service `search-service-opensearch`, port `http` 9200.

In `k8s/search-service/`:
- `deployment.yaml`: Deployment `search-service`, 2 replicas, `search-service:0.1.0`, `OPENSEARCH_URL=http://search-service-opensearch:9200`.
  - Resources: requests 100m / 64Mi, limits 1 CPU / 256Mi.
  - Probes: startup `/healthz` 20 × 2s, liveness `/healthz`, readiness `/readyz` (OpenSearch answers and the alias exists). `preStop.sleep` 5s.
- `service.yaml`: ClusterIP Service `search-service`, port 8080 → `targetPort: http`. This is the name catalog-api's ConfigMap has pointed at since K3.

In `k8s/catalog-api/`:
- `seedjob.yaml`: Job `catalog-api-seed` (`component: seed`). It runs the catalog-api runtime image with `node dist/seed/main.js` (ADR-0006), builds `DATABASE_URL` like the migration Job, and reindexes through `http://catalog-api:3000`. `backoffLimit: 2`.

Also: `search-service:0.1.0` was rebuilt from HEAD before loading it into kind. The old local image was built at 14:20 (+03:00) on 2026-10-22, before the alias-swap reindex commit (bdae727, 14:44).

Verified live:
- `search-service-opensearch-0` 1/1 Running, PVC Bound. The first start took about 7 minutes, almost all of it the 1.16 GB image pull. The startup probe absorbed the expected `connection refused` while the JVM booted.
- `_cluster/settings?include_defaults` shows `action.auto_create_index: "-products*,+*"`.
- search-service 2/2 Running with 0 restarts, one pod per worker. The EndpointSlice lists both pod IPs.
- The seed Job completed in 6s: `inserted 10000`, then `reindex complete` with `indexed 10000, failed [], swapped true`. Alias `products` → `products-v2` (green, 10,000 docs).
- **Done-when:** through `kubectl port-forward svc/catalog-api`, `GET /products/search?q=phone` returned 115 hits with category, brand and price facets (catalog-api → search-service → OpenSearch). `/readyz` showed Postgres and Redis ok, and `/healthz` reported 0.1.1.

## Decisions (link ADRs)
- **Names** follow [ADR-0008](../adr/0008-k8s-naming-and-labels.md). search-service owns this OpenSearch, so it's `search-service-opensearch`, like `catalog-api-postgres`. Labels: `component: search` for OpenSearch, and `component: api` for search-service (like catalog-api).
- **Headless Service for OpenSearch, ClusterIP for search-service.** OpenSearch is one pod with a stable identity, and the StatefulSet's `serviceName` gives it a per-pod DNS name. A ClusterIP would add nothing for one pod. search-service has interchangeable replicas behind a stable virtual IP.
- **2 search-service replicas are safe.** Reindex state lives in OpenSearch (the `products-build` alias is the shared flag and lock, ADR-0007), not in process memory.
- **Liveness doesn't check cluster health; readiness does.** A red cluster removes the pod from the Service, but it isn't restarted, because a restart can't fix missing shards.
- **`bootstrap.memory_lock` dropped.** It needs a memlock ulimit, and a pod spec has no field for that. Pods don't swap by default, which covers its purpose. `nofile` also has no field; the runtime default is above 65536.
- **No privileged `sysctl` init container** for `vm.max_map_count`. It's a node-wide kernel setting, already 262144 in Docker Desktop's WSL2 VM, which kind's nodes share.
- **Startup order via retries, not ordering.** search-service waits up to 30s for OpenSearch, then exits so the kubelet restarts it. Applying OpenSearch first only saves restarts.

## Follow-ups
- **K5:** catalog-api stays the only exposed service; search-service and OpenSearch stay internal. Still carried: Traefik hostPort and nodeSelector, plus the Option A/B ADR.
- **K6:**
  - Requests and limits are now set on OpenSearch and search-service only. Still to do: catalog-api, Postgres, Redis, and both Jobs.
  - OpenSearch is QoS `Burstable` (CPU request ≠ limit). Decide whether it should be `Guaranteed`.
  - Drill: delete the OpenSearch PVC, then fix it with a reindex (the seed Job or `POST /admin/reindex`).
  - Go doesn't read the container memory limit; consider `GOMEMLIMIT` from the downward API for search-service.
  - Still carried: the Redis-outage drill, readiness probes for Redis and Postgres, the StatefulSet delete/re-apply and node-failure drills.
- **K7:**
  - The `k8s-pitfalls` rule names the official `opensearch-project/helm-charts` chart for OpenSearch. Decide whether the chart replaces this hand-written StatefulSet.
  - The seed Job as a Helm hook, or a manual step.
  - Still carried: Helm hooks for the migration Job, templating the Secret, and Helm's `instance` = release-name convention vs ADR-0008.
- **K8:** run OpenSearch with the security plugin and TLS, or record why not. search-service's distroless image is already non-root; set `securityContext` explicitly.
- **kind:** `kind load docker-image` fails for the multi-platform `opensearchproject/opensearch:3.9.0` (`ctr: content digest … not found`), so the node pulls it from Docker Hub. A pod rescheduled to `catalog-worker2` will pull it again (about 7 minutes). In `AGENTS.md`.
- **Production nits:**
  - 3 OpenSearch nodes with replicas
  - the local-path provisioner doesn't enforce the PVC's 1Gi, so OpenSearch's disk watermarks see the whole Docker disk
  - `ttlSecondsAfterFinished` to clean up finished Jobs
- Still carried from K0: version skew, kubectl 1.36 vs cluster 1.37.
