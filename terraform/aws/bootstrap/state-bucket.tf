# The S3 bucket for Terraform state. On AWS an S3 bucket is configured
# through several small resources, one per feature, all pointing at the
# bucket: versioning, encryption, public access, ownership, policy, lifecycle.

# Bucket names are global across all AWS accounts, so the account ID makes
# this one unique.
#
# trivy:ignore: access logging (AWS-0089) would need a second bucket for the
# logs. For a single-user state bucket, CloudTrail's management events (on by
# default) already record who changed the bucket.
#trivy:ignore:AWS-0089
resource "aws_s3_bucket" "state" {
  bucket = "product-catalog-tfstate-${var.aws_account_id}"

  # false (the default): Terraform refuses to delete the bucket while it has
  # objects in it, so `destroy` can't wipe the state by accident.
  force_destroy = false
}

# Versioning keeps every earlier version of each object, so a bad write
# (a broken apply, a wrong `state push`) can be rolled back.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encryption at rest with S3-managed keys (SSE-S3): free and automatic.
#
# trivy:ignore: a customer-managed KMS key (AWS-0132) costs USD 1/month plus
# requests, and adds key policies to manage. It matters when you need your
# own key rotation or cross-account control; this bucket doesn't.
#trivy:ignore:AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block Public Access: four switches that stop the bucket or its objects from
# ever being made public, whatever a policy or ACL says.
resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# The account owns every object, and ACLs (the old per-object permission
# system) are switched off; access is decided by IAM and the bucket policy only.
resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# A bucket policy: permissions attached to the bucket (IAM policies attach to
# users and roles). This one only denies: any request not sent over HTTPS.
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = data.aws_iam_policy_document.state_tls_only.json

  # Block Public Access must be in place before a policy is attached.
  depends_on = [aws_s3_bucket_public_access_block.state]
}

# aws_iam_policy_document builds policy JSON from HCL; it's computed locally
# and makes no API call.
data "aws_iam_policy_document" "state_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.state.arn,
      "${aws_s3_bucket.state.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

# Lifecycle: housekeeping rules S3 runs by itself, as on MinIO (ADR-0016).
resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    id     = "state-housekeeping"
    status = "Enabled"

    # An empty filter: the rule applies to every object.
    filter {}

    # Old versions go after 90 days.
    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    # Each lock file (<key>.tflock) leaves a delete marker when it's removed;
    # clean those up once no versions are left behind them.
    expiration {
      expired_object_delete_marker = true
    }

    # Uploads that never finished.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Lifecycle rules on noncurrent versions need versioning first.
  depends_on = [aws_s3_bucket_versioning.state]
}
