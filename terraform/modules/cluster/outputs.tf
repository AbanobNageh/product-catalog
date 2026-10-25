# Outputs: the module's return values. The caller reads them as
# module.cluster.<name>; nothing else inside the module is visible outside it.
# The env root uses the connection details to configure the kubernetes and
# helm providers, and the context name for the platform module's kubectl.

output "name" {
  description = "The cluster's name."
  value       = kind_cluster.this.name
}

output "id" {
  description = "The cluster's ID. Changes only when the cluster is replaced, so it works as a \"new cluster\" trigger."
  value       = kind_cluster.this.id
}

output "context_name" {
  description = "kubectl context of the cluster (already merged into ~/.kube/config)."
  value       = kind_cluster.this.context_name
}

output "endpoint" {
  description = "API server URL, for example https://127.0.0.1:6443."
  value       = kind_cluster.this.endpoint
}

output "client_certificate" {
  description = "Admin client certificate (PEM)."
  value       = kind_cluster.this.client_certificate
}

output "client_key" {
  description = "Admin client private key (PEM)."
  value       = kind_cluster.this.client_key
  # sensitive: plan, apply and `terraform output` print (sensitive value)
  # instead of the key. It's still stored in plain text in the state file.
  sensitive = true
}

output "cluster_ca_certificate" {
  description = "The cluster's CA certificate (PEM), to verify the API server."
  value       = kind_cluster.this.cluster_ca_certificate
}
