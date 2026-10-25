# Outputs: the configuration's return values. `apply` prints them at the end;
# `terraform output` (or `terraform output -json`) shows them again later.

output "containers" {
  description = "Each container's name, address and a command to check it."

  # docker_container.redis is a map of instances (because of for_each), so a
  # for expression can walk it: key is "cache", c is that container's attributes.
  value = {
    for key, c in docker_container.redis : key => {
      name    = c.name
      address = "${local.bind_ip}:${var.containers[key].port}"
      ping    = "docker exec ${c.name} redis-cli ping"
    }
  }
}
