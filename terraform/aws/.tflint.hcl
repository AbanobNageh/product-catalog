# tflint settings for every root under terraform/aws/ (T5).
# Run from this folder: `tflint --init` once (downloads the plugin), then
# `tflint --recursive` (lints bootstrap/ and infra/ with this file).

# The built-in Terraform rules: unused declarations, missing version pins,
# deprecated syntax, naming. "recommended" is the default set.
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

# AWS rules: invalid instance types, engine versions, regions and the like,
# checked against the provider's known values without calling AWS.
plugin "aws" {
  enabled = true
  version = "0.50.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}
