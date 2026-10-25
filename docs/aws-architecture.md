# AWS architecture (T5)

How `terraform/aws/` lays out product-catalog on AWS, for a reader who knows the app and the kind setup but not AWS. Decisions and their reasons: [ADR-0017](adr/0017-aws-account-state-and-managed-services.md). Commands: `AGENTS.md`, "Terraform".

Two Terraform roots:
- `terraform/aws/bootstrap/`: the S3 bucket that holds Terraform state, and a USD 10/month budget alert. Applied once; its own state lives in the bucket it created.
- `terraform/aws/infra/`: everything else on this page (75 resources). Costs about USD 0.31/h while it exists.

## 1. Where things live

The nesting, as an analogy:

| AWS term | Analogy |
|---|---|
| **AWS account** | your company: the billing and ownership boundary |
| **Region** (us-east-1, Virginia) | a city where AWS has data centres |
| **Availability zone (AZ)** | a separate building in that city, with its own power and network. One failing doesn't affect the other |
| **VPC** (Virtual Private Cloud) | your private office network, stretched across buildings |
| **Subnet** | a floor in one building, with its own rule for doors to the outside |

```
┌─ AWS account 766345100621, region us-east-1 ─────────────────────────────────────────┐
│ Regional services: run by AWS, outside your VPC, reached through AWS APIs            │
│   EKS control plane (API server, etcd)   ECR: 3 image repositories                   │
│   S3: Terraform state bucket             Secrets Manager: the DB password            │
│   Budgets: USD 10/month alert            CloudWatch Logs: EKS logs (1 day)           │
│   IAM: roles for the cluster and nodes   Identity Center: your SSO login             │
│                                                                                      │
│ ┌─ VPC 10.0.0.0/16 (your private network) ─────────────────────────────────────────┐ │
│ │ Internet gateway: the VPC's door to the internet                                 │ │
│ │                                                                                  │ │
│ │ ┌─ AZ us-east-1a ─────────────────────┐  ┌─ AZ us-east-1b ─────────────────────┐ │ │
│ │ │ PUBLIC subnet   10.0.64.0/24        │  │ PUBLIC subnet   10.0.65.0/24        │ │ │
│ │ │   NAT gateway (+ 1 public IP)       │  │   (later: the app's load balancer)  │ │ │
│ │ │                                     │  │                                     │ │ │
│ │ │ PRIVATE subnet  10.0.0.0/19         │  │ PRIVATE subnet  10.0.32.0/19        │ │ │
│ │ │   EKS node 1 (t3.medium)            │  │   EKS node 2 (t3.medium)            │ │ │
│ │ │   pods: one VPC IP each             │  │   pods: one VPC IP each             │ │ │
│ │ │                                     │  │                                     │ │ │
│ │ │ DATABASE subnet 10.0.80.0/24        │  │ DATABASE subnet 10.0.81.0/24        │ │ │
│ │ │   OpenSearch (1 node)               │  │   (spare: RDS and Valkey need       │ │ │
│ │ │   RDS Postgres  *                   │  │    subnets in 2 AZs to pick from)   │ │ │
│ │ │   Valkey        *                   │  │                                     │ │ │
│ │ └─────────────────────────────────────┘  └─────────────────────────────────────┘ │ │
│ │                                                                                  │ │
│ │ * RDS and Valkey: AWS picks 1a or 1b from their subnet group.                    │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

The node group spreads its nodes across both AZs, so with 2 nodes there is normally one per AZ.

### Subnets: three kinds

A subnet's kind comes from its **route table**, the rule for where traffic to outside addresses goes:

| Subnet | Route to the internet | Who can start a connection | What's there |
|---|---|---|---|
| **Public** | direct, through the internet gateway | the internet, if something listens | the NAT gateway; later the load balancer |
| **Private** | outbound only, through the NAT gateway | only things inside the VPC | EKS nodes and every pod |
| **Database** | none | only things inside the VPC | Postgres, Valkey, OpenSearch |

Addresses are written in **CIDR** notation: `10.0.0.0/16` is every address from 10.0.0.0 to 10.0.255.255 (65,536). A `/24` holds 256 addresses, a `/19` 8,192.

The private subnets are large because on EKS every pod gets a real VPC IP address, assigned by the **VPC CNI** add-on (the network plugin; kind used kindnet). In kind, pods had addresses on an internal network that only the cluster knew about. Here, a pod's IP is a real network address, the same kind RDS gets.

### Two gateways

- **Internet gateway:** the VPC's front door. Free. Only public subnets route through it.
- **NAT gateway:** a mail room in the public subnet. Private machines can send requests out through it (pull an image, call an AWS API) and get replies, but nobody outside can start a connection to them. USD 0.045/h plus USD 0.045/GB. There is one, in us-east-1a: if that AZ fails, us-east-1b loses outbound internet too. That's a cost choice; production uses one per AZ.

### Outside the VPC

AWS runs these regional services in its own networks; you reach them through AWS's APIs:
- **EKS control plane** (API server, etcd, scheduler), spread across AZs. It places network interfaces in the private subnets to reach the nodes. In kind, this was the `catalog-<env>-control-plane` container.
- **ECR** (images), **S3** (the state bucket), **Secrets Manager** (the Postgres password), **CloudWatch Logs**, **Budgets**, **IAM** (roles) and **IAM Identity Center** (your login).

## 2. Who talks to whom

```
① You manage the cluster
   laptop ── kubectl ──► EKS API endpoint ──► control plane ──► nodes (via its interfaces
            (your SSO     (public, but only       │               in the private subnets)
             login)        your IP gets in)       └─ access entry: "this SSO role = cluster admin"

② Nodes pull images and call AWS (outbound only)
   node (private) ──► NAT gateway (public) ──► internet gateway ──► ECR, EKS, other AWS APIs

③ The app reaches its data (never leaves the VPC)
   catalog-api pod    ── 5432 ─► RDS Postgres    ┐  each one's security group says:
   catalog-api pod    ── 6379 ─► Valkey          ├─ "allow this port, only from the
   search-service pod ── 443 ──► OpenSearch      ┘   EKS node security group"
   anything else ─────────────X  (no matching rule = dropped)

④ You reach the app (deployed by terraform/aws/app, ADR-0018)
   browser ──► Network Load Balancer (public subnets) ──► Traefik pod ──► catalog-api pod
               (accepts only admin_cidrs: your IP)        (straight to the pod's VPC IP)
```

The load balancer in ④ isn't created by Terraform. The **AWS Load Balancer Controller**, a pod in `kube-system`, sees Traefik's Service of type `LoadBalancer` and creates a Network Load Balancer for it, calling the AWS API with an IAM role it gets through **EKS Pod Identity** (the role and its association are in `infra/lb-controller.tf`). Deleting the Service deletes the load balancer, which is why the teardown deletes Traefik's Service first, while the controller still runs.

**Security groups** are the firewall in ③: each is attached to one resource and lists what may come in. They are **stateful**: a reply to an allowed request always gets out. The rules name the **node security group** instead of IP addresses. Pods use their node's group, so "from the node security group" means "from our app, wherever its pods run". That keeps working as nodes are replaced and IPs change.

**Access entries** in ① replace kind's admin key: kubectl signs each request with your SSO role, and EKS maps that role to cluster admin.

## 3. Security, layer by layer

Each layer would have to fail for something to be exposed:

| Layer | What it does here |
|---|---|
| **Network** (subnets, route tables) | Databases have no route to or from the internet. Nodes can only go out |
| **Firewall** (security groups) | Each database admits one port from one source. The EKS API endpoint admits only `admin_cidrs` |
| **Identity** (IAM, access entries) | Every AWS and kubectl call is signed with your SSO role. Nodes have their own IAM role to pull from ECR |
| **Encryption** | At rest everywhere (disks, S3, RDS, Valkey, OpenSearch, Kubernetes Secrets); TLS in transit to Valkey, OpenSearch and the API server |

Known gaps, accepted for a demo (ADR-0017): OpenSearch accepts any request that reaches it ("network only"), so any pod could read or write the index; no VPC flow logs or OpenSearch audit logs; one NAT gateway and single-AZ databases.

## 4. Every component, with its kind equivalent and cost

us-east-1 on-demand prices from the AWS Price List API, 2026-10-25.

| AWS component | What it is | In kind | USD/h |
|---|---|---|---|
| VPC, subnets, route tables, internet gateway | The private network and its traffic rules | Docker's network | free |
| NAT gateway + its public IP (Elastic IP) | Outbound-only internet for private subnets | Docker Desktop's own NAT | 0.050 |
| EKS control plane | API server, etcd, scheduler, run by AWS | `catalog-<env>-control-plane` container | 0.100 |
| Managed node group (2× t3.medium EC2) | The worker machines, with 20 GB disks | `catalog-<env>-worker` containers | 0.088 |
| EKS add-ons | vpc-cni, coredns, kube-proxy, metrics-server, eks-pod-identity-agent | kindnet, coredns, kube-proxy, our metrics-server release | free |
| Access entry | Maps your SSO role to cluster admin | the admin key in kubeconfig | free |
| ECR (3 repositories) | Private image registry | `kind load` | ~0 (USD 0.10/GB-month) |
| RDS PostgreSQL (db.t4g.micro, 20 GB) | Managed Postgres with backups and patching | `catalog-api-postgres` StatefulSet | 0.019 |
| ElastiCache for Valkey (cache.t4g.micro) | Managed Redis-compatible cache | `catalog-api-redis` Deployment | 0.013 |
| OpenSearch Service (t3.small.search, 10 GB) | Managed OpenSearch | `search-service-opensearch` StatefulSet | 0.038 |
| Security groups | Per-resource firewalls | nothing (kind's network is flat) | free |
| Secrets Manager | Holds the Postgres password RDS generated | a Kubernetes Secret | ~0.0005 |
| CloudWatch Logs | Control-plane logs, kept 1 day | `docker logs` of the control plane | ~0 |
| S3 bucket + Budgets (`bootstrap/`) | Terraform state; spend alert | MinIO; nothing | ~0 |
| **Total while `infra/` exists** | | | **~0.31** |
| Load balancer + 2 public IPs (paid deploy only) | How users reach Traefik | Traefik on host ports 80/443 | +0.04 |

A session of 3–5 hours costs about USD 1.50–2.50. Forgotten, it's about USD 8 a day or USD 250 a month; the budget alert is the backstop, not a guard (billing data updates a few times a day).

**What managed services change:** in kind you ran Postgres, Redis and OpenSearch as pods, with their volumes, upgrades and restarts. On AWS they're API objects you configure, and AWS runs the servers. You trade control and money for not running them yourself, and the cluster is left running only the two services and Traefik.

## Glossary

- **AMI:** Amazon Machine Image, the disk image an EC2 instance boots from. The nodes use Amazon Linux 2023, EKS-optimised.
- **Add-on (EKS):** a cluster component that EKS installs and updates for you.
- **Access entry:** maps an IAM identity to Kubernetes permissions in EKS.
- **CIDR:** an IP address range written as a base address and a prefix length (`10.0.0.0/16`).
- **Elastic IP:** a fixed public IPv4 address. Every public IPv4 costs USD 0.005/h.
- **IAM role:** a set of permissions that a person (through SSO) or a service (EKS, the nodes) can assume, getting temporary credentials.
- **Managed node group:** EC2 instances that EKS launches, joins to the cluster and replaces one at a time on upgrades.
- **Replication group (ElastiCache):** one Valkey primary plus optional replicas; here, just the primary.
- **Route table:** the per-subnet rule for where traffic to outside addresses goes.
- **Security group:** a stateful firewall attached to a resource.
- **Service-linked role:** an IAM role a service uses on your behalf; OpenSearch needs one to place network interfaces in the VPC.
- **Subnet group:** the subnets a managed database may run in.
