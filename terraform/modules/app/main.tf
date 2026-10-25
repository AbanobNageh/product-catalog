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

resource "helm_release" "product_catalog" {
  name = "product-catalog"
  # A local chart: a path instead of repository + chart name. Its OpenSearch
  # subchart must be in charts/product-catalog/charts/ (after a fresh clone:
  # `helm dependency build charts/product-catalog`).
  chart = "${path.module}/../../../charts/product-catalog"
  # A reference to the namespace resource when this module creates it, so the
  # release waits until it exists; otherwise just the name. one() returns the
  # single element of a 0-or-1 list, or null when it's empty.
  namespace = var.create_namespace ? one(kubernetes_namespace_v1.this[*].metadata[0].name) : var.namespace

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
  ]
}
