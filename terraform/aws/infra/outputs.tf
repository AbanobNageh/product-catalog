output "cluster_name" {
  description = "The EKS cluster's name."
  value       = module.eks.cluster_name
}

output "vpc_id" {
  description = "The VPC, for the AWS Load Balancer Controller (terraform/aws/app finds it by tag)."
  value       = module.vpc.vpc_id
}

output "kubeconfig_command" {
  description = "Adds this cluster to your kubeconfig as a new context (after an apply)."
  value       = "aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${var.region} --profile ${var.aws_profile} --alias ${local.name}-aws"
}

output "ecr_repository_urls" {
  description = "Where to push each image (docker tag + docker push)."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

output "postgres_endpoint" {
  description = "RDS host:port for DATABASE_URL."
  value       = aws_db_instance.postgres.endpoint
}

output "postgres_engine_version" {
  description = "The exact PostgreSQL version RDS chose."
  value       = aws_db_instance.postgres.engine_version_actual
}

output "postgres_password_secret_arn" {
  description = "Secrets Manager secret holding the generated password (aws secretsmanager get-secret-value --secret-id <arn>)."
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
}

output "valkey_endpoint" {
  description = "Valkey primary endpoint for REDIS_URL (rediss://<this>:6379)."
  value       = aws_elasticache_replication_group.valkey.primary_endpoint_address
}

output "opensearch_endpoint" {
  description = "OpenSearch endpoint for OPENSEARCH_URL (https://<this>)."
  value       = aws_opensearch_domain.this.endpoint
}
