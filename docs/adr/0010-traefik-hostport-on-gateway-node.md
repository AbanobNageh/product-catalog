# 0010. Traffic into kind: Traefik on a hostPort on the gateway node

- **Status:** Accepted (approved at the K5 close)
- **Date:** 2026-10-24

## Context
- K5 exposes catalog-api at `http://catalog.localhost` without `port-forward`, first through an Ingress, then through Gateway API. The controller is Traefik (ingress-nginx is retired), installed with its official Helm chart 42.1.3 (Traefik v3.7.16).
- kind nodes are Docker containers. A host port reaches the cluster only through `extraPortMappings` in `k8s/kind-config.yaml`, which can change only by deleting and recreating the cluster.
- K0 mapped `127.0.0.1:80` and `:443` to `catalog-worker` (labelled `catalog/role=gateway-node`) and chose Option A provisionally, before Service types had been taught.
- The cluster now holds Postgres data, a seeded OpenSearch index and a 1.2 GB OpenSearch image pull per node.

## Options
1. **A: hostPort + nodeSelector.** Traefik binds port 80 on the labelled worker's own network interface, and a nodeSelector keeps it on that node. Chosen.
2. **B: NodePort.** Traefik's Service opens, for example, 30080 on every node, and kind maps host 80 → 30080. Traefik could run on any node with several replicas, because kube-proxy forwards from the mapped node. It needs new port mappings, so the cluster would have to be recreated and everything redeployed.
3. **C: LoadBalancer via `cloud-provider-kind`.** It's the closest to a cloud setup, but it adds another component, and on Docker Desktop for Windows the load balancer IPs aren't reachable from the host without extra port mapping.

## Decision
- Traefik runs as **one pod** with `nodeSelector: catalog/role: gateway-node` and `ports.web.hostPort: 80`.
- Its Service is **ClusterIP**. The chart's default `LoadBalancer` would stay `<pending>` on kind.
- Rolling update `maxUnavailable: 1, maxSurge: 0`. A second pod can't hold the same hostPort on the only eligible node, so the default surge would leave it `Pending` and the rollout would never finish.
- Values are in `k8s/traefik/values.yaml`.

## Consequences
- There's no cluster rebuild, and the K0 setup is used as designed.
- A Traefik upgrade or restart causes a few seconds of downtime, because the old pod stops before the new one starts. This is acceptable locally.
- Traefik is a single point of failure, tied to one node. If `catalog-worker` goes down, ingress goes down with it.
- Port 443 is mapped but unused until TLS is in scope.
- **On AWS (T5):** this pattern doesn't carry over. A cloud cluster uses a `LoadBalancer` Service (an NLB) in front of several Traefik replicas, or the AWS Load Balancer Controller. Revisit there.
