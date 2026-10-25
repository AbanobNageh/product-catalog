variable "aws_account_id" {
  description = "The 12-digit AWS account this root may change (allowed_account_ids)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be 12 digits."
  }
}

variable "aws_profile" {
  description = "Named profile in %USERPROFILE%\\.aws\\config (IAM Identity Center)."
  type        = string
  default     = "catalog-aws"
}

variable "region" {
  description = "AWS region (ADR-0017)."
  type        = string
  default     = "us-east-1"
}

variable "admin_cidrs" {
  description = "IP ranges allowed to reach the app's load balancer: the same as infra's (your IP as /32)."
  type        = list(string)

  validation {
    condition     = length(var.admin_cidrs) > 0 && alltrue([for c in var.admin_cidrs : can(cidrhost(c, 0)) && c != "0.0.0.0/0"])
    error_message = "admin_cidrs needs at least one valid CIDR, and not 0.0.0.0/0 (ADR-0018: only your IP)."
  }
}

variable "kube_context" {
  description = "kubeconfig context for this cluster, from infra's kubeconfig_command (--alias). The Gateway API CRD install runs kubectl against it."
  type        = string
  default     = "product-catalog-aws"
}

# The release versions: the images pushed to ECR with these tags (AGENTS.md runbook).
variable "catalog_api_version" {
  description = "Tag of catalog-api and catalog-api-migrate in ECR."
  type        = string
  default     = "0.1.1"
}

variable "search_service_version" {
  description = "Tag of search-service in ECR."
  type        = string
  default     = "0.1.0"
}
