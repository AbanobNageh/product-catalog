# Where this environment's state lives (T4, ADR-0016).
#
# A backend is where Terraform stores state and how it locks it. The default,
# `local`, is a terraform.tfstate file in this folder. The `s3` backend keeps
# it as an object in a bucket instead, here on the MinIO server from
# terraform/state-backend/ (S3-compatible, so the AWS settings below apply).
#
# Terraform reads this block before anything else, so it can't use variables
# or locals: every value is a literal. Changing it needs `terraform init`
# again (`-migrate-state` to copy the existing state across).
terraform {
  backend "s3" {
    bucket = "terraform-state"
    # The object's path in the bucket; one key per environment.
    key = "product-catalog/staging/terraform.tfstate"

    # Credentials come from the `catalog-state` profile in
    # %USERPROFILE%\.aws\credentials, never from this file.
    profile = "catalog-state"

    # Lock with a second object, <key>.tflock, created with a conditional
    # write (`If-None-Match: *`: "only if it doesn't exist yet"). A second
    # run gets HTTP 412 and stops with "Error acquiring the state lock".
    # Replaces the deprecated DynamoDB lock table.
    use_lockfile = true

    # MinIO instead of AWS. HashiCorp only tests this backend against AWS;
    # S3-compatible servers are "best effort".
    endpoints = { s3 = "http://127.0.0.1:9000" }
    # The region is required but means nothing to MinIO; us-east-1 is its default.
    region = "us-east-1"
    # http://host/bucket/key URLs, not http://bucket.host/key (which would
    # need DNS for every bucket name).
    use_path_style = true
    # Skip the AWS-only calls MinIO doesn't serve: STS (credential and
    # account checks), the EC2 metadata endpoint and AWS's region list.
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
  }
}
