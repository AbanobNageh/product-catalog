# The AWS platform for product-catalog (T5, ADR-0017): the AWS version of
# what kind + the chart run locally.
#
#   kind                      AWS (this root)
#   Docker network        ->  VPC with public, private and database subnets
#   kind cluster          ->  EKS control plane + a managed node group
#   kind load             ->  ECR repositories (nodes pull from them)
#   Postgres StatefulSet  ->  RDS for PostgreSQL
#   Redis Deployment      ->  ElastiCache for Valkey
#   OpenSearch StatefulSet->  Amazon OpenSearch Service
#
# It doesn't deploy the app: Traefik, the load balancer and the Helm release
# belong to the optional paid part (docs/plan/terraform.md, T5).
#
# Files:
#   versions.tf      Terraform and provider versions
#   backend.tf       state in the bucket from ../bootstrap
#   providers.tf     the AWS provider: region, profile, account guard, tags
#   variables.tf     inputs (account ID, the IPs allowed to reach the API server)
#   network.tf       the VPC (community module)
#   eks.tf           the cluster and its nodes (community module)
#   ecr.tf           image repositories
#   postgres.tf      RDS
#   valkey.tf        ElastiCache
#   opensearch.tf    OpenSearch Service
#   outputs.tf       endpoints and the kubeconfig command
#
# Cost while it exists: about USD 0.31/h (plus about 0.04/h once the app's
# load balancer runs). `plan` is free; `apply` needs the user's go-ahead.

terraform {
  required_version = "~> 1.16"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.70"
    }
  }
}
