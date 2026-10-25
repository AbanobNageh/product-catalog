# The network, using the community VPC module: about 6 inputs here become
# about 25 resources (the VPC, 6 subnets, route tables and their
# associations, an internet gateway, a NAT gateway and its Elastic IP).
# `terraform state list` after an apply shows them all under module.vpc.

locals {
  name = "product-catalog"

  # Two availability zones (AZs): isolated data centres in us-east-1.
  # Named explicitly because us-east-1e lacks many instance types.
  azs = ["us-east-1a", "us-east-1b"]
}

# trivy:ignore: VPC Flow Logs (AWS-0178) record every connection's metadata
# to CloudWatch or S3; useful for audits and debugging, but a paid extra
# that a short demo doesn't need.
#trivy:ignore:AWS-0178
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.7"

  name = local.name
  azs  = local.azs

  # The VPC's address range in CIDR notation: 10.0.0.0/16 is every address
  # from 10.0.0.0 to 10.0.255.255 (65,536). Each subnet takes a slice of it,
  # one subnet of each kind per AZ, in the order of `azs`.
  cidr = "10.0.0.0/16"

  # Private: EKS nodes and pods. /19 = 8,192 addresses each, because the VPC
  # CNI gives every pod its own VPC IP address. Outbound internet through
  # the NAT gateway; nothing outside can connect in.
  private_subnets = ["10.0.0.0/19", "10.0.32.0/19"]

  # Public: a route to the internet gateway. Only the NAT gateway lives here
  # (and later the app's load balancer). /24 = 256 addresses each.
  public_subnets = ["10.0.64.0/24", "10.0.65.0/24"]

  # Database: RDS, Valkey and OpenSearch. Their own route table with no
  # route out at all (no internet gateway, no NAT).
  database_subnets                   = ["10.0.80.0/24", "10.0.81.0/24"]
  create_database_subnet_route_table = true
  # Also creates an RDS "DB subnet group" from these subnets (see postgres.tf).
  create_database_subnet_group = true

  # A NAT gateway lets private subnets reach the internet (image pulls,
  # AWS APIs) without being reachable from it. One shared NAT instead of
  # one per AZ: half the cost, but if us-east-1a fails, us-east-1b loses
  # outbound internet too. Production uses one per AZ.
  enable_nat_gateway = true
  single_nat_gateway = true

  # Tags that tell Kubernetes' load balancer code which subnets to use:
  # internet-facing load balancers in public subnets, internal ones in
  # private subnets.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}
