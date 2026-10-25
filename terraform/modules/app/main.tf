# Both resources wait for the cluster, the images and the platform through
# the root's module block (depends_on = [module.cluster, module.platform]).

# The namespace as its own resource (kubernetes provider), rather than
# helm_release's create_namespace: Terraform tracks it, shows it in plan and
# deletes it on destroy, along with what the chart leaves behind (the hook
# Jobs and the StatefulSets' PersistentVolumeClaims).
resource "kubernetes_namespace_v1" "this" {
  metadata {
    name = var.namespace
  }
}

resource "helm_release" "product_catalog" {
  name = "product-catalog"
  # A local chart: a path instead of repository + chart name. Its OpenSearch
  # subchart must be in charts/product-catalog/charts/ (after a fresh clone:
  # `helm dependency build charts/product-catalog`).
  chart = "${path.module}/../../../charts/product-catalog"
  # A reference to the namespace resource, not the variable: the release
  # waits until the namespace exists.
  namespace = kubernetes_namespace_v1.this.metadata[0].name

  # A for expression: read each file into a string, keeping the order.
  values = [for f in var.values_files : file(f)]

  # Helm provider v3: `set` is a list attribute of objects (`set = [ ... ]`),
  # not repeated `set { }` blocks as in v2. Each entry is one --set flag.
  # The env root passes the same versions to module.cluster's images, so
  # the release can't ask for an image that wasn't loaded.
  set = [
    {
      name  = "catalogApi.image.tag"
      value = var.catalog_api_version
    },
    {
      name  = "searchService.image.tag"
      value = var.search_service_version
    },
  ]

  # The CLI's `--wait --timeout`. wait (on by default) is required: the
  # post-install hooks (migrate, then seed) must run after every pod is ready
  # (ADR-0013). timeout is in seconds, per Kubernetes operation.
  wait    = true
  timeout = var.timeout

  depends_on = [
    kubernetes_namespace_v1.this, # also implied: `namespace` above references it
  ]
}
