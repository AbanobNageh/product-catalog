# T0–T1: Redis containers managed by Terraform through the Docker provider.
# Terraform reads every *.tf file in this folder as one configuration; the
# split into versions.tf, variables.tf, locals.tf, main.tf and outputs.tf is
# only for people.

# The `terraform` block configures Terraform itself, not any infrastructure.
terraform {
  # Which Terraform CLI versions may run this folder. "~> 1.16" means
  # ">= 1.16, < 2.0": any 1.x from 1.16 on.
  required_version = "~> 1.16"

  # Which providers (plugins) to download on `terraform init`, and from where.
  # "kreuzwerker/docker" is short for registry.terraform.io/kreuzwerker/docker.
  # "~> 4.6" allows 4.6 and later 4.x, never 5.0. The exact version init picks
  # is recorded in .terraform.lock.hcl, which is committed.
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.6"
    }
  }
}
