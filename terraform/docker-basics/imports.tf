# T1 import exercise: tf-redis-legacy was started by hand with
#   docker run -d --name tf-redis-legacy -p 127.0.0.1:6383:6379 redis:8-alpine
# and then brought under Terraform without being recreated, with this
# import block (Terraform 1.5+) next to the resource below:
#
#   import {
#     to = docker_container.legacy
#     id = "<full container ID>" # docker inspect -f '{{.Id}}' tf-redis-legacy
#   }
#
# The block means "the existing object with this ID belongs at this address".
# plan previewed it ("1 to import"); apply wrote it to the state. The ID
# format is provider-specific: see the "Import" section at the bottom of each
# resource's Registry page.
# The block was removed after the apply: once imported it does nothing, and
# after a destroy (or on a fresh clone) it would point at a container that
# no longer exists and make plan fail. Without it, a fresh apply simply
# creates tf-redis-legacy from the resource below.

# Written to match the hand-made container, so the plan replaces nothing.
# No `command` and no `healthcheck`: the container has neither set, and
# adding either would force a replacement.
resource "docker_container" "legacy" {
  name = "tf-redis-legacy"

  # The image *name*, not docker_image.redis.image_id: on import the provider
  # records the name the container was started with, and a sha256: ID here
  # would differ and force a replacement.
  image = docker_image.redis.name # "redis:8-alpine"

  # The provider never reads env back (it comes from the image), so the
  # imported state has none. An explicit empty list matches that.
  env = []

  # Documents the real binding. See ignore_changes below for why Terraform
  # doesn't act on it.
  ports {
    internal = 6379
    external = 6383
    ip       = local.bind_ip
  }

  # lifecycle: meta-arguments that change how Terraform plans this resource.
  # ignore_changes: for these attributes, keep what the state says and never
  # plan a change. Needed here because the Docker provider (4.6) only reads
  # `ports` back when the state already has them, which an import never
  # does, so `ports` would always look new and force a replacement.
  # Cost: Terraform now ignores edits to this block too. To change the port,
  # replace the container on purpose (terraform apply -replace=...).
  lifecycle {
    ignore_changes = [ports]
  }
}
