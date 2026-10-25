# RDS for PostgreSQL: AWS runs the database server, its disk, backups and
# minor upgrades. Replaces the Postgres StatefulSet.

# A security group: a stateful firewall attached to a resource (here, the
# database's network interface). It starts with no rules, so nothing gets in.
resource "aws_security_group" "postgres" {
  name        = "${local.name}-postgres"
  description = "PostgreSQL: accepts 5432 from the EKS nodes only"
  vpc_id      = module.vpc.vpc_id
}

# One rule: port 5432 from anything in the EKS node security group. Pods use
# their node's security group, so this admits the app and nothing else.
# Referencing a group instead of an IP range keeps working as nodes change.
# No egress rule is needed: security groups are stateful, so replies to
# allowed requests always get out.
resource "aws_vpc_security_group_ingress_rule" "postgres_from_nodes" {
  security_group_id            = aws_security_group.postgres.id
  description                  = "PostgreSQL from EKS nodes"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = module.eks.node_security_group_id
}

# trivy:ignore:
# - AWS-0176 (IAM database authentication): the app logs in with a password
#   from DATABASE_URL; IAM auth needs short-lived tokens generated in code.
# - AWS-0133 (Performance Insights): a monitoring extra a demo doesn't need.
# - AWS-0177 (deletion protection): off so `destroy` works in the same session.
# - AWS-0077 (backups kept 1 day): the database lives for one session.
#trivy:ignore:AWS-0077
#trivy:ignore:AWS-0176
#trivy:ignore:AWS-0133
#trivy:ignore:AWS-0177
resource "aws_db_instance" "postgres" {
  identifier = local.name

  engine = "postgres"
  # Major version only: RDS picks the newest 18.x (18.6 on 2026-10-25) and
  # applies minor upgrades itself, as allowed below.
  engine_version             = "18"
  auto_minor_version_upgrade = true

  # The smallest Graviton (ARM) instance: 2 vCPU (burstable), 1 GiB. The app
  # doesn't care about the server's CPU architecture.
  instance_class = "db.t4g.micro"

  # 20 GB of gp3 SSD, encrypted at rest with the AWS-managed RDS key.
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  # Not "catalog" as locally: RDS for PostgreSQL rejects it ("a reserved word for this
  # engine"). The session runbook reads this name from the postgres_database output.
  db_name  = "product_catalog"
  username = "catalog"
  # RDS generates the password and keeps it in Secrets Manager (ADR-0017):
  # it never appears in Terraform state. Read it with the secret ARN from
  # the outputs.
  manage_master_user_password = true

  # In the database subnets (no route out), reachable only through the
  # security group above, never from the internet.
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  publicly_accessible    = false
  # One AZ: a standby replica in a second AZ (multi_az) doubles the cost.
  multi_az = false

  # Automated daily backups, kept 1 day (the minimum that keeps them on).
  backup_retention_period = 1
  # Teardown in the same session: no protection, no final snapshot.
  deletion_protection = false
  skip_final_snapshot = true
  # Apply changes now rather than in the next maintenance window.
  apply_immediately = true

  # Note: PostgreSQL 15+ on RDS requires TLS (rds.force_ssl = 1), so the
  # app's DATABASE_URL will need `?sslmode=require`.
}
