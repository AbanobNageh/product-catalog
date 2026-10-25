# Module `cluster`: one kind cluster, plus our images loaded into its nodes.
# Called from terraform/envs/<env>/main.tf. T2's terraform/local/1-cluster.tf,
# with the values that differ per environment turned into input variables.
#
# A module is just a folder of .tf files. This one is a *child* module: it
# never runs on its own, only when a root module (an envs/ folder) calls it
# with a `module` block. Its variables.tf are its inputs, its outputs.tf what
# the caller can read back (module.cluster.<output>).

terraform {
  # A child module declares which providers it uses, so Terraform knows each
  # one's source. Without this, `kind` would be read as hashicorp/kind, which
  # doesn't exist. Modules give a minimum version (>=); the root module pins
  # the exact range (~>) and the lock file records the build.
  required_providers {
    kind = {
      source  = "tehcyx/kind"
      version = ">= 0.13"
    }
  }
}
