# Module `platform`: what every cluster needs before the app can be installed.
# Gateway API CRDs, Traefik (with our Gateway) and metrics-server. Called from
# terraform/envs/<env>/main.tf. T2's terraform/local/2-platform.tf.
#
# This module has no provider blocks: it uses the helm provider the root
# module configured (pointed at that environment's cluster). Modules that
# configure their own providers can't be removed cleanly or used with
# count/for_each, so HashiCorp recommends leaving providers to the root.

terraform {
  required_providers {
    # terraform_data (below) is built into Terraform and needs no entry.
    helm = {
      source  = "hashicorp/helm"
      version = ">= 3.3"
    }
  }
}
