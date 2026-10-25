# T5 paid part: plan (2026-10-25)

Goal: run product-catalog on EKS for one session (apply, deploy, smoke test, screenshots), then destroy everything the same day. Costs about USD 0.35/h, about 1.50–2.50 per session. **Every `apply` and `destroy` against AWS needs the user's go-ahead in that moment.**

Background: [aws-architecture.md](../aws-architecture.md), [ADR-0017](../adr/0017-aws-account-state-and-managed-services.md). This plan's decisions go into a new ADR-0018 (proposed).

## Decisions

User's choices (2026-10-25):
1. **Deploy with a new root `terraform/aws/app`**, reusing `modules/platform` and `modules/app` with small AWS switches. It finds the cluster and the managed services with data sources, so its providers aren't configured from a resource in the same root (the T2 caveat), and it's destroyed first.
2. **The database password reaches the cluster through one runbook command:** read the RDS-managed secret, URL-encode the password, `kubectl create secret` with a complete `DATABASE_URL`. Nothing in Terraform state or git.
3. **AWS Load Balancer Controller** (AWS's recommended controller; EKS's built-in one is legacy) creates a Network Load Balancer from Traefik's Service. Its IAM role reaches the pod through EKS Pod Identity.
4. **Only the user's IP reaches the app:** the load balancer accepts `admin_cidrs` only, so `POST /admin/reindex` stays private (K7 follow-up) with no app change.

AI's choices, open to objection:
- **Postgres TLS:** catalog-api's `pg` 8.23 treats `sslmode=require` as full verification, and RDS certificates come from Amazon's RDS CA, which Node doesn't trust by default. The app root downloads AWS's public RDS CA bundle (`global-bundle.pem`, 175 KB) into a ConfigMap; the chart mounts it and sets `NODE_EXTRA_CA_CERTS` for the API, the migration and the seed. No code change. (Prisma's migration engine doesn't verify certificates by default, so it works either way.)
- **The OpenSearch guard (ADR-0007):** search-service starts only if OpenSearch blocks auto-creating `products*`. AWS has no domain option for it but accepts `PUT _cluster/settings {"persistent":{"action.auto_create_index":"-products*,+*"}}` (flat form). The chart gets an optional pre-install/pre-upgrade hook Job (pinned `curlimages/curl`) that sends it.
- **Chart off-switches:** `postgres.enabled` and `redis.enabled` (default `true`, so dev and staging don't change), `catalogApi.database.existingSecret` (a Secret with `DATABASE_URL`), `catalogApi.redisUrl`, `catalogApi.extraCaCerts`.
- **The route's hostname becomes optional:** empty means "any host", because the load balancer's DNS name is only known after Traefik's Service exists. Dev and staging keep theirs.
- **`values-aws.yaml`** is staging-like (HPA 2–5, PDBs, search-service ×2) with seeding on. ECR repositories and endpoints come from the app root (`set`), not the file.
- **Traefik on AWS:** `k8s/traefik/values-aws.yaml` layered on the kind values: no `nodeSelector` or `hostPort`, a `LoadBalancer` Service with the controller's annotations (`aws-load-balancer-type: external`, `nlb-target-type: ip`, `scheme: internet-facing`) and `loadBalancerSourceRanges` from `admin_cidrs`.
- **metrics-server:** the EKS add-on stays; `modules/platform` gets a switch to skip its own Helm release. The switch adds `count`, so a `moved` block keeps dev's and staging's existing release (their `plan` must stay "No changes").

## Work, in order (all free: write, render, lint, `validate`, `plan`)

1. **ADR-0018** (proposed): the decisions above.
2. **Chart** (`charts/product-catalog`): the switches, the CA-bundle mount, the OpenSearch settings hook, the optional hostname, `values-aws.yaml`. Check: `helm lint --strict` and `helm template` for dev, staging and aws; dev and staging render exactly as before (diff the rendered output against `main`).
3. **`modules/platform`:** inputs for extra Traefik values files, skipping metrics-server, and installing the AWS Load Balancer Controller (chart `eks/aws-load-balancer-controller` 3.6.x) before Traefik, so `destroy` removes Traefik (and its load balancer) before the controller. `moved` block for metrics-server. Check: `terraform plan` in `envs/dev` and `envs/staging` shows "No changes".
4. **`terraform/aws/infra`:** the controller's IAM role (AWS's published policy for that version, kept in the repo) and a Pod Identity association for `kube-system/aws-load-balancer-controller`. Check: `plan` (79 to add), tflint, trivy.
5. **`terraform/aws/app`:** a new root with its own state key (`product-catalog/aws/app/terraform.tfstate`). Data sources for the cluster, ECR, Valkey and OpenSearch; kubernetes and helm providers that authenticate with `aws eks get-token` (EKS tokens last 15 minutes, so no stored credentials); the RDS CA ConfigMap; `module.platform` and `module.app`. Check: `validate`, tflint, trivy. Its `plan` needs the cluster, so the first real `plan` happens in the session.
6. **Runbook** in `AGENTS.md` (the session steps below), each command checked as far as possible without spending money.

## The session (paid; the user runs every step)

Start a timer. Expect about 3–4 hours of billing.
1. `aws sso login --profile catalog-aws`. Check the budget exists.
2. `infra/`: `terraform apply` (~20–25 min; OpenSearch is the slowest).
3. `aws eks update-kubeconfig ...` (from the `kubeconfig_command` output), then `kubectl get nodes` (2 Ready).
4. Push the three images to ECR: `aws ecr get-login-password | docker login`, then `docker tag` + `docker push` for `catalog-api:0.1.1`, `catalog-api-migrate:0.1.1`, `search-service:0.1.0`.
5. Create the `DATABASE_URL` Secret (the runbook's PowerShell step).
6. `app/`: `terraform apply` (~5–10 min): CRDs, controller, Traefik (its load balancer takes ~2–3 min to become active), the release with its hooks (OpenSearch setting, migration, seed of 10,000 products).
7. Smoke test: `/healthz`, `/readyz`, `/products/search?q=phone` on the load balancer's DNS name; `kubectl get pods,hpa,pdb -n catalog`; `kubectl top nodes`.
8. Screenshots: the app in a browser, `kubectl` output, the AWS console (EKS cluster and nodes, the load balancer, RDS, OpenSearch, ElastiCache), Cost Explorer.
9. **Teardown:** `app/` `terraform destroy` (Traefik's Service goes first, so the controller deletes the load balancer), then check no load balancer is left (`aws elbv2 describe-load-balancers`), then `infra/` `terraform destroy` (~15–20 min).
10. **Leftover check:** `aws resourcegroupstaggingapi get-resources --tag-filters Key=project,Values=product-catalog` lists only the bootstrap bucket and budget. Also check by hand for resources Terraform didn't create: load balancers, EBS volumes, ENIs and Elastic IPs, and the EKS log group (EKS can recreate it for a few minutes after deletion). Next day: Cost Explorer and the budget.

## Risks

- **A failed `destroy` leaves billing resources.** The most likely cause is a load balancer still holding the VPC: delete Traefik's Service first, then retry. Don't leave the session until the leftover check is clean.
- **Version gaps:** OpenSearch 3.7 vs 3.9 locally, Valkey 9.1 vs Redis 8. Expected to be fine; the smoke test is the proof.
- **The IP changes mid-session** (home router): kubectl times out and the app stops answering. Update `admin_cidrs` in both roots' tfvars and apply.
- **SSO session expiry** (4 h): `aws sso login` again; Terraform and kubectl pick it up.
