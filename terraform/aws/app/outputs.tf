output "app_url" {
  description = "The app, through the Network Load Balancer (only admin_cidrs can reach it). The DNS name can take a minute or two to resolve after the first apply."
  value       = "http://${try(data.kubernetes_service_v1.traefik.status[0].load_balancer[0].ingress[0].hostname, "<pending>")}"
}

output "release_status" {
  description = "Status of the product-catalog Helm release (deployed when healthy)."
  value       = module.app.release_status
}

output "read_api_key" {
  description = "The read-scope API key (ADR-0020). Print it with: terraform output -raw read_api_key"
  value       = module.app.read_api_key
  sensitive   = true
}

output "write_api_key" {
  description = "The write-scope API key (ADR-0020). Print it with: terraform output -raw write_api_key"
  value       = module.app.write_api_key
  sensitive   = true
}

output "admin_api_key" {
  description = "The admin-scope API key (ADR-0020). Print it with: terraform output -raw admin_api_key"
  value       = module.app.admin_api_key
  sensitive   = true
}
