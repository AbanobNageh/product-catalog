---
paths:
  - "terraform/**"
---
# Terraform pitfalls (as of late 2026; verify if unsure)

- **The Helm provider v3 changed its syntax** (for example, `kubernetes = { ... }` is now an attribute, not a block). Check the current provider docs on registry.terraform.io, not old blog posts.
- **Cost safety:** never run `apply` or `destroy` against real AWS without the user's go-ahead in that moment. `plan`, `validate`, `tflint` and `trivy config` are free. `.claude/settings.json` also makes these commands prompt.
- State (`*.tfstate`, `.terraform/`) is never committed; `.gitignore` covers it. `.terraform.lock.hcl` *is* committed.
