provider "aws" {
  region              = var.region
  profile             = var.aws_profile
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      project    = "product-catalog"
      managed-by = "terraform"
      root       = "terraform/aws/app"
    }
  }
}

# How the kubernetes and helm providers log in to EKS: no stored key (kind's kubeconfig
# had one), but an `exec` plugin. Before each connection the provider runs
# `aws eks get-token`, which signs a token with your SSO role; EKS checks it against the
# access entry (cluster admin, terraform/aws/infra/eks.tf). Tokens last 15 minutes, and
# a new one is fetched as needed. This is also what kubectl does after
# `aws eks update-kubeconfig`.
locals {
  eks_exec = {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", data.aws_eks_cluster.this.name, "--region", var.region, "--profile", var.aws_profile, "--output", "json"]
  }
}

provider "kubernetes" {
  host = data.aws_eks_cluster.this.endpoint
  # The cluster's CA certificate, to verify the API server's TLS certificate. EKS returns
  # it base64-encoded.
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)

  exec {
    api_version = local.eks_exec.api_version
    command     = local.eks_exec.command
    args        = local.eks_exec.args
  }
}

provider "helm" {
  # Helm provider v3: `kubernetes` and its `exec` are attributes (`= { ... }`), unlike the
  # kubernetes provider's `exec { }` block above.
  kubernetes = {
    host                   = data.aws_eks_cluster.this.endpoint
    cluster_ca_certificate = base64decode(data.aws_eks_cluster.this.certificate_authority[0].data)
    exec                   = local.eks_exec
  }
}
