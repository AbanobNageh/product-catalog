# State in the bucket created by ../bootstrap (ADR-0017), next to the
# bootstrap's own state under a different key. See ../bootstrap/backend.tf
# for what each setting does.
terraform {
  backend "s3" {
    bucket              = "product-catalog-tfstate-766345100621"
    key                 = "product-catalog/aws/terraform.tfstate"
    region              = "us-east-1"
    profile             = "catalog-aws"
    allowed_account_ids = ["766345100621"]
    encrypt             = true
    use_lockfile        = true
  }
}
