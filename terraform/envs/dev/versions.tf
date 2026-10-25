# Environment `dev`: a root module (the folder you run terraform in) that
# calls the three child modules in terraform/modules/ with dev's settings.
# Its own state (in MinIO under its own key, see backend.tf), its own kind cluster
# (catalog-dev), its own `terraform apply`. ADR-0015, ADR-0016.
#
# Files:
#   versions.tf    Terraform and provider versions (the same in every env)
#   backend.tf     where the state lives: its key differs per env
#   providers.tf   providers pointed at this env's cluster (the same in every env)
#   main.tf        what's different about dev: the three module calls
#   variables.tf   the release versions, the only per-apply inputs
#   outputs.tf     context, URL, release status and Gateway
#
# envs/staging has the same files. Apart from this header, the differences
# are in backend.tf (the key), main.tf, variables.tf and outputs.tf.
# Compare one file with:
#   git diff --no-index terraform/envs/dev/main.tf terraform/envs/staging/main.tf
# (Not the whole folders: that also diffs the state and the <name>-config
# kubeconfig, and prints the admin key.)

terraform {
  required_version = "~> 1.16"

  # The root pins each provider's version range; the modules only state
  # minimums. One provider build serves the root and every module, recorded
  # in this folder's .terraform.lock.hcl (commit it).
  required_providers {
    kind = {
      source  = "tehcyx/kind"
      version = "~> 0.13"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.4"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.3"
    }
  }
}
