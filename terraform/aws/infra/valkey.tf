# ElastiCache for Valkey: a managed, Redis-compatible cache (ADR-0017).
# Replaces the Redis Deployment.

resource "aws_security_group" "valkey" {
  name        = "${local.name}-valkey"
  description = "Valkey: accepts 6379 from the EKS nodes only"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "valkey_from_nodes" {
  security_group_id            = aws_security_group.valkey.id
  description                  = "Valkey from EKS nodes"
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  referenced_security_group_id = module.eks.node_security_group_id
}

# ElastiCache's own subnet group (RDS's can't be shared): the database subnets.
resource "aws_elasticache_subnet_group" "valkey" {
  name       = "${local.name}-valkey"
  subnet_ids = module.vpc.database_subnets
}

# A replication group is ElastiCache's unit for Redis/Valkey: one primary
# node plus optional replicas. Here, just the primary.
resource "aws_elasticache_replication_group" "valkey" {
  replication_group_id = local.name
  description          = "product-catalog cache (catalog-api)"

  engine         = "valkey"
  engine_version = "9.1"
  # The smallest Graviton node: 2 vCPU (burstable), 0.5 GiB.
  node_type          = "cache.t4g.micro"
  num_cache_clusters = 1
  port               = 6379

  subnet_group_name  = aws_elasticache_subnet_group.valkey.name
  security_group_ids = [aws_security_group.valkey.id]

  # Encrypted on disk and on the wire. In-transit encryption means TLS, so
  # the app connects with rediss:// (the TLS form of redis://).
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  # No replica, so nothing to fail over to.
  automatic_failover_enabled = false
  multi_az_enabled           = false

  # No snapshots: a cache holds nothing that can't be rebuilt from Postgres.
  snapshot_retention_limit = 0
  apply_immediately        = true
}
