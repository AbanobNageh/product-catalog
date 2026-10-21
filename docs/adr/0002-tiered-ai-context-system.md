# 0002. Tiered AI context system

- **Status:** Accepted, as an experiment (review at the end of Part 1)
- **Date:** 2026-10-21

## Context
The AI assistant needs full project context in every session: what we're building, who writes what, the rules, and where we are. That context must stay current as milestones progress, without filling the context window. The original setup was a single 445-line `PLAN.md` (instructions, spec, curricula and progress mixed together) and a `CLAUDE.md` that told the model in prose to read it. Claude Code doesn't load `/docs` automatically, and a prose "read this file" instruction is only followed if the model decides to. Part of the project's purpose is to show how I work with LLMs.

## Considered options
1. **A single `/docs` directory** plus "read PLAN.md first" in `CLAUDE.md`.
2. **A memory bank** (Cline/Roo style): about six files the AI must read in full at the start of every task.
3. **A spec-driven framework** (GitHub Spec Kit, Kiro specs, BMAD, OpenSpec).
4. **Tiered by load time:** a short always-loaded `AGENTS.md` and `docs/STATUS.md`; path-scoped `.claude/rules/`; skills for multi-step procedures; spec, curricula, ADRs and milestone notes in `docs/`, read on demand; permission rules for the things that must never happen.

## Decision
**Option 4.** Research ([report](../research/2026-10-21-ai-context-structures/report.md)) found:
- context files barely change task success,
- agents reliably follow *specific, non-obvious* instructions,
- overviews don't help, and
- compliance decays with session length more than with file size.

So the value here is process control and continuity. Option 4 keeps the always-loaded part small and puts the tutor rules exactly where they apply. Option 2 loads everything every time and drifts. Option 3 is too much ceremony for one person, and in Parts 2–3 its generated task lists would hand over the very solutions I'm meant to write.

## Consequences
- Good: a small, deterministic always-on context. Progress claims are checkable (each tick has a commit hash). Each file has one owner and one edit rule. Works across tools through `AGENTS.md`.
- Bad: more files to know about. Path-scoped rules don't load until a matching file is touched, so the `teach-module` skill and a line in `AGENTS.md` cover the start of each module. It needs periodic pruning, or the always-loaded tier grows back.
- The experiment log in `docs/ai-workflow.md` records what works and what doesn't, milestone by milestone.

## Revisit when
At the end of Part 1 (after 1.5), using the experiment log.
