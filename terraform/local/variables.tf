# Inputs. Every variable has a default, so `terraform apply` works with no
# tfvars file. Override one with -var, for example:
#   terraform apply "-var=catalog_api_version=0.1.2"

variable "cluster_name" {
  description = "kind cluster name. The kubectl context becomes kind-<name>."
  type        = string
  default     = "catalog"
}

variable "node_image" {
  description = "kindest/node image for every node (sets the Kubernetes version). Pinned by digest, as kind's release notes recommend."
  type        = string
  # The image kind 0.33 uses by default: Kubernetes 1.37.0.
  default = "kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5"
}

variable "api_server_port" {
  description = "Host port for the Kubernetes API server (127.0.0.1:<port> -> 6443 in the control-plane node). Pinned instead of kind's random port."
  type        = number
  default     = 6443

  validation {
    # kind's default picks a random port in Windows' dynamic range (49152-65535).
    # Hyper-V/WSL2 reserves blocks of that range at boot ("netsh interface ipv4
    # show excludedportrange protocol=tcp"); if the cluster's port lands in one,
    # Docker can't publish it after a reboot and kubectl gets "connection
    # refused" (it happened to the hand-built cluster on 2026-10-25).
    condition     = var.api_server_port >= 1024 && var.api_server_port < 49152
    error_message = "api_server_port must be between 1024 and 49151, outside Windows' dynamic port range."
  }
}

variable "catalog_api_version" {
  description = "Tag of catalog-api and catalog-api-migrate (always the same tag, built from the same commit). Both images must exist in the local Docker daemon."
  type        = string
  default     = "0.1.1"

  validation {
    # Semver-like tags only: `latest` would make kind_load and the rollout ambiguous.
    condition     = can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+$", var.catalog_api_version))
    error_message = "catalog_api_version must be a version like 0.1.1, never latest."
  }
}

variable "search_service_version" {
  description = "Tag of search-service. The image must exist in the local Docker daemon."
  type        = string
  default     = "0.1.0"

  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+$", var.search_service_version))
    error_message = "search_service_version must be a version like 0.1.0, never latest."
  }
}

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
