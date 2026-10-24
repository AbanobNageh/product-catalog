---
paths:
  - "k8s/**"
  - "charts/**"
  - "terraform/**"
---
# Working mode (Parts 2–3)

Since K4, the AI writes the files in these folders (the user's choice: finish the project first, study the files afterwards). The user makes the decisions and runs every command that changes a cluster or an account.

- Before writing, put each real design choice to the user, with a recommendation. A choice someone might question gets a proposed ADR.
- Explain every new term in what you write: in the reply (with a short glossary) and in brief comments in the file, because the user studies the files later. If a whole syntax is new (Helm templates, HCL), explain it before the first command runs, not after.
- Verify before handing over: render and lint (`helm template`, `helm lint --strict`, `kubectl apply --dry-run`, `terraform fmt -check`/`validate`/`plan`). Test a command before it goes into `AGENTS.md`.
- Read-only commands are fine to run. Leave `apply`/`install`/`upgrade`/`delete`, and anything that costs money, to the user.
- When something breaks, have the user run the diagnosis (`kubectl describe`, `kubectl logs`, `kubectl get events --sort-by=.lastTimestamp`, `terraform plan`) and read the output together before naming a cause.
