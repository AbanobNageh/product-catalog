provider "aws" {
  region = var.region

  # Credentials come from a named profile in %USERPROFILE%\.aws\config.
  # `catalog-aws` is an IAM Identity Center (SSO) profile: `aws sso login
  # --profile catalog-aws` caches short-lived credentials that the provider
  # picks up. Nothing secret lives in this repo.
  profile = var.aws_profile

  # A guard rail: if the profile points at any other account, the provider
  # stops before making a single change.
  allowed_account_ids = [var.aws_account_id]

  # AWS tags added to every resource this provider creates, so the bill and
  # the console can be filtered by project.
  default_tags {
    tags = {
      project    = "product-catalog"
      managed-by = "terraform"
      root       = "terraform/aws/bootstrap"
    }
  }
}
