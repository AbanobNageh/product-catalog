# Both resources wait for the cluster, the images and the platform through
# the root's module block (depends_on = [module.cluster, module.platform]).

# The namespace as its own resource (kubernetes provider), rather than
# helm_release's create_namespace: Terraform tracks it, shows it in plan and
# deletes it on destroy, along with what the chart leaves behind (the hook
# Jobs and the StatefulSets' PersistentVolumeClaims).
resource "kubernetes_namespace_v1" "this" {
  count = var.create_namespace ? 1 : 0

  metadata {
    name = var.namespace
  }
}

# `count` above changed the address to kubernetes_namespace_v1.this[0]; this
# tells dev and staging it's the same namespace, not a new one.
moved {
  from = kubernetes_namespace_v1.this
  to   = kubernetes_namespace_v1.this[0]
}

# The release's namespace: a reference to the namespace resource when this
# module creates it, so whatever uses it waits until it exists; otherwise just
# the name. one() returns the single element of a 0-or-1 list, or null when
# it's empty.
locals {
  namespace = var.create_namespace ? one(kubernetes_namespace_v1.this[*].metadata[0].name) : var.namespace
}

# The three API keys (ADR-0020), one per scope. random_password (from the
# hashicorp/random provider) makes a random string on the first apply and
# keeps it in the state, so later applies reuse the same keys. To rotate one:
# terraform apply '-replace=module.app.random_password.api_key[\"write\"]'
# (single quotes in PowerShell 5.1, which mangles \" inside double quotes).
# Its result is sensitive: plan and apply print "(sensitive value)" instead.
# The release gets a hash of the keys (below), so a rotation also rolls the
# catalog-api pods: no pod keeps accepting the old key.
# special = false: letters and digits only, so a key needs no quoting in a
# header or a shell.
resource "random_password" "api_key" {
  for_each = toset(["read", "write", "admin"])

  length  = 48
  special = false
}

# The Secret the chart reads the keys from (catalogApi.apiKeysSecret). It's
# created here, not by the chart: Helm keeps every value in its release
# history, and the seed hook needs the admin key before the install finishes.
# kubernetes_secret_v1's `data` takes plain strings; the provider
# base64-encodes them, as a Secret requires.
resource "kubernetes_secret_v1" "api_keys" {
  metadata {
    name      = "catalog-api-keys"
    namespace = local.namespace
  }

  data = {
    READ_API_KEY  = random_password.api_key["read"].result
    WRITE_API_KEY = random_password.api_key["write"].result
    ADMIN_API_KEY = random_password.api_key["admin"].result
  }
}

resource "helm_release" "product_catalog" {
  name = "product-catalog"
  # A local chart: a path instead of repository + chart name. Its OpenSearch
  # subchart must be in charts/product-catalog/charts/ (after a fresh clone:
  # `helm dependency build charts/product-catalog`).
  chart     = "${path.module}/../../../charts/product-catalog"
  namespace = local.namespace

  # A for expression: read each file into a string, keeping the order.
  values = [for f in var.values_files : file(f)]

  # Helm provider v3: `set` is a list attribute of objects (`set = [ ... ]`),
  # not repeated `set { }` blocks as in v2. Each entry is one --set flag.
  # The env root passes the same versions to module.cluster's images, so
  # the release can't ask for an image that wasn't loaded.
  # concat joins lists: the image tags, then var.extra_set (empty on kind).
  set = concat([
    {
      name  = "catalogApi.image.tag"
      value = var.catalog_api_version
    },
    {
      name  = "searchService.image.tag"
      value = var.search_service_version
    },
    {
      # A reference, so the release also waits for the Secret.
      name  = "catalogApi.apiKeysSecret"
      value = kubernetes_secret_v1.api_keys.metadata[0].name
    },
    {
      # A replaced key makes this unknown at plan time, so the release
      # upgrades and the pods roll (the chart's checksum/api-keys annotation).
      # A SHA-256 of random keys reveals nothing: nonsensitive() lets plan
      # show it instead of hiding the whole set entry.
      name  = "catalogApi.apiKeysChecksum"
      value = nonsensitive(sha256(join(",", [for s in ["read", "write", "admin"] : random_password.api_key[s].result])))
    },
  ], var.extra_set)

  # The CLI's `--wait --timeout`. wait (on by default) is required: the
  # post-install hooks (migrate, then seed) must run after every pod is ready
  # (ADR-0013). timeout is in seconds, per Kubernetes operation.
  wait    = true
  timeout = var.timeout

  depends_on = [
    # Also implied by `namespace` above when the module creates it. With
    # count = 0 this depends on nothing.
    kubernetes_namespace_v1.this,
    # Also implied by the apiKeysSecret value above. Explicit because it
    # matters: the seed hook fails without the Secret.
    kubernetes_secret_v1.api_keys,
  ]
}
