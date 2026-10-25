# Provider configuration: how each provider reaches the thing it manages.

# kind talks to the local Docker daemon; nothing to configure.
provider "kind" {}

# The kubernetes and helm providers need the cluster's API server address and
# credentials. Those don't exist until kind_cluster.this is created, so the
# settings *reference the resource* instead of a kubeconfig file. Terraform then
# configures these providers only after the cluster exists, and every resource
# that uses them waits for the cluster too (an implicit dependency).
#
# The catch (HashiCorp documents it): if the cluster ever has to be replaced,
# these values are "known after apply" during plan, and the providers can't
# read the old releases. Real setups keep the cluster and what runs on it in
# separate configurations (T3 starts on that). For a local cluster we create
# and destroy as one unit, it's fine.
provider "kubernetes" {
  host                   = kind_cluster.this.endpoint
  client_certificate     = kind_cluster.this.client_certificate
  client_key             = kind_cluster.this.client_key
  cluster_ca_certificate = kind_cluster.this.cluster_ca_certificate
}

provider "helm" {
  # Helm provider v3 syntax: `kubernetes` is an attribute set with `= { ... }`.
  # In v2 it was a nested block (`kubernetes { ... }`), which most blog posts
  # still show; v3 rejects that.
  kubernetes = {
    host                   = kind_cluster.this.endpoint
    client_certificate     = kind_cluster.this.client_certificate
    client_key             = kind_cluster.this.client_key
    cluster_ca_certificate = kind_cluster.this.cluster_ca_certificate
  }
}
