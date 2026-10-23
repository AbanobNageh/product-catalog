# K0 Concepts and setup
- Date: 2026-10-23 · Commits: e32c5ff

## What was built
- `k8s/kind-config.yaml`, written by the user. It defines cluster `catalog` with 1 control-plane and 2 workers, on kind's default node image (`kindest/node:v1.37.0`, not pinned).
- Node `catalog-worker` publishes `127.0.0.1:80` and `127.0.0.1:443` and carries the label `catalog/role=gateway-node`. A comment in the file records what K5 must do to match.
- The cluster was created, explored (`get nodes/pods -A -o wide`, `--show-labels`, `describe node`, `api-resources`, `explain`, `docker exec … ps`/`crictl`), then deleted and recreated from the file. The recreated cluster matched the first one: 3 nodes `Ready`, the same label and mappings, 13 pods. Only the random API-server host port changed (52672 → 51878).
- No app resources yet. The cluster `kind-catalog` is left running.

## Decisions (link ADRs)
- **How traffic gets in (provisional):** Option A was chosen: in K5 Traefik will bind hostPort 80/443 on the labelled worker. The alternative, Option B, was a NodePort (e.g. 30080/30443) mapped from any node. The user picked A "for now", without the context to compare the two yet. **No ADR yet:** revisit in K5, once Service types have been taught, and write the ADR then.
- The mapping went on a **worker**, not the control-plane. The control-plane's `NoSchedule` taint would also have required a toleration on Traefik.
- The mappings are bound to `127.0.0.1` only, so the cluster isn't reachable from the LAN.
- The node label describes a role (`gateway-node`), not a product. Its `catalog/` prefix keeps it apart from kind's own `role:` field.

## Follow-ups
- **K5:** Traefik needs hostPort 80/443 **and** a nodeSelector `catalog/role=gateway-node`. Check the chart's settings with `helm show values traefik/traefik`. Confirm Option A or switch to B, and write the ADR.
- **K1:** create the `catalog` namespace (the user decides: a manifest or a one-off command). Demo live: kill a container (the kubelet restarts it, `RESTARTS` goes up) versus delete a pod (the ReplicaSet creates a new one).
- **K3:** load images with `kind load docker-image`, never `:latest`.
- **Version skew:** kubectl 1.36.1 (bundled with Docker Desktop) against a 1.37.0 cluster is within the supported ±1 minor. A future kind default of 1.38 would put it out of skew.
- Still carried from the 1.5 note: OpenSearch `action.auto_create_index` (K4/K7), the seed as a Job (K2), the migration image (K3).
