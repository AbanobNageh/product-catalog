# The kind cluster: 1 control-plane, 2 workers, 127.0.0.1:80/443 mapped to the
# gateway worker. The K0 layout (k8s/kind-config.yaml until T2), written in HCL,
# plus a pinned API server port.
#
# kind can't change a running cluster, so the provider marks every argument
# "forces replacement": any edit here means destroy + create (all data lost).
resource "kind_cluster" "this" {
  name       = var.cluster_name
  node_image = var.node_image

  # Wait until the control plane reports Ready before Terraform moves on to
  # the helm and kubernetes resources.
  wait_for_ready = true

  # No kubeconfig_path: kind merges the new context (kind-catalog) into your
  # default ~/.kube/config, as `kind create cluster` does, so kubectl and
  # helm keep working. Destroy removes that context again. The provider also
  # writes a copy to ./<name>-config (catalog-config) in the folder you run
  # terraform from. It holds the cluster's admin key, so .gitignore excludes it.

  # kind_config mirrors kind's YAML config: each YAML key becomes a nested
  # block or attribute with snake_case names (extraPortMappings ->
  # extra_port_mappings). A block written twice (`node`) is a list in YAML.
  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    # Where the API server (what kubectl, helm and these providers talk to) is
    # published on the host. Without this, kind picks a random free port, which
    # can fall into a block Windows reserves at the next boot (see
    # var.api_server_port). The address is kind's default, written out.
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
      # and holds its port 80 with a hostPort; these mappings forward the
      # host's 127.0.0.1:80/443 to it (ADR-0010). They're why only one cluster
      # with this config can run at a time: the host ports are taken.
      extra_port_mappings {
        container_port = 80
        host_port      = 80
        listen_address = "127.0.0.1"
      }
      extra_port_mappings {
        container_port = 443
        host_port      = 443
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
resource "kind_load" "images" {
  # A set of strings: for_each gives one kind_load per image, keyed by the
  # image name itself (kind_load.images["catalog-api:0.1.1"]).
  for_each = toset([
    "catalog-api:${var.catalog_api_version}",
    "catalog-api-migrate:${var.catalog_api_version}",
    "search-service:${var.search_service_version}",
  ])

  image = each.value
  # A reference to the cluster, not the literal "catalog".
  cluster_name = kind_cluster.this.name

  # Both arguments force replacement: a new tag means a new resource, which
  # loads the new image. If the image isn't in the local Docker daemon, the
  # apply stops here with "image ... not present locally": build it first.

  # depends_on lists what must exist first. Here Terraform would also work it
  # out from the cluster_name reference above; it's written out so every
  # resource shows its full list.
  depends_on = [
    kind_cluster.this, # also implied: cluster_name references it
  ]
}
