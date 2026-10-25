# Module `app`: the catalog namespace and the product-catalog release
# (ADR-0012, ADR-0013). Called from terraform/envs/<env>/main.tf. T2's
# terraform/local/3-app.tf, with the environment's values file as an input.
#
# Nothing here is kind-specific (images are loaded by the cluster module), so
# T5 can point this module at EKS with other values files.

terraform {
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 3.4"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 3.3"
    }
  }
}
