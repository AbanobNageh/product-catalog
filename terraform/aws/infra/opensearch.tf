# Amazon OpenSearch Service: AWS runs the OpenSearch nodes, their disks and
# upgrades. Replaces the OpenSearch StatefulSet. A "domain" is one managed
# OpenSearch cluster.

# A service-linked role: an IAM role that a service creates and uses on your
# behalf. OpenSearch needs it to put network interfaces into our VPC. The
# console creates it on first use; through the API we create it ourselves.
# (This account didn't have it on 2026-10-25.)
resource "aws_iam_service_linked_role" "opensearch" {
  aws_service_name = "opensearchservice.amazonaws.com"
}

resource "aws_security_group" "opensearch" {
  name        = "${local.name}-opensearch"
  description = "OpenSearch: accepts HTTPS from the EKS nodes only"
  vpc_id      = module.vpc.vpc_id
}

# OpenSearch Service listens on 443 (HTTPS), not 9200 as locally.
resource "aws_vpc_security_group_ingress_rule" "opensearch_from_nodes" {
  security_group_id            = aws_security_group.opensearch.id
  description                  = "OpenSearch HTTPS from EKS nodes"
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  referenced_security_group_id = module.eks.node_security_group_id
}

# The access policy below allows any request that reaches the domain
# ("network only", ADR-0017): search-service sends plain HTTP requests, without
# signing them with IAM. The security group above is what keeps others out.
data "aws_iam_policy_document" "opensearch_access" {
  statement {
    effect    = "Allow"
    actions   = ["es:ESHttp*"]
    resources = ["arn:aws:es:${var.region}:${var.aws_account_id}:domain/${local.name}/*"]

    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
  }
}

# trivy:ignore: AWS-0042 (audit logs to CloudWatch): audit logging needs
# fine-grained access control, which we don't use (network-only access).
#trivy:ignore:AWS-0042
resource "aws_opensearch_domain" "this" {
  domain_name = local.name
  # The newest version AWS offers (2026-10-25). Locally we run 3.9; the
  # opensearch-go v5 client speaks all of 3.x (ADR-0005, ADR-0017).
  engine_version = "OpenSearch_3.7"

  cluster_config {
    # The smallest instance: 2 vCPU (burstable), 2 GiB. One node, so one AZ.
    instance_type          = "t3.small.search"
    instance_count         = 1
    zone_awareness_enabled = false
  }

  # 10 GiB of gp3 SSD per node (the minimum for t3.small).
  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = 10
  }

  # Inside the VPC (one database subnet for one node), so it has no public
  # endpoint at all.
  vpc_options {
    subnet_ids         = [module.vpc.database_subnets[0]]
    security_group_ids = [aws_security_group.opensearch.id]
  }

  access_policies = data.aws_iam_policy_document.opensearch_access.json

  # Encrypted on disk, between nodes, and HTTPS only (TLS 1.2 or newer).
  encrypt_at_rest {
    enabled = true
  }
  node_to_node_encryption {
    enabled = true
  }
  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-PFS-2023-10"
  }

  # Auto-Tune (automatic JVM tuning) isn't available on T3 instances.
  auto_tune_options {
    desired_state       = "DISABLED"
    rollback_on_disable = "NO_ROLLBACK"
  }

  depends_on = [aws_iam_service_linked_role.opensearch]
}
