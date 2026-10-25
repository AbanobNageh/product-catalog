# Bootstrap root for AWS (T5, ADR-0017): creates the S3 bucket that holds
# Terraform state for terraform/aws/, plus a monthly budget alert.
#
# The chicken-and-egg problem: a backend bucket has to exist before any root
# can store state in it, so something must create it without it. Here this
# root is applied once with local state, then moved into the bucket it just
# created (`terraform init -migrate-state`, after backend.tf is added).
#
# Files:
#   versions.tf      Terraform and provider versions
#   providers.tf     the AWS provider: region, profile, account guard, tags
#   variables.tf     inputs (account ID, budget email and amount)
#   state-bucket.tf  the state bucket and its protections
#   budget.tf        the budget alert
#   outputs.tf       the bucket name, for backend.tf files

terraform {
  required_version = "~> 1.16"

  required_providers {
    # The AWS provider: turns aws_* resources into AWS API calls.
    # Same pin style as envs/: any 6.x from 6.70 on, never 7.0.
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.70"
    }
  }
}
