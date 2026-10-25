variable "aws_account_id" {
  description = "The 12-digit AWS account this root may change (allowed_account_ids). Set it in terraform.tfvars."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be 12 digits."
  }
}

variable "aws_profile" {
  description = "Named profile in %USERPROFILE%\\.aws\\config (IAM Identity Center)."
  type        = string
  default     = "catalog-aws"
}

variable "region" {
  description = "AWS region for the bucket (ADR-0017)."
  type        = string
  default     = "us-east-1"
}

variable "budget_email" {
  description = "Where budget alerts go. Set it in terraform.tfvars (git-ignored)."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.budget_email))
    error_message = "budget_email must be an email address."
  }
}

variable "budget_limit_usd" {
  description = "Monthly budget in USD. Alerts fire at 50% and 100% of actual spend and 100% of forecast."
  type        = number
  default     = 10
}
