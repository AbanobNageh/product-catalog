output "namespace" {
  description = "Namespace the app runs in."
  value       = kubernetes_namespace_v1.this.metadata[0].name
}

output "release_status" {
  description = "Status of the product-catalog Helm release (deployed when healthy)."
  value       = helm_release.product_catalog.status
}
