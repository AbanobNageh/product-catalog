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

# AWS switches (T5, ADR-0018). The defaults keep the kind platform exactly as it was.

variable "install_metrics_server" {
  description = "Install metrics-server with Helm. false on EKS, where the metrics-server add-on provides it."
  type        = bool
  default     = true
}

variable "traefik_extra_values_files" {
  description = "Values files layered on top of k8s/traefik/values.yaml, in order, for example k8s/traefik/values-aws.yaml."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for f in var.traefik_extra_values_files : fileexists(f)])
    error_message = "Every entry in traefik_extra_values_files must be an existing file."
  }
}

variable "traefik_load_balancer_source_ranges" {
  description = "CIDRs allowed to reach Traefik's load balancer (its Service's loadBalancerSourceRanges). Empty: not set (kind has no load balancer)."
  type        = list(string)
  default     = []
}

variable "aws_load_balancer_controller" {
  description = "Install the AWS Load Balancer Controller before Traefik (EKS only). null: don't. Its IAM role reaches the pod through an EKS Pod Identity association for kube-system/aws-load-balancer-controller (terraform/aws/infra)."
  type = object({
    chart_version = string
    cluster_name  = string
    region        = string
    vpc_id        = string
  })
  default = null
}
