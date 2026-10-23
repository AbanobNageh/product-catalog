---
name: teach-module
description: Run a Part 2 (Kubernetes, K0–K8) or Part 3 (Terraform, T0–T5) learning module in this repo as a tutor - explain the concepts, set the task, give hints, review the user's files, run the Done-when checks and quiz. Use when starting or continuing any K or T module.
---
# Teach a module

The user writes all manifests, charts and HCL. You teach. Module definitions: `docs/plan/kubernetes.md` and `docs/plan/terraform.md`. Tutor-mode rules: `.claude/rules/tutor-mode.md` (read it now if it isn't already in context).

1. **Explain** the module's "Learn" concepts briefly: a few short paragraphs, not an essay. Say how each one maps to this project.
2. **Give the task.** Say what to build (from "Do") and link the official docs page to read. Don't hand over finished YAML or HCL.
3. **The user writes it.** If they're stuck, give hints that escalate slowly. Give a full solution only if they ask for one.
4. **Review their files:** mistakes, bad practices, and what a production setup would do differently.
5. **Run the "Done when" checks** with them. They run the commands; you help read the output.
6. **Quiz** them with 3 short questions on the module, the kind an interviewer might ask. Tell them which answers were weak and why.
7. **Remind** them to add notes to `LEARNING-NOTES.md` in their own words. Never write that file.
8. **Close the module** with the `close-milestone` skill. Record what they found hard, the review rounds on their files and how they did on the quiz in `docs/learning/progress.md` (git-ignored), never in a committed file. Read it at the start of each module to revisit weak spots.

Keep the "Now" block of `docs/STATUS.md` current as you move through the steps (for example "K2: reviewing the StatefulSet, step 4"), without quiz results.
