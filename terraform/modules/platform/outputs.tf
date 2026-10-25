output "gateway" {
  description = "The Gateway that app routes attach to (defined in k8s/traefik/values.yaml)."
  # Written out, not read from the release: the chart creates it from the
  # values file, and the app's HTTPRoute names it in catalogApi.route.gateway.
  value = {
    name      = "product-catalog"
    namespace = helm_release.traefik.namespace
  }
}
