# Provider configuration: how the Docker provider reaches the Docker Engine.
# Empty is enough: on Windows it defaults to Docker Desktop's named pipe
# (npipe:////./pipe/docker_engine), or to DOCKER_HOST if that is set.
provider "docker" {}

# Data source: read-only. Terraform asks Docker Hub for the digest (content
# hash) that the tag points at today, on every plan. It never creates anything.
data "docker_registry_image" "redis" {
  name = var.redis_image
}

# Resource: an image that Terraform pulls and owns. One image, shared by
# every container below. Its address is docker_image.redis.
resource "docker_image" "redis" {
  name = data.docker_registry_image.redis.name

  # When the digest changes (the tag moved to a new build), pull again.
  pull_triggers = [data.docker_registry_image.redis.sha256_digest]

  # On destroy, leave the image on disk. Compose uses the same image, and
  # deleting it would fail while a Compose container still references it.
  keep_locally = true
}

# One container per entry in var.containers.
# for_each makes this block create one instance per map key. Inside it,
# each.key is the key ("cache") and each.value is that entry's object.
# Instance addresses: docker_container.redis["cache"], ["sessions"], ...
# Removing a key destroys only that container; with count (indexes 0, 1, 2)
# removing a middle item would shift, and recreate, the ones after it.
resource "docker_container" "redis" {
  for_each = var.containers

  name  = local.container_names[each.key]
  image = docker_image.redis.image_id

  # Overrides the image's default command (CMD). Changing it replaces the
  # container: Docker can't change a running container's command.
  command = [
    "redis-server",
    "--maxmemory", each.value.maxmemory,
    "--maxmemory-policy", each.value.maxmemory_policy,
  ]

  # Docker's restart policy. "no" is the provider's default; it's spelled out
  # because the drift exercise changes it by hand. It can change in place.
  restart = "no"

  ports {
    internal = 6379
    external = each.value.port
    ip       = local.bind_ip
  }

  # Same check as docker-compose.yml.
  healthcheck {
    test     = ["CMD", "redis-cli", "ping"]
    interval = "5s"
    timeout  = "3s"
    retries  = 10
  }

  # `apply` waits until the healthcheck passes before reporting success.
  wait         = true
  wait_timeout = 60
}
