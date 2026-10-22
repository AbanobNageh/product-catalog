# How this project works with an AI assistant

This repo is built with an AI coding assistant (Claude Code). The split is deliberate:
- **Part 1 (the app):** the AI wrote the code, milestone by milestone, and I reviewed each milestone before it was accepted.
- **Parts 2–3 (Kubernetes, Terraform):** I wrote every manifest, chart and HCL file myself. The AI acted as tutor and reviewer.

This page explains the context system that keeps the assistant on track across many sessions. The reasoning is in [ADR-0002](adr/0002-tiered-ai-context-system.md), and the research behind it is in [research/](research/2026-10-21-ai-context-structures/report.md). **It's an experiment.** The log at the bottom records how it went.

## The idea: organise context by *when it loads*
Every token loaded into the model's context costs attention, so only the things needed every time are loaded every time.

| Tier | Files | When the model sees it |
|---|---|---|
| Always | `AGENTS.md` (role split, rules, session routine, map), `docs/STATUS.md` (where we are), both imported by `CLAUDE.md` | Every session, at launch |
| Path-scoped | `.claude/rules/*.md`: tutor mode and pitfalls for `k8s/`, `charts/`, `terraform/`; conventions for `services/` | Only when a matching file is read or edited |
| Procedures | `.claude/skills/teach-module`, `.claude/skills/close-milestone` | The description is always visible; the body loads when invoked |
| On demand | `docs/plan/*` (spec and curricula), `docs/adr/`, `docs/milestones/`, `docs/research/` | When the routine or a task says to read them |
| Enforced | `.claude/settings.json`: `terraform apply/destroy`, `aws`, cluster, volume and namespace deletes always prompt | Always; enforced by the tool, not by the model |

## Ownership: one owner and one edit rule per file
- **Me:** `AGENTS.md`, `CLAUDE.md`, `.claude/`, `PLAN.md`, `docs/plan/`. The AI proposes changes and applies them only after I approve.
- **The AI:** `docs/STATUS.md`. It rewrites the "Now" block; the checklist is tick-only, and each tick carries a date, the commit hash and a link to the milestone note. It also writes `docs/milestones/` notes, which are frozen once committed.
- **Append-only:** `docs/adr/`. A changed decision gets a new ADR that supersedes the old one.
- **Me only:** `LEARNING-NOTES.md`, written in my own words.

## Session routine
1. **Start:** the assistant reads `git log`, reads the current milestone's spec, restates where we are in 3 lines, and smoke-checks anything already running.
2. **Work:** one milestone or module per session. Gaps in the spec become `[NEEDS CLARIFICATION]` questions, not guesses.
3. **Close** (`close-milestone` skill): verify the "Done when" checks with evidence → tour and review → milestone note (including what I caught and corrected) → commit → tick STATUS → one line in the experiment log.
4. **Between milestones:** `/clear`, so the next session starts fresh from the files on disk.
5. **End of each Part:** prune the always-loaded files.

## Experiment log
One line per milestone: what the context system helped with, or got wrong.

| Date | Milestone | Observation |
|---|---|---|
| 2026-10-21 | 1.1 | The system was built during this milestone, so no fresh session has used it yet. The user's review caught two flaws in its first version: a personal profile in the shared `AGENTS.md`, and commands placed in a Claude-only rules file. |
| 2026-10-21 | 1.2 | Helped: after `/clear`, "let's continue" was enough for the session to restate the right milestone and next step from `STATUS.md`. ADR-0003's "verify the current Prisma setup" line prompted version research that caught NestJS 12, the Prisma 8 RC on npm `latest` and the TypeScript 7 incompatibility before any code was written. The "don't guess at gaps" rule surfaced the 60s-search-cache vs "within a second" conflict at plan time. Missed: the AI didn't observe the path-scoped `services.md` rule loading (to be checked with `/memory`). The fresh reviewer's suggested Redis-timeout fix (`commandOptions.timeout`) was wrong, and only a live test caught it: the real hang was 187s, and the option has no effect once a command is on the socket. |
| 2026-10-22 | 1.3 | Helped: after a context compaction (not a `/clear`), "let's continue" picked up 1.3 from `STATUS.md` correctly. The path-scoped `services.md` rule was seen loading the moment a `services/` file was read, which answers the 1.2 open question. The "prefer current versions, warn when outdated" rule led to research that caught opensearch-go v5 replacing the spec's v4, and `opensearch:latest` pointing at 2.19. Giving the plan reviewer the downloaded library source let it find 7 plan defects before any code existed. Missed: the Done-when commands named their working directory only in prose, so the user's curl failed on a relative path. Commands now include `Set-Location`. |
