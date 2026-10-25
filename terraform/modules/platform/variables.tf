variable "kube_context" {
  description = "kubectl context of the target cluster (module.cluster.context_name). The CRD install runs kubectl against it explicitly."
  type        = string
}

variable "cluster_id" {
  description = "The target cluster's ID (module.cluster.id). A new ID means a new, empty cluster, so the CRDs are installed again."
  type        = string
}

# The versions have defaults, so every environment gets the same platform
# unless its module block overrides one (for example to try a new Traefik
# in dev before staging).

variable "gateway_api_version" {
  description = "Gateway API release whose standard-channel CRDs are installed (github.com/kubernetes-sigs/gateway-api)."
  type        = string
  default     = "v1.6.3"
}

variable "traefik_chart_version" {
  description = "Version of the traefik/traefik chart."
  type        = string
  default     = "42.1.3"
}

variable "metrics_server_chart_version" {
  description = "Version of the metrics-server/metrics-server chart."
  type        = string
  default     = "3.14.0"
}
