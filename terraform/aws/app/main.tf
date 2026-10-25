locals {
  name      = "product-catalog"
  namespace = "catalog"
  repo_root = "${path.module}/../../.."
}

# Data sources: read existing AWS objects (created by ../infra) by name, without managing
# them. Their values are read during `plan`, so this root plans only while infra exists.
data "aws_eks_cluster" "this" {
  name = local.name
}

data "aws_elasticache_replication_group" "valkey" {
  replication_group_id = local.name
}

data "aws_opensearch_domain" "this" {
  domain_name = local.name
}

# AWS's public bundle of RDS CA certificates. catalog-api's Postgres client verifies the
# server certificate (pg treats sslmode=require as verify-full), and Node doesn't trust the
# RDS CA by default. Public certificates, so fine in state.
data "http" "rds_ca_bundle" {
  url = "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200 && strcontains(self.response_body, "BEGIN CERTIFICATE")
      error_message = "Downloading the RDS CA bundle failed."
    }
  }
}

# The bundle as a ConfigMap; the chart mounts it and sets NODE_EXTRA_CA_CERTS
# (catalogApi.extraCaCerts in values-aws.yaml). The namespace comes from the runbook.
resource "kubernetes_config_map_v1" "rds_ca_bundle" {
  metadata {
    name      = "rds-ca-bundle"
    namespace = local.namespace
  }

  data = {
    "global-bundle.pem" = data.http.rds_ca_bundle.response_body
  }
}

# The platform, as in dev and staging, with the AWS switches.
module "platform" {
  source = "../../modules/platform"

  kube_context = var.kube_context
  # A new cluster (even with the same name) has a new creation time, so the CRDs get
  # installed again.
  cluster_id = "${data.aws_eks_cluster.this.arn}@${data.aws_eks_cluster.this.created_at}"

  # The EKS metrics-server add-on already runs it.
  install_metrics_server = false

  # Traefik: the kind values, then AWS's (no host port, a LoadBalancer Service), and only
  # admin_cidrs may reach the load balancer.
  traefik_extra_values_files          = ["${local.repo_root}/k8s/traefik/values-aws.yaml"]
  traefik_load_balancer_source_ranges = var.admin_cidrs

  aws_load_balancer_controller = {
    chart_version = "3.6.2"
    cluster_name  = data.aws_eks_cluster.this.name
    region        = var.region
    vpc_id        = data.aws_eks_cluster.this.vpc_config[0].vpc_id
  }
}

# The release, as in dev and staging, with values-aws.yaml and the endpoints that only
# exist once infra/ is applied.
module "app" {
  source = "../../modules/app"

  # The runbook creates the namespace, with the database Secret, before this apply.
  create_namespace = false
  namespace        = local.namespace

  values_files           = ["${local.repo_root}/charts/product-catalog/values-aws.yaml"]
  catalog_api_version    = var.catalog_api_version
  search_service_version = var.search_service_version

  extra_set = [
    {
      # rediss:// = TLS (transit encryption is on).
      name  = "catalogApi.redisUrl"
      value = "rediss://${data.aws_elasticache_replication_group.valkey.primary_endpoint_address}:6379"
    },
    {
      # HTTPS on 443; OpenSearch Service doesn't serve plain HTTP.
      name  = "searchService.opensearchUrl"
      value = "https://${data.aws_opensearch_domain.this.endpoint}"
    },
  ]

  depends_on = [
    # The Gateway and the load balancer controller before the route and the Service.
    module.platform,
    # Mounted by the catalog-api pods.
    kubernetes_config_map_v1.rds_ca_bundle,
  ]
}

# Traefik's Service, read back after the platform is installed, for its load balancer's
# DNS name (the controller writes it into the Service's status).
data "kubernetes_service_v1" "traefik" {
  metadata {
    name      = "traefik"
    namespace = "traefik"
  }

  depends_on = [module.platform]
}
