# Input variables: the configuration's parameters, read as var.<name>.
# Values come from (later wins): the `default` below, terraform.tfvars
# (loaded automatically), *.auto.tfvars, -var-file=..., -var 'name=value'.
# TF_VAR_<name> environment variables sit just above the default.

variable "redis_image" {
  description = "Redis image (name:tag) for every container. Same as docker-compose.yml by default."
  type        = string
  default     = "redis:8-alpine"

  # Checked at plan time. `condition` must be true, or plan stops and prints
  # `error_message`.
  validation {
    condition     = startswith(var.redis_image, "redis:")
    error_message = "redis_image must be a Redis image with a tag, for example \"redis:8-alpine\"."
  }
}

variable "name_prefix" {
  description = "Prefix for container names: <prefix>-<key>, for example tf-redis-cache."
  type        = string
  default     = "tf-redis"

  validation {
    # can(...) turns "regex found no match" (an error) into false.
    condition     = can(regex("^[a-z][a-z0-9-]*$", var.name_prefix))
    error_message = "name_prefix must be lowercase letters, digits and dashes, starting with a letter."
  }
}

# One entry per container. The map key ("cache", "sessions", ...) becomes the
# instance key in for_each, so it identifies the container in the state.
# No default: the values live in terraform.tfvars (copy terraform.tfvars.example).
variable "containers" {
  description = "Redis containers to run, keyed by a short name."

  # map(object({...})): a map whose values all have this shape.
  # optional(type, default) lets an entry leave that attribute out.
  type = map(object({
    port             = number                          # host port on 127.0.0.1
    maxmemory        = string                          # Redis's own memory cap, e.g. "64mb"
    maxmemory_policy = optional(string, "allkeys-lru") # what Redis evicts when full
  }))

  # [for ... in ... : ...] is a for expression: it builds a list from a
  # collection, like Array.map. values(map) returns the map's values as a list.
  validation {
    condition     = alltrue([for c in values(var.containers) : c.port >= 1024 && c.port <= 65535])
    error_message = "Each port must be between 1024 and 65535."
  }

  validation {
    # distinct() drops duplicates, so the lengths differ if two entries share a port.
    condition     = length(distinct([for c in values(var.containers) : c.port])) == length(var.containers)
    error_message = "Each container needs its own port."
  }

  validation {
    condition     = alltrue([for c in values(var.containers) : can(regex("^[0-9]+(kb|mb|gb)$", c.maxmemory))])
    error_message = "maxmemory must look like \"64mb\" (a number, then kb, mb or gb)."
  }

  validation {
    condition = alltrue([for c in values(var.containers) : contains(
      ["noeviction", "allkeys-lru", "allkeys-lfu", "allkeys-random", "volatile-lru", "volatile-lfu", "volatile-random", "volatile-ttl"],
      c.maxmemory_policy,
    )])
    error_message = "maxmemory_policy must be one of Redis's eviction policies, for example \"allkeys-lru\" or \"noeviction\"."
  }
}
