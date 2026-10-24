# K5 Getting traffic in: Ingress, then Gateway API
- Date: 2026-10-24 · Commits: ab01eff

## What was built
At the user's request the AI wrote this module's files, as in K4, and explained each new concept. The user installed Helm, the CRDs and Traefik, and applied everything.

- **Traefik** from the official chart `traefik/traefik` **42.1.3** (Traefik v3.7.16), as the Helm release `traefik` in the namespace `traefik`. Values in `k8s/traefik/values.yaml`:
  - `nodeSelector: catalog/role: gateway-node` plus `ports.web.hostPort: 80`: Option A, [ADR-0010](../adr/0010-traefik-hostport-on-gateway-node.md)
  - rolling update `maxUnavailable: 1, maxSurge: 0`: the default surge would leave the new pod `Pending` on the held hostPort
  - Service `type: ClusterIP`: the default `LoadBalancer` stays `<pending>` on kind
  - both providers on (`kubernetesIngress` and `kubernetesGateway`)
  - the chart's GatewayClass `traefik` kept; its default Gateway turned off
  - requests 100m / 64Mi, memory limit 256Mi
- **Gateway API CRDs v1.6.3** (standard channel), applied with `kubectl apply --server-side` before the chart. The chart doesn't ship them, and Traefik 3.7 supports exactly v1.6.3.
- **Phase 1: Ingress** `catalog-api` (`ingressClassName: traefik`, host `catalog.localhost`, `/` Prefix → `catalog-api:3000`). It was tested, then deleted from the cluster, and the file was removed before the first commit.
- **Phase 2: Gateway API:**
  - `k8s/traefik/gateway.yaml`: Gateway `product-catalog` in `traefik`. One HTTP listener `web` on **port 8000** (Traefik's entrypoint inside the pod, not the node's 80). `allowedRoutes` only from the namespace labelled `kubernetes.io/metadata.name: catalog`.
  - `k8s/catalog-api/httproute.yaml`: HTTPRoute `catalog-api` in `catalog`. `parentRefs` → `traefik/product-catalog`, `sectionName: web`; hostname `catalog.localhost`; `PathPrefix /` → `catalog-api:3000`.

Verified live:
- Helm release `traefik` revision 1 `deployed` (Helm v4.3.1). The Traefik pod is 1/1 on `catalog-worker`.
- GatewayClass `traefik` `ACCEPTED True`; Gateway `product-catalog` `PROGRAMMED True`; HTTPRoute `catalog-api` `Accepted` and `ResolvedRefs` True. No Ingress is left.
- **Done-when:**
  - `curl http://catalog.localhost/healthz` → `{"status":"ok","version":"0.1.1"}` with no `port-forward`.
  - `/products/search?q=phone` → 115 hits (Traefik → catalog-api → search-service → OpenSearch).
  - Between deleting the Ingress and applying the HTTPRoute, the same URL returned 404. Plain `http://localhost/healthz` also returns 404 (no route for that Host).
- "I can explain Ingress vs Gateway API": **skipped by the user**, to finish the project first. To revisit.
- A Windows reboot overnight stopped Docker Desktop and so the cluster. After restarting Docker Desktop, all three nodes and every pod came back, with the Postgres data and the 10,000-document index intact. search-service restarted twice while OpenSearch booted: the K4 retry design working as intended.

## Decisions (link ADRs)
- **Traffic in: Option A** (hostPort on the gateway node, one Traefik pod): [ADR-0010](../adr/0010-traefik-hostport-on-gateway-node.md), accepted at this close. Option B (NodePort) would have needed the cluster recreated, and C (`cloud-provider-kind`) adds a component whose IPs Windows can't reach directly.
- **Traefik through its official Helm chart, pinned to `--version 42.1.3`,** with only the differences from the defaults in `values.yaml`. Helm itself is taught in K7.
- **Our own Gateway, not the chart's default one.** It makes the operator/app split visible: the Gateway lives in `traefik` and decides who may attach; the HTTPRoute lives in `catalog` and holds the app's rules.
- **Gateway API is the end state; the Ingress was a teaching step.** The Ingress API is frozen, not deprecated. Both providers stay on, so the switch needed no reinstall.
- **HTTP only.** Port 443 is mapped (K0) but unused, and TLS is out of scope for K5.

## Follow-ups
- **K6:**
  - Traefik already has requests and limits; a PodDisruptionBudget is pointless with 1 replica.
  - Still carried: requests and limits on catalog-api, Postgres, Redis and both Jobs; OpenSearch QoS; the OpenSearch PVC-delete drill; the Redis-outage drill; readiness probes for Redis and Postgres; the StatefulSet delete/re-apply and node-failure drills.
- **K7:**
  - The product-catalog chart templates the HTTPRoute (not an Ingress). The Gateway and Traefik stay platform-side.
  - Still carried: the official OpenSearch chart vs the hand-written StatefulSet; Helm hooks for the migration and seed Jobs; template the Secret; `instance` = release name vs ADR-0008.
- **K8:** TLS on `websecure` (a Gateway HTTPS listener with `certificateRefs`, for example from cert-manager); the Traefik dashboard stays unexposed; the NetworkPolicy from the plan.
- **T2/T5:**
  - Decide whether Terraform installs the Gateway API CRDs and the Traefik release (Helm provider).
  - On AWS, ADR-0010 doesn't carry over: use a `LoadBalancer` Service or the AWS Load Balancer Controller, and several replicas.
- **Windows:**
  - After `winget install`, a new terminal is needed before the tool is on the PATH.
  - After a reboot, start Docker Desktop before using the cluster (or enable "Start Docker Desktop when you sign in").
  - Both are in `AGENTS.md`.
- Still carried from K0: version skew, kubectl 1.36 vs cluster 1.37.
