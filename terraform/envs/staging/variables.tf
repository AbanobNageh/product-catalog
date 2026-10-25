# The release versions: what changes from one apply to the next. To release
# to staging, build the images, change a default here, then `terraform apply`.
# Each environment has its own defaults, so dev can run a newer version than
# staging. The modules validate the format.

variable "catalog_api_version" {
  description = "Tag of catalog-api and catalog-api-migrate in staging. Both images must exist in the local Docker daemon."
  type        = string
  default     = "0.2.0"
}

variable "search_service_version" {
  description = "Tag of search-service in staging. The image must exist in the local Docker daemon."
  type        = string
  default     = "0.2.0"
}
