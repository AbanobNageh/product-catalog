output "app_url" {
  description = "The app, through the Network Load Balancer (only admin_cidrs can reach it). The DNS name can take a minute or two to resolve after the first apply."
  value       = "http://${try(data.kubernetes_service_v1.traefik.status[0].load_balancer[0].ingress[0].hostname, "<pending>")}"
}

output "release_status" {
  description = "Status of the product-catalog Helm release (deployed when healthy)."
  value       = module.app.release_status
}
