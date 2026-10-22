# Part 2: Kubernetes (I write it, the AI teaches)

Runs on a local **kind** cluster in its own namespace, `catalog`. Plain YAML until module K7, then Helm. Estimated time: 1–2 weeks.

How each module runs: `.claude/skills/teach-module/SKILL.md`. Known pitfalls (ingress-nginx retirement, Bitnami, kind image tags): `.claude/rules/k8s-pitfalls.md`.

**K0. Concepts and setup**
- **Learn:**
  - What Kubernetes does
  - Control plane vs nodes
  - The declarative model (desired vs actual state)
  - kubectl, contexts, namespaces
  - kind (Kubernetes running inside Docker containers)
- **Do:**
  - Install kind.
  - Create a cluster from a kind config file with 1 control-plane and 2 worker nodes, plus a port mapping for Ingress later.
  - Explore the cluster with `kubectl get nodes/pods -A`, `explain` and `api-resources`.
- **Done when:** I can create and delete the cluster from the config file, and explain what runs in `kube-system`.

**K1. Pods, Deployments, Services (Redis first)**
- **Learn:** Pod, ReplicaSet, Deployment, labels and selectors, Service (ClusterIP), cluster DNS (`redis.catalog.svc.cluster.local`), `port-forward`.
- **Do:** run Redis as a Deployment (1 replica) with a Service. Use a throwaway pod to `redis-cli ping` it by its DNS name. Delete the pod and watch it come back.
- **Done when:** I can explain why the Service still works after the pod is replaced, and what a selector does.

**K2. Config, Secrets, and Postgres as a StatefulSet**
- **Learn:**
  - ConfigMap vs Secret (and that Secrets are only base64-encoded, not encrypted, by default)
  - Env vars vs mounted files
  - PersistentVolume and PersistentVolumeClaim, StorageClass (kind's `standard`)
  - StatefulSet vs Deployment, headless Service
- **Do:** run Postgres as a StatefulSet with a `volumeClaimTemplate`, credentials from a Secret, and a headless Service. Delete the pod and confirm the data survived.
- **Done when:** the data survives a pod deletion, and I can explain when to use a StatefulSet over a Deployment.

**K3. catalog-api: probes, migrations, rollouts**
- **Learn:**
  - Loading local images into kind (and why not `:latest`)
  - Liveness vs readiness vs startup probes
  - Jobs (and init containers as the alternative)
  - Rolling updates, `rollout status/history/undo`
- **Do:**
  - Run migrations as a Job.
  - Deploy catalog-api with 2 replicas, config from a ConfigMap and a Secret, and probes on `/healthz` and `/readyz`.
  - Ship version `0.1.1` with a visible change, then roll it back.
- **Done when:** I can do a zero-downtime rollout, roll it back, and explain what happens when the readiness probe fails versus when the liveness probe fails.

**K4. OpenSearch + search-service**
- **Learn:**
  - Running a heavier stateful workload
  - Resource requests and limits (and how they relate to JVM heap)
  - Service-to-service calls inside the cluster
- **Do:**
  - Run a single-node OpenSearch as a StatefulSet (security plugin disabled, 512 MB heap, limits set). It needs the `action.auto_create_index` setting from [ADR-0007](../adr/0007-alias-swap-reindex-with-live-writes.md), or search-service won't start.
  - Deploy search-service.
  - Point catalog-api at it, run the seed (as a Job or with `kubectl exec`), and search.
- **Done when:** the full app works inside the cluster through `port-forward`.

**K5. Getting traffic in: Ingress, then Gateway API**
- **Learn:**
  - Service types (ClusterIP, NodePort, LoadBalancer)
  - Ingress vs Ingress controller
  - Why ingress-nginx is retired
  - Gateway API (Gateway, HTTPRoute)
- **Do:**
  - Install Traefik with its Helm chart (just the install command; Helm comes properly in K7).
  - Expose catalog-api at `http://catalog.localhost` through an Ingress.
  - Then replace the Ingress with Gateway API resources.
  - search-service stays internal.
- **Done when:** curl to `catalog.localhost` works without `port-forward`, and I can explain Ingress vs Gateway API.

**K6. Resources, scaling, and failure drills**
- **Learn:**
  - Requests vs limits, QoS classes, OOMKilled, CPU throttling
  - metrics-server (on kind it needs `--kubelet-insecure-tls`)
  - HorizontalPodAutoscaler, PodDisruptionBudget
- **Do:**
  - Set requests and limits on everything.
  - Add an HPA for catalog-api and load it with `hey` or k6 to watch it scale.
  - **Break things on purpose and debug each with `describe`, `logs`, `events` and `exec`:**
    - a wrong image tag (ImagePullBackOff)
    - a bad env var (CrashLoopBackOff)
    - a failing readiness probe
    - a memory limit too low (OOMKilled)
    - deleting the OpenSearch PVC (then fix it with reindex)
- **Done when:** I've seen and fixed each failure, and I can tell from `kubectl describe pod` what went wrong.

**K7. Helm**
- **Learn:** charts, templates, `values.yaml`, releases, `upgrade`/`rollback`, `helm template` for debugging, chart dependencies.
- **Do:**
  - Turn my K1–K6 manifests for catalog-api and search-service into one chart, `charts/product-catalog`, with values for image tags, replicas, resources and config.
  - Add `values-dev.yaml`.
  - Switch OpenSearch to the official `opensearch-project/helm-charts` chart.
  - Keep Postgres and Redis as my own manifests, or template them too.
- **Done when:** `helm install` on a fresh cluster brings up the whole app, and `helm upgrade --set image.tag=...` rolls out a new version.

**K8 (optional). Security basics**
- **Learn:** ServiceAccounts, RBAC (Role, RoleBinding), NetworkPolicy, Pod security context.
- **Do:**
  - Add a NetworkPolicy so only catalog-api can reach search-service and the databases.
  - Run the containers non-root with read-only root filesystems.
- **Caveat:** kind's default network plugin doesn't enforce NetworkPolicy. Recreate the cluster with Calico or Cilium.
- **Done when:** a test pod can't reach search-service, but catalog-api can.
