# Product Catalog

@AGENTS.md
@docs/STATUS.md

## Claude Code notes
- Path-scoped rules in `.claude/rules/` load when you read or edit files under `services/`, `k8s/`, `charts/` or `terraform/`.
- At each "Done when" check, invoke the `close-milestone` skill.
- Plans written by planning skills (for example superpowers `writing-plans`) go in `docs/milestones/` as `YYYY-MM-DD-<id>-plan.md`, not in the skill's default folder.
- When compacting, preserve: the current milestone, the next step, open review findings, and any unchecked "Done when" items.
