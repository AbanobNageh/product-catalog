---
name: close-milestone
description: Close a Part 1 milestone (1.1–1.5) or a Part 2–3 module (K0–K8, T0–T5) in this repo - verify the Done-when checks, write the milestone note, propose the commit, tick docs/STATUS.md and log the experiment. Use when a milestone's work is finished and it's time for its Done-when check.
---
# Close a milestone or module

Do the steps in order. Stop at any failed check.

1. **Verify "Done when".** Take each item from the milestone's section in `docs/plan/` and show evidence: command output, test results, or what the user confirmed. If anything fails, say so plainly, update "Now" in `docs/STATUS.md`, and stop. It isn't done.
2. **Part 1 only, the tour:** list the files built and the key decisions, briefly enough that the user could repeat it in an interview. Wait for their review. Every change they ask for is a review finding.
3. **Write the note** at `docs/milestones/YYYY-MM-DD-<id>-<slug>.md` (for example `2026-10-22-1.1-repo-scaffold.md`):
   ```markdown
   # <id> <title>
   - Date: YYYY-MM-DD · Commits: <short hashes>
   ## What was built
   ## Decisions (link ADRs)
   ## Review findings and corrections   <!-- what the user caught, and what changed as a result -->
   ## Parts 2–3 only: what was hard, quiz questions and how they went
   ## Follow-ups
   ```
   Be honest in "Review findings". This section is the portfolio evidence that the user reviewed the AI's work.
4. **Commit.** Propose the commit message (Conventional Commits style, with the co-author trailer) and commit only after the user says yes. Then commit the note and the STATUS update separately as `docs: close <id>`.
5. **Update `docs/STATUS.md`.** Tick the item: `[x] <id> <title> · YYYY-MM-DD · <short hash of the work commit> · [note](milestones/<file>.md)`. Rewrite "Now" to point at the next milestone. Don't touch other checklist items.
6. **Experiment log:** add one line to the log in `docs/ai-workflow.md` saying what the context system helped with or got wrong during this milestone.
7. **Remind** the user to update `LEARNING-NOTES.md`, and suggest `/clear` before the next milestone.
8. **End of a Part (after 1.5, K7/K8, T5):** propose cuts to `AGENTS.md` and `.claude/rules/`. Cut any line the model would follow anyway or that the code now shows. The user approves each cut.
