provider "aws" {
  region  = var.region
  profile = var.aws_profile

  # Stop before changing anything if the profile points at another account.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      project    = "product-catalog"
      managed-by = "terraform"
      root       = "terraform/aws/infra"
    }
  }
}
