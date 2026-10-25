output "namespace" {
  description = "Namespace the app runs in."
  value       = helm_release.product_catalog.namespace
}

output "release_status" {
  description = "Status of the product-catalog Helm release (deployed when healthy)."
  value       = helm_release.product_catalog.status
}

# sensitive = true: `terraform output` shows "<sensitive>" for it, and plan
# never prints it. `terraform output -raw read_api_key` prints the key.
output "read_api_key" {
  description = "The read-scope API key (ADR-0020): Authorization: Bearer <key>."
  value       = random_password.api_key["read"].result
  sensitive   = true
}

# sensitive = true: `terraform output` shows "<sensitive>" for it, and plan
# never prints it. `terraform output -raw write_api_key` prints the key.
output "write_api_key" {
  description = "The write-scope API key (ADR-0020): Authorization: Bearer <key>."
  value       = random_password.api_key["write"].result
  sensitive   = true
}

# sensitive = true: `terraform output` shows "<sensitive>" for it, and plan
# never prints it. `terraform output -raw admin_api_key` prints the key.
output "admin_api_key" {
  description = "The admin-scope API key (ADR-0020): Authorization: Bearer <key>."
  value       = random_password.api_key["admin"].result
  sensitive   = true
}
