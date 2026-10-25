variable "namespace" {
  description = "Namespace for the release. The Traefik Gateway accepts routes only from `catalog` (k8s/traefik/values.yaml)."
  type        = string
  default     = "catalog"
}

variable "create_namespace" {
  description = "Create the namespace here. false when it must exist before this module runs (terraform/aws/app: the runbook creates it, with the database Secret, before the apply)."
  type        = bool
  default     = true
}

variable "values_files" {
  description = "Chart values files layered on top of the chart's values.yaml, in order (later files win), for example the environment's values-<env>.yaml."
  type        = list(string)

  validation {
    # fileexists() runs during plan, so a typo in a path fails early.
    condition     = alltrue([for f in var.values_files : fileexists(f)])
    error_message = "Every entry in values_files must be an existing file."
  }
}

variable "catalog_api_version" {
  description = "Tag of catalog-api and catalog-api-migrate (always the same tag, built from the same commit)."
  type        = string

  validation {
    # Semver-like tags only: `latest` would make image loading and the rollout ambiguous.
    condition     = can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+$", var.catalog_api_version))
    error_message = "catalog_api_version must be a version like 0.1.1, never latest."
  }
}

variable "search_service_version" {
  description = "Tag of search-service."
  type        = string

  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+$", var.search_service_version))
    error_message = "search_service_version must be a version like 0.1.0, never latest."
  }
}

variable "extra_set" {
  description = "More --set values, after the image tags: values only known at apply time, such as the AWS endpoints (terraform/aws/app). Empty on kind."
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "timeout" {
  description = "Seconds Helm waits for each Kubernetes operation (--timeout). A fresh cluster pulls OpenSearch (1.2 GB)."
  type        = number
  default     = 900
}
