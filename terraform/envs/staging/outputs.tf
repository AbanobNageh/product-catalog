# A root module's outputs are what `terraform output` prints. They pass on
# what the child modules return.

output "kube_context" {
  description = "kubectl context of staging's cluster. Pass it explicitly: kubectl --context <this> ..."
  value       = module.cluster.context_name
}

output "app_url" {
  description = "Where catalog-api answers, through Traefik and the Gateway (the hostname is in values-staging.yaml, the port in main.tf)."
  value       = "http://catalog.staging.localhost:8090"
}

output "release_status" {
  description = "Status of the product-catalog Helm release (deployed when healthy)."
  value       = module.app.release_status
}

output "gateway" {
  description = "The Gateway that the app's HTTPRoute attaches to."
  value       = module.platform.gateway
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
