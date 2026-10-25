---
paths:
  - "terraform/**"
---
# Terraform pitfalls (as of late 2026; verify if unsure)

- **Cost safety:** never run `apply` or `destroy` against real AWS without the user's go-ahead in that moment. `plan`, `validate`, `tflint` and `trivy config` are free. `.claude/settings.json` also makes these commands prompt.