# T2: Terraform builds the local platform: the kind cluster, the platform
# releases (Gateway API CRDs, Traefik, metrics-server) and the product-catalog
# chart. `terraform apply` from nothing gives a working app at
# http://catalog.localhost; `terraform destroy` removes the whole cluster.
#
# Files (Terraform reads them all as one configuration):
#   versions.tf     Terraform and provider versions
#   providers.tf    how each provider connects (kind, kubernetes, helm)
#   variables.tf    inputs, all with defaults
#   1-cluster.tf    the kind cluster and our images loaded into it
#   2-platform.tf   Gateway API CRDs, Traefik (+ our Gateway), metrics-server
#   3-app.tf        the catalog namespace and the product-catalog release
#   outputs.tf      the kubectl context and the app URL
#
# Terraform ignores file names and block order: it runs resources in the order
# of its dependency graph (`terraform graph`), in parallel where it can. The
# files are numbered and the blocks ordered so that every resource comes after
# everything it depends on: read 1 -> 2 -> 3, top to bottom.
# Every resource also lists all its dependencies in depends_on, including the
# ones Terraform would find on its own from references.

terraform {
  required_version = "~> 1.16"

  # Three providers in one configuration. Each resource type starts with the
  # provider's local name: kind_cluster, kubernetes_namespace_v1, helm_release.
  # `terraform_data` (in platform.tf) is built into Terraform, so it needs no entry.
  required_providers {
    # Creates and deletes kind clusters, like `kind create cluster`. A community
    # provider (not HashiCorp's); 0.13 is built on kind 0.33, the version installed here.
    kind = {
      source  = "tehcyx/kind"
      version = "~> 0.13"
    }
    # Kubernetes objects as Terraform resources (here: one namespace).
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.4"
    }
    # helm_release = one Helm release: create installs, change upgrades,
    # destroy uninstalls. v3 of this provider changed its syntax (see providers.tf).
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.3"
    }
  }
}
