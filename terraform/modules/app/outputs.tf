output "namespace" {
  description = "Namespace the app runs in."
  value       = helm_release.product_catalog.namespace
}

output "release_status" {
  description = "Status of the product-catalog Helm release (deployed when healthy)."
  value       = helm_release.product_catalog.status
}
