# The app: its namespace and the product-catalog chart (ADR-0012, ADR-0013).

# The namespace as its own resource (kubernetes provider), rather than
# helm_release's create_namespace: Terraform tracks it, shows it in plan and
# deletes it on destroy, along with what the chart leaves behind (the hook
# Jobs and the StatefulSets' PersistentVolumeClaims).
resource "kubernetes_namespace_v1" "catalog" {
  metadata {
    name = "catalog"
  }

  depends_on = [
    kind_cluster.this, # also implied: the kubernetes provider's settings reference it
  ]
}

resource "helm_release" "product_catalog" {
  name = "product-catalog"
  # A local chart: a path instead of repository + chart name. Its OpenSearch
  # subchart must be in charts/product-catalog/charts/ (after a fresh clone:
  # `helm dependency build charts/product-catalog`).
  chart = "${path.module}/../../charts/product-catalog"
  # A reference to the namespace resource, not the literal "catalog".
  namespace = kubernetes_namespace_v1.catalog.metadata[0].name

  values = [file("${path.module}/../../charts/product-catalog/values-dev.yaml")]

  # Helm provider v3: `set` is a list attribute of objects (`set = [ ... ]`),
  # not repeated `set { }` blocks as in v2. Each entry is one --set flag.
  # The tags come from the same variables as kind_load, so the release can't
  # ask for an image that wasn't loaded.
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

  # The CLI's `--wait --timeout 15m`. wait (on by default) is required: the
  # post-install hooks (migrate, then seed) must run after every pod is ready
  # (ADR-0013). timeout is in seconds, per Kubernetes operation. A fresh
  # cluster pulls OpenSearch (1.2 GB), so allow 15 minutes.
  wait    = true
  timeout = 900

  depends_on = [
    kind_cluster.this,               # also implied: the helm provider's settings reference it
    kubernetes_namespace_v1.catalog, # also implied: `namespace` above references it
    # Required: the chart's HTTPRoute needs the HTTPRoute CRD and our Gateway,
    # which come with Traefik. Nothing here references Traefik.
    helm_release.traefik,
    # Required: the pods need our images on the nodes. No attribute links them.
    kind_load.images,
  ]
}
