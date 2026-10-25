# A root module's outputs are what `terraform output` prints. They pass on
# what the child modules return.

output "kube_context" {
  description = "kubectl context of dev's cluster. Pass it explicitly: kubectl --context <this> ..."
  value       = module.cluster.context_name
}

output "app_url" {
  description = "Where catalog-api answers, through Traefik and the Gateway (the hostname is in values-dev.yaml)."
  value       = "http://catalog.localhost"
}

output "release_status" {
  description = "Status of the product-catalog Helm release (deployed when healthy)."
  value       = module.app.release_status
}

output "gateway" {
  description = "The Gateway that the app's HTTPRoute attaches to."
  value       = module.platform.gateway
}
