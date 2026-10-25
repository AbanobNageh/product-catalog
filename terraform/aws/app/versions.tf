# The app on EKS (T5, ADR-0018): the platform (Gateway API CRDs, the AWS Load Balancer
# Controller, Traefik) and the product-catalog release, on the cluster that
# terraform/aws/infra created. The same modules as dev and staging (terraform/modules),
# with their AWS switches.
#
# A separate root from infra/ on purpose:
# - Its providers are configured from data sources (an existing cluster), not from a
#   resource created in the same plan, so the T2 caveat doesn't apply here.
# - It's destroyed first, removing the load balancer before the VPC goes.
#
# Prerequisites (AGENTS.md runbook): infra/ applied, the images pushed to ECR, the
# `catalog` namespace and the `catalog-api-database` Secret created, the kubeconfig
# context `product-catalog-aws` added. Its `plan` needs the cluster, so it only works
# while infra/ is applied.
#
# Files:
#   versions.tf    Terraform and provider versions
#   backend.tf     state in the bucket from ../bootstrap
#   providers.tf   aws; kubernetes and helm authenticated with `aws eks get-token`
#   variables.tf   account, IPs, release versions
#   main.tf        data sources, the RDS CA ConfigMap, module.platform, module.app
#   outputs.tf     the app's URL

terraform {
  required_version = "~> 1.16"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.70"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.4"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.3"
    }
    # random_password for the API keys (modules/app, ADR-0020).
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
    # Downloads AWS's public RDS CA bundle (main.tf).
    http = {
      source  = "hashicorp/http"
      version = "~> 3.5"
    }
  }
}
