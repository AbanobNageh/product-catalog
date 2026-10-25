# ECR: private image registries in this account, one repository per image.
# On kind, `kind load` copied images into the nodes; on EKS the nodes pull
# from here (through the NAT gateway), with the node role's ECR permissions.

locals {
  repositories = toset(["catalog-api", "catalog-api-migrate", "search-service"])
}

# trivy:ignore: a customer-managed KMS key (AWS-0033) costs USD 1/month; the
# default AES-256 encryption at rest is enough for public-source images.
#trivy:ignore:AWS-0033
resource "aws_ecr_repository" "this" {
  for_each = local.repositories

  name = each.key

  # A pushed tag (0.1.1) can never be overwritten, so a tag always means
  # the same image. A new build needs a new version.
  image_tag_mutability = "IMMUTABLE"

  # Scan every pushed image for known vulnerabilities (CVEs); results in the
  # console and `aws ecr describe-image-scan-findings`.
  image_scanning_configuration {
    scan_on_push = true
  }

  # Let `terraform destroy` delete a repository that still has images.
  force_delete = true
}

# Keep only the 10 newest images per repository.
resource "aws_ecr_lifecycle_policy" "this" {
  for_each = aws_ecr_repository.this

  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the 10 newest images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
