# Every resource here waits for the cluster without saying so: the helm
# provider is configured from module.cluster's outputs, and the root's module
# block has depends_on = [module.cluster]. Inside a module you can only list
# resources of the same module in depends_on.

# 1. Gateway API CRDs (the Gateway, GatewayClass and HTTPRoute object types),
# with upstream's `kubectl apply` of the release file (ADR-0014: Traefik froze
# its traefik-crds chart, and kubernetes_manifest needs the cluster during plan).
#
# terraform_data is Terraform's built-in "do-nothing" resource. On its own it
# only stores values; here it exists to carry a provisioner.
resource "terraform_data" "gateway_api_crds" {
  # When any value in this list changes, Terraform replaces the resource, so
  # the provisioner runs again: a new cluster, or a new Gateway API version.
  triggers_replace = [var.cluster_id, var.gateway_api_version]

  # A provisioner runs a command on the machine running Terraform, once,
  # right after the resource is created. HashiCorp calls provisioners a last
  # resort: Terraform can't see or track what the command did. These CRDs
  # aren't in the state, and `plan` won't notice if someone deletes them;
  # destroy removes them along with the cluster.
  provisioner "local-exec" {
    # On Windows, local-exec runs the command with `cmd /C`, so `&&` chains
    # (the second command runs only if the first succeeded). kubectl targets
    # this environment's context explicitly instead of trusting your current one.
    #   apply --server-side: the API server merges the objects (CRDs are too
    #   big for the client-side last-applied annotation).
    #   wait ... Established: the API server accepts objects of a new CRD's
    #   type only once it reports Established; Traefik's install creates a
    #   GatewayClass and a Gateway right after this.
    command = join(" && ", [
      "kubectl apply --server-side --context ${var.kube_context} -f https://github.com/kubernetes-sigs/gateway-api/releases/download/${var.gateway_api_version}/standard-install.yaml",
      "kubectl wait --for=condition=Established --timeout=60s --context ${var.kube_context} crd/gatewayclasses.gateway.networking.k8s.io crd/gateways.gateway.networking.k8s.io crd/httproutes.gateway.networking.k8s.io",
    ])
  }
}

# 2. Traefik, the gateway controller (ADR-0010). Its values file also defines
# our Gateway `product-catalog` (ADR-0014). The same values in every
# environment: only the host port in front of it differs (module.cluster).
resource "helm_release" "traefik" {
  name             = "traefik"
  repository       = "https://traefik.github.io/charts"
  chart            = "traefik"
  version          = var.traefik_chart_version
  namespace        = "traefik"
  create_namespace = true

  # path.module is this module's folder (terraform/modules/platform), so the
  # path works whichever env folder calls the module. ../../../ is the repo root.
  # On AWS, extra files follow (later files win), then the load balancer's
  # source ranges as one more values document (yamlencode turns the HCL object
  # into YAML). On kind both are empty, so the list is exactly the one file.
  values = concat(
    [file("${path.module}/../../../k8s/traefik/values.yaml")],
    [for f in var.traefik_extra_values_files : file(f)],
    length(var.traefik_load_balancer_source_ranges) > 0 ? [yamlencode({
      service = { spec = { loadBalancerSourceRanges = var.traefik_load_balancer_source_ranges } }
    })] : [],
  )

  depends_on = [
    # Required: nothing in this resource references the CRDs, so Terraform
    # can't see that Traefik's GatewayClass and Gateway need them. Without this
    # line both would start in parallel and the install could fail with
    # "no matches for kind Gateway".
    terraform_data.gateway_api_crds,
    # On AWS: the controller must be running (with its webhook) before Traefik's
    # Service appears, or no load balancer gets created. In reverse, destroy
    # removes Traefik before the controller. (No effect when count is 0.)
    helm_release.aws_load_balancer_controller,
  ]
}

# 2a. The AWS Load Balancer Controller (EKS only): watches Services of type
# LoadBalancer (and Ingresses) and creates the matching AWS load balancers.
# It calls the AWS API with an IAM role that EKS Pod Identity hands to its
# pods; the role and the association are in terraform/aws/infra.
#
# count = 0 or 1 is Terraform's "optional resource" idiom: the resource exists
# only when the input is set, and its address gets an index ([0]).
resource "helm_release" "aws_load_balancer_controller" {
  count = var.aws_load_balancer_controller == null ? 0 : 1

  name       = "aws-load-balancer-controller"
  repository = "https://aws.github.io/eks-charts"
  chart      = "aws-load-balancer-controller"
  version    = var.aws_load_balancer_controller.chart_version
  namespace  = "kube-system"

  values = [yamlencode({
    clusterName = var.aws_load_balancer_controller.cluster_name
    # Given explicitly, so the controller doesn't have to look them up from
    # the EC2 instance metadata service.
    region = var.aws_load_balancer_controller.region
    vpcId  = var.aws_load_balancer_controller.vpc_id
    serviceAccount = {
      # The name the Pod Identity association expects.
      name = "aws-load-balancer-controller"
    }
  })]
}

# 3. metrics-server, so `kubectl top` works and the HPA can scale catalog-api.
# Cluster-wide plumbing, so it goes in kube-system. It needs nothing but the
# cluster, so it installs in parallel with the CRDs and Traefik.
resource "helm_release" "metrics_server" {
  # On EKS the metrics-server add-on already runs it (terraform/aws/infra).
  count = var.install_metrics_server ? 1 : 0

  name       = "metrics-server"
  repository = "https://kubernetes-sigs.github.io/metrics-server/"
  chart      = "metrics-server"
  version    = var.metrics_server_chart_version
  namespace  = "kube-system"

  values = [file("${path.module}/../../../k8s/metrics-server/values.yaml")]
}

# Adding `count` above changed this resource's address from
# helm_release.metrics_server to helm_release.metrics_server[0]. Without this
# block Terraform would read that as "delete the old one, create a new one" in
# dev and staging. `moved` tells it the existing release just got a new address.
moved {
  from = helm_release.metrics_server
  to   = helm_release.metrics_server[0]
}
