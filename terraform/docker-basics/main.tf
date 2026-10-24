# Provider configuration: how the Docker provider reaches the Docker Engine.
# Empty is enough: on Windows it defaults to Docker Desktop's named pipe
# (npipe:////./pipe/docker_engine), or to DOCKER_HOST if that is set.
provider "docker" {}

# Data source: read-only. Terraform asks Docker Hub for the digest (content
# hash) that the tag points at today, on every plan. It never creates anything.
data "docker_registry_image" "redis" {
  name = "redis:8-alpine" # same image as docker-compose.yml
}

# Resource: an image that Terraform pulls and owns.
# Its address is docker_image.redis (type, then local name).
resource "docker_image" "redis" {
  name = data.docker_registry_image.redis.name

  # When the digest changes (the tag moved to a new build), pull again.
  pull_triggers = [data.docker_registry_image.redis.sha256_digest]

  # On destroy, leave the image on disk. Compose uses the same image, and
  # deleting it would fail while a Compose container still references it.
  keep_locally = true
}

# Resource: the container. Referencing docker_image.redis.image_id makes this
# resource depend on the image, so Terraform creates the image first and
# destroys it last. If image_id changes, the container is replaced.
resource "docker_container" "redis" {
  name  = "tf-redis" # tf- prefix: easy to tell apart from Compose's containers
  image = docker_image.redis.image_id

  # Like Compose's ports: "127.0.0.1:6380:6379". Bound to localhost only;
  # 6380 avoids a clash with Compose's Redis on 6379.
  ports {
    internal = 6379
    external = 6380
    ip       = "127.0.0.1"
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
