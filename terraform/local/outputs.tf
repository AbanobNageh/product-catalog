output "kube_context" {
  description = "kubectl context of the cluster (already merged into ~/.kube/config)."
  value       = kind_cluster.this.context_name
}

output "app_url" {
  description = "Where catalog-api answers, through Traefik and the Gateway."
  value       = "http://catalog.localhost"
}

output "release_status" {
  description = "Status of the product-catalog Helm release (deployed when healthy)."
  value       = helm_release.product_catalog.status
}
