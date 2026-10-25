output "state_bucket" {
  description = "The bucket name for backend.tf files (they can't read outputs, so it's copied in as a literal)."
  value       = aws_s3_bucket.state.bucket
}

output "region" {
  description = "The bucket's region, also needed in backend.tf."
  value       = var.region
}
