# 0018. Deploying the app to EKS

- **Status:** Accepted (approved 2026-10-25, after the T5 close). Not yet exercised on a live cluster: the paid session may supersede parts of it.
- **Date:** 2026-10-25

## Context
- T5's optional paid part runs product-catalog on the EKS cluster from `terraform/aws/infra` (ADR-0017) for one session, then destroys everything. Plan: `docs/milestones/2026-10-25-T5-paid-part-plan.md`.
- The chart (K7) and the `platform` and `app` modules (T3) were written for kind: in-chart Postgres, Redis and OpenSearch, Traefik on a host port, metrics-server from Helm, a fixed hostname.
- Facts checked on 2026-10-25:
  - catalog-api's Postgres client (`pg` 8.23, `pg-connection-string` 2.14) treats `sslmode=require` as `verify-full`, and RDS certificates are issued by Amazon's RDS CA, which isn't in Node's built-in list. AWS publishes the CA bundle at `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` (175 KB).
  - RDS-managed master passwords can contain characters that must be percent-encoded in a URL. The chart built `DATABASE_URL` with `$(VAR)` expansion, which can't encode.
  - node-redis 6 turns on TLS for `rediss://` URLs and merges our socket options with it. search-service's distroless image trusts public CAs, which covers OpenSearch Service's certificate.
  - search-service refuses to start unless OpenSearch blocks auto-creating `products*` (ADR-0007). OpenSearch Service has no domain option for it but accepts `PUT _cluster/settings` with `action.auto_create_index` in the flat form. The domain is reachable only from inside the VPC.
  - EKS's built-in Service load balancer support is legacy (critical fixes only); AWS recommends the AWS Load Balancer Controller (v3.6.2, chart 3.6.2, released 2026-10-24; its IAM policy is identical to 3.6.1's).
  - K7's follow-up: `POST /admin/reindex` must be restricted before the app gets a public URL.

## Options
1. **How to deploy:** a new root `terraform/aws/app` that reuses `modules/platform` and `modules/app` (chosen); add it to `infra/`; plain `helm`/`kubectl`.
2. **The database password into the cluster:** one runbook command that builds the Secret from Secrets Manager (chosen); External Secrets Operator with Pod Identity; Terraform reads the secret and creates the Kubernetes Secret (the password would sit in that root's state).
3. **Load balancer:** AWS Load Balancer Controller (chosen); EKS's legacy built-in controller with an NLB annotation.
4. **Exposure:** only `admin_cidrs` reaches the load balancer (chosen); public, with only `/products` and `/healthz` routed.
5. **Postgres TLS:** mount AWS's RDS CA bundle and set `NODE_EXTRA_CA_CERTS` (chosen); `uselibpqcompat=true&sslmode=require` (encrypts but doesn't verify the server); a code change to pass `ssl.ca`.
6. **The OpenSearch setting:** a chart hook Job with curl (chosen); a one-off `kubectl run` in the runbook; a code change in search-service.

## Decision
- **`terraform/aws/app`**, its own state key (`product-catalog/aws/app/terraform.tfstate`). It finds the cluster, Valkey and OpenSearch with data sources and authenticates to EKS with `aws eks get-token` (the `exec` plugin), so no provider is configured from a resource in the same plan (the T2 caveat). It's applied after `infra/` and destroyed before it.
- **Chart 0.2.0** gains switches that default to the kind behaviour (dev and staging render the same apart from one comment and the chart label):
  - `postgres.enabled`, `redis.enabled`; `catalogApi.database.existingSecret` (a Secret with a complete `DATABASE_URL`), `catalogApi.redisUrl`.
  - `catalogApi.extraCaCerts` (ConfigMap + key): mounted into the API, migration and seed pods, named in `NODE_EXTRA_CA_CERTS`.
  - `searchService.opensearchSettings`: a pre-install/pre-upgrade hook Job (`curlimages/curl:8.22.0`) that sets `action.auto_create_index` to `-products*,+*`.
  - `catalogApi.route.hostname` is optional: empty matches any host (the load balancer's DNS name exists only after it's created).
  - `templates/validate.yaml` stops an install that turns a dependency off without naming the external one.
  - `values-aws.yaml`: staging-like (HPA 2–5, PDBs, search-service ×2), seeding on, images from ECR, managed services instead of the in-chart ones.
- **`modules/platform`** gains `install_metrics_server` (false on EKS: the add-on runs it), `traefik_extra_values_files`, `traefik_load_balancer_source_ranges` and `aws_load_balancer_controller`. Traefik depends on the controller, so it's installed after it and destroyed before it. A `moved` block keeps dev's and staging's metrics-server release.
- **`modules/app`** gains `create_namespace` (false on AWS: the runbook creates the namespace with the database Secret before the apply) and `extra_set`. A `moved` block keeps dev's and staging's namespace.
- **Traefik on AWS** (`k8s/traefik/values-aws.yaml`): no `nodeSelector` or `hostPort`, the default surge rollout, and a `LoadBalancer` Service for the controller (`aws-load-balancer-type: external`, `nlb-target-type: ip`, `scheme: internet-facing`) with `loadBalancerSourceRanges` = `admin_cidrs`.
- **`infra/`** adds the controller's IAM role with AWS's published policy for v3.6.2 (kept in `infra/policies/`) and an EKS Pod Identity association for `kube-system/aws-load-balancer-controller`.
- **The database Secret** is created by the runbook: it reads the RDS-managed secret, percent-encodes the password and creates `catalog-api-database` with `DATABASE_URL=postgresql://catalog:<encoded>@<endpoint>/catalog?sslmode=require`.
- **Teardown order:** delete Traefik's Service and confirm no load balancer is left, then destroy `app/`, then `infra/`, then check for leftovers (AGENTS.md runbook).

## Consequences
- Dev and staging `plan` shows one in-place update (the chart version 0.1.0 → 0.2.0) and two moves, no other changes. Applying it upgrades the release with the same objects.
- One manual step per session (the Secret), and `app/` can't plan without a live cluster.
- The load balancer is created by Kubernetes, not Terraform: if the controller is removed before Traefik's Service, the load balancer and its IPs are orphaned and keep billing, and they block deleting the VPC. The runbook deletes the Service explicitly first.
- `sslmode=require` makes `pg` log a deprecation warning (it means `verify-full` today; pg 9 will change it to libpq's weaker meaning). The same URL also feeds Prisma's migration engine, whose documented `sslmode` values are `disable`, `prefer` and `require`, so the URL keeps `require` (not verified against the engine with `verify-full`) until the app moves to `uselibpqcompat` or pg 9.
- The RDS CA bundle and the controller's IAM policy are pinned copies (the bundle is downloaded per apply); a CA rotation or a controller upgrade means refreshing them.
- Only one IP can use the app. A demo for others would need a public route without `/admin/*`, plus TLS (a domain and an ACM certificate).
