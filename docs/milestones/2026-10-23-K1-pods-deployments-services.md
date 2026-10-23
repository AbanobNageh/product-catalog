# K1 Pods, Deployments, Services
- Date: 2026-10-23 · Commits: c91723f

## What was built
All three files were written by the user:
- `k8s/namespace.yaml`: Namespace `catalog`, as a manifest rather than a one-off command, so it is repeatable and in git.
- `k8s/redis/deployment.yaml`: Deployment `catalog-api-redis`, 1 replica, `redis:8-alpine` (the same image as Compose), containerPort 6379, with `app.kubernetes.io/*` labels. The selector is `name` + `instance`.
- `k8s/redis/service.yaml`: ClusterIP Service `catalog-api-redis`, port 6379 → targetPort 6379, a named port `redis`, and the same labels and selector.
- They were applied with `kubectl apply -f k8s/namespace.yaml -f k8s/redis/`, namespace first.

Checks run live:
- **Ping by DNS name.** A throwaway pod ran `redis-cli -h catalog-api-redis.catalog.svc.cluster.local ping` and got `PONG`. In a debug shell, the short name `catalog-api-redis` also worked. `/etc/resolv.conf` showed `nameserver 10.96.0.10` (the kube-dns Service) and the search list `catalog.svc.cluster.local svc.cluster.local cluster.local`. `nslookup` resolved the name to the ClusterIP `10.96.222.7`.
- **Kill the container** (`kubectl exec … -- kill 1`). The pod kept its name and IP and `RESTARTS` went up by one. The container ID changed, and the key `demo` was lost: it was in memory and in the old container's writable layer. While the container was down the status showed `Completed` (exit 0 after SIGTERM), and a `BackOff` event showed the kubelet's restart delay.
- **Delete the pod.** The ReplicaSet created `k5tb7` straight away, on another node (worker2 → worker), with a new IP (`10.244.2.4` → `10.244.1.7`) and `RESTARTS 0`. The new pod was created while the old one was still `Terminating`. The Service's ClusterIP stayed `10.96.222.7`, its EndpointSlice switched to the new IP, and the ping by name still worked.
- Final state at close: Deployment 1/1, ReplicaSet `catalog-api-redis-64845797f9`, pod `k5tb7` Running, EndpointSlice `10.244.1.7`. `kubectl apply --dry-run=server` against the files reports all three objects `unchanged`.

## Decisions (link ADRs)
- **Names and labels:** [ADR-0008](../adr/0008-k8s-naming-and-labels.md) (accepted at the K1 close). The user chose owner-prefixed names (`catalog-api-redis`) and the recommended `app.kubernetes.io/*` labels, with a selector of `name` + `instance`.
- **Namespace as a manifest**, not `kubectl create namespace`. `metadata.namespace` is set in every namespaced manifest.
- **1 replica.** Two Redis replicas would be two separate caches behind one Service. With several catalog-api pods, cache invalidation would reach only one of them, which would serve stale search results.
- **Layout:** one folder per component and one object per file (`k8s/redis/`). The namespace file sits at the `k8s/` top level because it is shared. Never `kubectl apply -R -f k8s/`: it would pick up `kind-config.yaml`, which isn't a Kubernetes object.

## Follow-ups
- **K2:**
  - Postgres as a StatefulSet. A StatefulSet waits for the old pod to be gone before creating its replacement, unlike the overlap seen in the delete-pod demo.
  - PersistentVolumes: the lost `demo` key shows why they're needed.
  - Still carried: the seed runs as a Job.
- **K3:**
  - catalog-api's `REDIS_URL` will be `redis://catalog-api-redis:6379/0`.
  - Do a real image change (new ReplicaSet, old one kept at 0, `rollout undo`).
  - A readiness probe for Redis.
  - Still carried: the migration image, and `kind load docker-image` (never `:latest`).
- **K6:**
  - Resource requests and limits for Redis.
  - Measure node-failure timing (about 40s to `NotReady`, then about 5 min before pods are replaced).
- **K7:**
  - Helm's `instance` = release-name convention vs ADR-0008. Selectors are immutable, so changing it means recreating the Deployments.
  - Still carried: OpenSearch `action.auto_create_index` (also K4).
- **K8:** Pod Security Admission labels on the `catalog` namespace.
- **Production nits, no action yet:** pin Redis exactly (`8.x.y-alpine` or a digest). No persistence is acceptable for a cache.
- Still carried from K0:
  - K5: Traefik hostPort and nodeSelector, plus the Option A/B ADR.
  - Version skew: kubectl 1.36 vs cluster 1.37.
