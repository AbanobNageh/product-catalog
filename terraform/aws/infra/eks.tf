# EKS, using the community module. It creates the control plane, its IAM
# role, two security groups (cluster and nodes), the managed node group with
# its IAM role and launch template, the add-ons, an access entry for you and
# the control-plane log group.

# trivy:ignore (an ignore on a module call covers the resources inside it):
# - AWS-0040, AWS-0041 (public API endpoint, open to a public CIDR): kubectl
#   runs from a laptop. The endpoint only accepts var.admin_cidrs (your IP),
#   and every request still needs AWS authentication.
# - AWS-0039 (no customer-managed KMS key for secrets): EKS 1.28+ envelope-
#   encrypts all Kubernetes API data with an AWS-owned key by default; a
#   customer-managed key adds USD 1/month and key policies.
# - AWS-0104 (node security group allows all outbound traffic): nodes pull
#   images and call AWS APIs through the NAT gateway; pinning every
#   destination isn't practical.
#trivy:ignore:AWS-0040
#trivy:ignore:AWS-0041
#trivy:ignore:AWS-0039
#trivy:ignore:AWS-0104
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.29"

  name = local.name
  # The newest version in standard support and AWS's default (2026-10-25).
  # kubectl 1.36 is within the supported one-version skew.
  kubernetes_version = "1.37"

  # The network: control plane network interfaces and nodes go in the
  # private subnets.
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # The API server (what kubectl talks to). The private endpoint serves
  # nodes and pods inside the VPC; the public one serves kubectl from your
  # laptop, limited to admin_cidrs (ADR-0017).
  endpoint_private_access      = true
  endpoint_public_access       = true
  endpoint_public_access_cidrs = var.admin_cidrs

  # Who may use the cluster: access entries map an IAM identity to
  # Kubernetes permissions. "API" uses access entries only (not the older
  # aws-auth ConfigMap). The identity running Terraform (your SSO role)
  # becomes cluster admin, so `kubectl` authenticates with your AWS login.
  authentication_mode                      = "API"
  enable_cluster_creator_admin_permissions = true

  # Secrets encryption: EKS's default AWS-owned key instead of a new KMS key
  # (see the trivy note above).
  create_kms_key    = false
  encryption_config = null

  # IRSA (IAM roles for service accounts) needs an OIDC provider; we'd use
  # EKS Pod Identity instead (the add-on below), so skip it.
  enable_irsa = false

  # Control-plane logs go to CloudWatch, kept 1 day: enough to debug a
  # session, cheap to store. All five kinds: API requests, the audit trail,
  # authentication, and the scheduler's and controller manager's decisions.
  enabled_log_types                      = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  cloudwatch_log_group_retention_in_days = 1

  # Add-ons: cluster components that EKS installs and keeps updated, each at
  # the newest version for 1.37 (`most_recent` is the module's default).
  # `before_compute` installs them before the nodes start, because nodes
  # need networking (vpc-cni) to become Ready.
  addons = {
    vpc-cni = {
      # The network plugin: gives each pod an IP from the private subnets.
      before_compute = true
    }
    eks-pod-identity-agent = {
      # Lets pods assume IAM roles (like ECS task roles): the AWS Load Balancer
      # Controller gets its role this way (lb-controller.tf).
      before_compute = true
    }
    # Cluster DNS (Service names -> IPs), as in kind.
    coredns = {}
    # Routes Service IPs to pods on each node, as in kind.
    kube-proxy = {}
    # CPU/memory metrics for `kubectl top` and the HPA (we installed it with
    # Helm on kind; on EKS it's an add-on).
    metrics-server = {}
  }

  # A managed node group: EC2 instances that EKS launches, joins to the
  # cluster and replaces one at a time on upgrades.
  eks_managed_node_groups = {
    default = {
      # The machine image: Amazon Linux 2023, EKS-optimised, x86 like our images.
      ami_type       = "AL2023_x86_64_STANDARD"
      instance_types = ["t3.medium"] # 2 vCPU, 4 GiB
      capacity_type  = "ON_DEMAND"

      # 2 nodes, one per AZ. The max allows one extra during a rolling
      # replacement.
      min_size     = 2
      max_size     = 3
      desired_size = 2
    }
  }
}
