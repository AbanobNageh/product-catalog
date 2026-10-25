# AWS permissions for the AWS Load Balancer Controller (ADR-0018). The controller itself is
# installed with Helm by terraform/aws/app (modules/platform); here are the IAM pieces, which
# are plain AWS resources and cost nothing.
#
# How a pod gets AWS permissions with EKS Pod Identity (like an ECS task role):
#   1. an IAM role that trusts the EKS Pod Identity service (the trust policy below),
#   2. a permissions policy on it (what the controller may do),
#   3. an association: "pods using service account kube-system/aws-load-balancer-controller
#      in this cluster get this role". The eks-pod-identity-agent add-on on each node hands
#      those pods short-lived credentials for it.

# Who may assume the role: the EKS Pod Identity service, on behalf of associated pods.
# sts:TagSession lets it tag the session with the cluster, namespace and service account.
data "aws_iam_policy_document" "lb_controller_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole", "sts:TagSession"]

    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lb_controller" {
  name               = "${local.name}-aws-load-balancer-controller"
  assume_role_policy = data.aws_iam_policy_document.lb_controller_trust.json
}

# What the controller may do: AWS's published policy for this controller version, copied
# into the repo so it's pinned and reviewable:
# https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v3.6.2/docs/install/iam_policy.json
# Upgrading the controller means replacing this file with the new version's policy.
#
# It has "*" resources in places: many EC2 and Elastic Load Balancing calls (Describe*,
# CreateSecurityGroup) don't support resource-level permissions. A narrower hand-written
# policy would break with each controller upgrade. (trivy doesn't flag it: it doesn't read
# a policy loaded with file().)
resource "aws_iam_policy" "lb_controller" {
  name        = "${local.name}-aws-load-balancer-controller"
  description = "AWS Load Balancer Controller v3.6.2 (from the controller's docs/install/iam_policy.json)"
  policy      = file("${path.module}/policies/aws-load-balancer-controller-v3.6.2.json")
}

resource "aws_iam_role_policy_attachment" "lb_controller" {
  role       = aws_iam_role.lb_controller.name
  policy_arn = aws_iam_policy.lb_controller.arn
}

# The association. The service account doesn't have to exist yet: the controller's chart
# creates it in terraform/aws/app, and its pods get the role from then on.
resource "aws_eks_pod_identity_association" "lb_controller" {
  cluster_name    = module.eks.cluster_name
  namespace       = "kube-system"
  service_account = "aws-load-balancer-controller"
  role_arn        = aws_iam_role.lb_controller.arn
}
