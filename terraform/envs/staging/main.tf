# staging: prod-like (catalog-api 2-5 under an HPA, search-service 2, PDBs,
# more memory for catalog-api; see values-staging.yaml), on its own ports so
# it can run beside dev: http://catalog.staging.localhost:8090, API server
# 127.0.0.1:6444. The same modules as dev; only these inputs differ.
#
# A `module` block calls a child module. `source` says where its code is
# (here a local path, relative to this folder; it could also be a Git URL
# with ?ref=<tag> or a Terraform Registry address with a `version`). The
# other arguments set the module's input variables. After adding a module
# block or changing a source, run `terraform init` again.
#
# Terraform builds one graph from all three modules: the order comes from
# references and depends_on, not from the order of the blocks below.

module "cluster" {
  source = "../../modules/cluster"

  name = "catalog-staging"
  # dev holds 6443, 80 and 443. 8080 is taken by another app on this machine.
  api_server_port = 6444
  http_port       = 8090
  https_port      = 8443

  # The same version variables go to the app module, so the release always
  # uses the images that were loaded.
  images = [
    "catalog-api:${var.catalog_api_version}",
    "catalog-api-migrate:${var.catalog_api_version}",
    "search-service:${var.search_service_version}",
  ]
}

module "platform" {
  source = "../../modules/platform"

  # Outputs of one module wired into the inputs of another.
  kube_context = module.cluster.context_name
  cluster_id   = module.cluster.id

  # depends_on on a module block: every resource in this module waits for
  # every resource in module.cluster.
  depends_on = [
    module.cluster, # also implied: the inputs above and the helm provider reference it
  ]
}

module "app" {
  source = "../../modules/app"

  # path.module is this folder (terraform/envs/staging); ../../../ is the repo root.
  values_files = ["${path.module}/../../../charts/product-catalog/values-staging.yaml"]

  catalog_api_version    = var.catalog_api_version
  search_service_version = var.search_service_version

  depends_on = [
    # Required: the pods need the images that module.cluster loads (kind_load),
    # and no input here references them. The providers' settings only make
    # the app wait for the cluster itself.
    module.cluster,
    # Required: the chart's HTTPRoute needs the HTTPRoute CRD and our Gateway,
    # which come with the platform. No input here references it.
    module.platform,
  ]
}
