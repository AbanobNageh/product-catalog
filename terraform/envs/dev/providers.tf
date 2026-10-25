# Provider configuration lives in the root, never in a child module. Every
# module that uses `helm` or `kubernetes` gets these, pointed at this env's
# cluster.

# kind talks to the local Docker daemon; nothing to configure.
provider "kind" {}

# The connection details are module.cluster's outputs, which don't exist
# until the cluster does. Terraform configures these providers only after
# the cluster is created, and everything using them waits for it.
#
# The T2 caveat still applies (ADR-0014, ADR-0015): the cluster and what runs
# on it share one plan, so if the cluster ever has to be replaced, these
# values are "known after apply" and the providers can't read the old
# releases. Destroy and apply again instead. Splitting the cluster into its
# own root module (own state, own apply) would remove this; not done here.
provider "kubernetes" {
  host                   = module.cluster.endpoint
  client_certificate     = module.cluster.client_certificate
  client_key             = module.cluster.client_key
  cluster_ca_certificate = module.cluster.cluster_ca_certificate
}

provider "helm" {
  # Helm provider v3 syntax: `kubernetes` is an attribute set with `= { ... }`,
  # not the v2 nested block that most blog posts still show.
  kubernetes = {
    host                   = module.cluster.endpoint
    client_certificate     = module.cluster.client_certificate
    client_key             = module.cluster.client_key
    cluster_ca_certificate = module.cluster.cluster_ca_certificate
  }
}
