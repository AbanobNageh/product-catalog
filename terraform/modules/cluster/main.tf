# The kind cluster: 1 control-plane, 2 workers, the host's
# 127.0.0.1:<http_port>/<https_port> mapped to the gateway worker's 80/443.
#
# kind can't change a running cluster, so the provider marks every argument
# "forces replacement": any edit here means destroy + create (all data lost).
resource "kind_cluster" "this" {
  name       = var.name
  node_image = var.node_image

  # Wait until the control plane reports Ready before anything that uses the
  # cluster (the kubernetes and helm providers) moves on.
  wait_for_ready = true

  # No kubeconfig_path: kind merges the new context (kind-<name>) into your
  # default ~/.kube/config, as `kind create cluster` does; destroy removes it.
  # The provider also writes a copy to ./<name>-config in the folder you run
  # terraform from (envs/<env>/). It holds the cluster's admin key, so
  # .gitignore excludes it.

  # kind_config mirrors kind's YAML config: each YAML key becomes a nested
  # block or attribute with snake_case names (extraPortMappings ->
  # extra_port_mappings). A block written twice (`node`) is a list in YAML.
  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    # Where the API server (what kubectl, helm and the providers talk to) is
    # published on the host. Pinned: see var.api_server_port.
    networking {
      api_server_address = "127.0.0.1"
      api_server_port    = var.api_server_port
    }

    node {
      role = "control-plane"
    }

    node {
      role = "worker"

      # Traefik runs only on this node (nodeSelector in k8s/traefik/values.yaml)
      # and holds the node's port 80 with a hostPort (ADR-0010). Inside the node
      # it's always 80/443; only the host side differs per cluster, so two
      # clusters can run side by side (ADR-0015).
      extra_port_mappings {
        container_port = 80
        host_port      = var.http_port
        listen_address = "127.0.0.1"
      }
      extra_port_mappings {
        container_port = 443
        host_port      = var.https_port
        listen_address = "127.0.0.1"
      }

      labels = {
        "catalog/role" = "gateway-node"
      }
    }

    node {
      role = "worker"
    }
  }
}

# Our images, copied from the local Docker daemon into every node: the same
# thing `kind load docker-image` does. The nodes can't pull them from a
# registry, and the chart uses pullPolicy IfNotPresent, so they must be there
# before the app's pods start. OpenSearch, Postgres and Redis are public
# images; the nodes pull those themselves.
#
# This lives in the cluster module, not the app module, because loading
# images is a kind-only step: on EKS (T5) the nodes pull from ECR, and the
# app module can stay the same.
resource "kind_load" "images" {
  # One kind_load per image, keyed by the image name itself:
  # module.cluster.kind_load.images["catalog-api:0.1.1"].
  for_each = var.images

  image        = each.value
  cluster_name = kind_cluster.this.name

  # Both arguments force replacement: a new tag means a new resource, which
  # loads the new image. If the image isn't in the local Docker daemon, the
  # apply stops here with "image ... not present locally": build it first.

  depends_on = [
    kind_cluster.this, # also implied: cluster_name references it
  ]
}
