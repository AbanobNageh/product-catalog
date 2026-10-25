# Where this root's own state lives: in the bucket it created (ADR-0017).
#
# Order of events: the first apply ran with local state (no backend block),
# because the bucket didn't exist yet. This file was added afterwards, and
# `terraform init -migrate-state` copied the local state into the bucket.
#
# To destroy this root later, reverse it: delete this file,
# `terraform init -migrate-state` (state back to local), empty the bucket
# including old versions, then `terraform destroy`.
#
# A backend block can't use variables, so every value is a literal; the
# bucket name comes from the `state_bucket` output.
terraform {
  backend "s3" {
    bucket = "product-catalog-tfstate-766345100621"
    key    = "product-catalog/aws-bootstrap/terraform.tfstate"
    region = "us-east-1"

    # The same SSO profile as the provider (not `catalog-state`, which is MinIO's).
    profile = "catalog-aws"
    # The backend's own wrong-account guard, like the provider's.
    allowed_account_ids = ["766345100621"]

    # Ask S3 to encrypt the state and lock objects (the bucket default does
    # too; this makes it explicit per request).
    encrypt = true

    # S3-native locking, as on MinIO (ADR-0016): <key>.tflock, created with
    # a conditional write.
    use_lockfile = true
  }
}
