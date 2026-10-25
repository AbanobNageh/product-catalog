# Locals: named values computed inside the configuration, read as local.<name>.
# Unlike variables, nobody can set them from outside.

locals {
  # Every container listens on localhost only, like the Compose ports.
  bind_ip = "127.0.0.1"

  # A for expression in braces builds a map: { cache = "tf-redis-cache", ... }.
  # `key => value` is how each entry is written.
  container_names = { for key, c in var.containers : key => "${var.name_prefix}-${key}" }
}
