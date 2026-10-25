# Inputs. A variable without a default is required: the caller's module block
# must set it. A variable with a default is optional.

variable "name" {
  description = "kind cluster name. The kubectl context becomes kind-<name>, and the node containers <name>-control-plane, <name>-worker, <name>-worker2."
  type        = string
}

variable "node_image" {
  description = "kindest/node image for every node (sets the Kubernetes version). Pinned by digest, as kind's release notes recommend."
  type        = string
  # The image kind 0.33 uses by default: Kubernetes 1.37.0.
  default = "kindest/node:v1.37.0@sha256:a1ed56cfb0e7b93589bdf97c8cd566405a265939e3620fc4f5de89adff580ae5"
}

variable "api_server_port" {
  description = "Host port for the Kubernetes API server (127.0.0.1:<port> -> 6443 in the control-plane node). Each cluster on this machine needs its own."
  type        = number

  validation {
    # kind's default picks a random port in Windows' dynamic range (49152-65535).
    # Hyper-V/WSL2 reserves blocks of that range at boot ("netsh interface ipv4
    # show excludedportrange protocol=tcp"); if the cluster's port lands in one,
    # Docker can't publish it after a reboot and kubectl gets "connection
    # refused" (it happened to the hand-built cluster on 2026-10-25, ADR-0014).
    condition     = var.api_server_port >= 1024 && var.api_server_port < 49152
    error_message = "api_server_port must be between 1024 and 49151, outside Windows' dynamic port range."
  }
}

variable "http_port" {
  description = "Host port (on 127.0.0.1) forwarded to port 80 of the gateway node, where Traefik listens. Each cluster on this machine needs its own."
  type        = number

  validation {
    condition     = var.http_port >= 1 && var.http_port < 49152
    error_message = "http_port must be between 1 and 49151, outside Windows' dynamic port range."
  }
}

variable "https_port" {
  description = "Host port (on 127.0.0.1) forwarded to port 443 of the gateway node. Nothing serves TLS yet; mapped so the layout matches a real setup."
  type        = number

  validation {
    condition     = var.https_port >= 1 && var.https_port < 49152
    error_message = "https_port must be between 1 and 49151, outside Windows' dynamic port range."
  }
}

variable "images" {
  description = "Images copied from the local Docker daemon into every node (kind load docker-image). Each must exist locally, with a version tag."
  # set(string): a list with no order and no duplicates, which is what
  # for_each needs (it keys each instance by the string itself).
  type = set(string)
}
