# Memory Banks and Plan/Progress-File Patterns for AI Coding Assistants

Research date: 2026-10-21. Source dates are given where the page showed one. "Undated" means the page showed no date.

## Cline Memory Bank, Roo Code variants and community forks: file structure and read/update protocol

### Takeaway
The Cline Memory Bank is a methodology, not a built-in feature. It is a `memory-bank/` folder of six Markdown files arranged in a hierarchy (stable brief, then context files, then volatile `activeContext.md` and `progress.md`), plus a custom instruction that the AI must read every file at the start of every task. Roo Code community forks keep the idea, add a `decisionLog.md`, and attach per-mode update triggers. Practitioners say the weak points are manual upkeep, staleness, and the cost of reading everything every time.

### Cited Findings
- **Cline core files** (docs page, undated) [Cline Docs: Memory Bank](https://docs.cline.bot/prompting/cline-memory-bank):
  - `projectbrief.md`: "Foundation document with core requirements and goals"; "Source of truth for project scope"; created at project start if missing.
  - `productContext.md`: "Why the project exists, problems it solves, UX goals".
  - `activeContext.md`: "Current focus, recent changes, next steps (updates most frequently)".
  - `systemPatterns.md`: "Architecture, design patterns, component relationships".
  - `techContext.md`: "Tech stack, setup, constraints, dependencies".
  - `progress.md`: "What works, what's left, known issues".
- Hierarchy (from the page's figure caption): `projectbrief.md` feeds `productContext.md`, `systemPatterns.md` and `techContext.md`, and those feed `activeContext.md` and `progress.md`. Optional extra files or folders can go inside `memory-bank/` for complex features, integrations, APIs, testing or deployment. [Cline Docs](https://docs.cline.bot/prompting/cline-memory-bank)
- Read protocol, quoted from the custom instructions: "I MUST read ALL memory bank files at the start of EVERY task - this is not optional." The stated reason is that after each reset Cline relies entirely on the Memory Bank. [Cline Docs](https://docs.cline.bot/prompting/cline-memory-bank)
- Update triggers: (1) discovering new project patterns, (2) completing significant changes, (3) the user saying **"update memory bank"**, which requires reviewing ALL files, and (4) when context needs clarification. The page also recommends updating after milestones or direction changes, and updating `activeContext.md` after each session. "Update memory bank" "Triggers a full documentation review and update." [Cline Docs](https://docs.cline.bot/prompting/cline-memory-bank)
- Cline describes Memory Bank as a methodology that works across tools ("Commands may differ but the approach works across tools"). It is installed as custom instructions or Cline Rules, and conditional rules can limit activation to `memory-bank/` files. The page suggests leaving routine context management to Auto Compact and saving manual updates for important checkpoints. [Cline Docs](https://docs.cline.bot/prompting/cline-memory-bank)
- Cline's blog presents it as an answer to context limits, built from linked Markdown files (projectbrief, activeContext, progress, and others). [Cline blog: Memory Bank](https://cline.bot/blog/memory-bank-how-to-make-cline-an-ai-agent-that-never-forgets)
- **Roo Code Memory Bank** (GreatScottyMac, Apache 2.0, about 1.7k stars, page undated) [GitHub: roo-code-memory-bank](https://github.com/GreatScottyMac/roo-code-memory-bank):
  - Files: `activeContext.md` (current goals, decisions, session state), `productContext.md` (high-level project context), `progress.md` (completed work and upcoming tasks), `decisionLog.md` (architectural choices and their reasoning), `systemPatterns.md` (optional; recurring patterns and standards), and `projectBrief.md` (optional; initial requirements, placed in the project root before initialization).
  - Per-mode triggers: Architect (architectural decisions, pattern definitions, structure changes), Code (code changes, feature updates), Ask (knowledge requests, documentation needs), Debug (bug discoveries, error patterns). Every mode updates `activeContext.md`, `progress.md` and `decisionLog.md`.
  - **"UMB"** ("update memory bank") is a manual fallback when a session ends unexpectedly, work stops mid-task, or a full sync is needed.
  - The README now promotes a newer project, "Context Portal MCP" (a database/MCP-backed memory). The page does not call it a replacement.
- `decisionLog.md` entries are described as structured into context, decision, rationale and implementation. [RooFlow / Roo Memory Bank docs via Algolia DocSearch](https://docsearch.algolia.com/mcp/docs/repo/greatscottymac/roo-code-memory-bank)
- **RooFlow** (fork by the same author) builds on the Memory Bank with a more integrated system of modes. It calls itself "experimental" ("use with caution"), and the Roo Code project does not endorse it. Sending "hello" in Architect or Code mode initializes the memory files, and Roo asks for approval before each write. [RooFlow docs](https://docsearch.algolia.com/mcp/docs/repo/greatscottymac/rooflow); [GitHub mirror: alarno/RooFlow](https://github.com/alarno/RooFlow)

### Inferences
- The design has three useful ideas: (a) separate stable files (brief, product, tech, patterns) from volatile ones (activeContext, progress); (b) keep one "current focus / next steps" file that changes most often; (c) use a single verbal command ("update memory bank") as a forced sync point.
- The "read ALL files every task" rule causes much of the bloat. It made sense for Cline in 2024–25, which had no auto-loaded instruction file. In Claude Code, CLAUDE.md is loaded automatically, so stable context can live there and volatile files can be read on demand.
- Roo's `decisionLog.md` is the most worthwhile addition for a learning project, because it records *why* choices were made, and that is portfolio and interview material.

### Gaps
- I could not confirm the "[MEMORY BANK: ACTIVE]" status-prefix convention that some Roo forks are said to use. The fetched README did not mention it.
- I could not establish a link between "GosuCoder" and any memory bank variant.
- The Cline docs page has no date, so I could not pin down when the current wording was written. The original Memory Bank prompt dates from about early 2025, but I did not verify that against a primary source here.

## Anthropic's guidance for long-running agents and Claude Code's built-in mechanisms

### Takeaway
Anthropic's main pattern ("Effective harnesses for long-running agents", 2025-11-26) has five parts: a one-time initializer session, a JSON feature list whose only editable field is `passes`, a free-text `claude-progress.txt` log, an `init.sh` boot script, and a git commit at the end of every session. Each new session follows a fixed start routine. Claude Code itself provides CLAUDE.md (instructions you write, loaded every session, under 200 lines recommended), auto memory (notes Claude writes, a `MEMORY.md` index capped at 200 lines / 25KB), plan mode, `/compact` and `/clear`, checkpoints and rewind, and `--continue` / `--resume`.

### Cited Findings
- **Effective harnesses for long-running agents**, Justin Young, Anthropic Engineering, 2025-11-26 [Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents):
  - The *initializer agent* (first session, special prompt) creates `init.sh`, a progress log (`claude-progress.txt`) and an initial git commit. Every later session is a *coding agent* that makes incremental progress and leaves structured updates. The two differ only in their initial prompt.
  - The feature list had over 200 features in a claude.ai-clone example, all starting as failing. Example entry: `{"category":"functional","description":"New chat button creates a fresh conversation","steps":[...],"passes":false}`. Agents may change only `passes`: "It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality."
  - Why JSON rather than Markdown: "the model is less likely to inappropriately change or overwrite JSON files compared to Markdown files."
  - Session start routine: `pwd`, read the git log and progress file, read the feature list and pick the highest-priority unfinished feature, run `init.sh`, and run a basic end-to-end test *before* new work.
  - Observed failures: one-shotting the app and running out of context mid-feature; declaring victory too early, including later agents seeing progress and stopping; leaving broken or undocumented state; marking features done without real testing; wasting time working out how to run the app. The fixes were working on one feature at a time, a full feature list, a commit plus progress note every session, a smoke test at session start, browser-automation self-verification, and `init.sh`.
- **Effective context engineering for AI agents**, Anthropic, 2025-09-29 [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):
  - "Context rot": "the model's ability to accurately recall information from that context decreases" as the context grows.
  - "Just in time" context: keep lightweight references ("file paths, stored queries, web links") and load the content when it is needed.
  - "Structured note-taking": the agent "regularly writes notes persisted to memory outside of the context window". Examples are Claude Code's to-do lists and a `NOTES.md`. In the Pokémon example, the agent keeps tallies, maps and strategy notes across context resets.
  - Compaction: summarize a conversation that is near the limit and start a new window from the summary. Clearing old tool results is "one of the safest lightest touch forms of compaction." Sub-agents return condensed summaries (1,000–2,000 tokens).
- **Claude prompting best practices, "Workflows across multiple context windows"** (current platform docs, undated) [Claude Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices):
  - "Use a different prompt for the very first context window" to set up a framework, then "iterate on a todo-list" in later windows.
  - Keep tests in structured form (`tests.json`). Use "unstructured text for progress notes" (`progress.txt`). "Use structured formats for state data". "Use git for state tracking".
  - On starting fresh versus compacting: "Claude's latest models are extremely effective at discovering state from the local filesystem." Suggested start prompts: "Call pwd…", "Review progress.txt, tests.json, and the git logs.", "Manually run through a fundamental integration test before moving on…".
  - Example `progress.txt`: "Session 3 progress: - Fixed authentication token validation … - Next: investigate user_management test failures (test #2) - Note: Do not remove tests…"
- **Claude Code memory docs** (current) [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory):
  - Two systems. CLAUDE.md is written by you, contains instructions and rules, and is loaded every session. Auto memory is written by Claude, contains learnings, and is loaded every session ("first 200 lines or 25KB"). Both are "context, not enforced configuration". Hooks are the way to enforce behavior.
  - CLAUDE.md "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence." `@path` imports organize content "but don't reduce its context cost". Path-scoped `.claude/rules/*.md` files (with a `paths:` frontmatter) load only when matching files are touched. AGENTS.md is read when there is no CLAUDE.md, or it can be imported with `@AGENTS.md`. Symlinks are discouraged on Windows.
  - Auto memory lives at `~/.claude/projects/<project>/memory/`, with a `MEMORY.md` index ("one line per memory, loaded into every session") and topic files read on demand. Memory types are `user`, `feedback`, `project` ("ongoing work, deadlines, and decisions that Claude can't derive from the code or git history") and `reference`. Claude "skips anything it can derive from the codebase" and anything CLAUDE.md already says. When `MEMORY.md` approaches its limit, Claude Code tells Claude to "keep one line per entry, move detail into topic files, and merge or drop stale entries." A `modified` ISO timestamp is recorded in the frontmatter. Toggle it with `/memory` or `autoMemoryEnabled`. It is machine-local.
- **Claude Code best practices** (current) [code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices):
  - Explore, then plan (plan mode via Shift+Tab; Ctrl+G edits the plan), then implement, then commit. "If you could describe the diff in one sentence, skip the plan."
  - Interview-to-spec: "Keep interviewing until we've covered everything, then write a complete spec to SPEC.md." Then "start a fresh session to execute it."
  - Context: `/clear` between unrelated tasks. `/compact <instructions>`. CLAUDE.md can steer compaction ("When compacting, always preserve the full list of modified files and any test commands"). `/rewind` checkpoints are "not a replacement for git". `claude --continue` / `--resume`, and `/rename` to name sessions "like branches".
  - CLAUDE.md exclusions include "Information that changes frequently" and "File-by-file descriptions of the codebase". "For each line, ask: 'Would removing this cause Claude to make mistakes?' If not, cut it." "Treat CLAUDE.md like code: review it when things go wrong, prune it regularly".
  - Named failure patterns: the "kitchen sink session", "correcting over and over" (clear after two failed corrections), "the over-specified CLAUDE.md", the "trust-then-verify gap", and "infinite exploration".
  - Adversarial review against the plan: "Use a subagent to review the rate limiter diff against PLAN.md. Check that every requirement is implemented…"
  - Verification gates: `/goal` conditions, Stop hooks, verification subagents.

### Inferences
- Anthropic's guidance splits state into three kinds by format: **structured, append-or-flip-only state** (JSON feature or test list), **freeform narrative** (progress.txt), and **ground truth** (git history and a runnable smoke test). The JSON-versus-Markdown finding argues for keeping the milestone checklist in a format the AI is told it may only tick, not rewrite.
- Claude Code's own docs place volatile state ("Information that changes frequently") *outside* CLAUDE.md. Progress belongs in a separate file that is read at session start, or in auto memory's `project` type, not in the always-loaded instruction file.
- The "fresh window + read state from disk" approach is officially preferred over relying on compaction for multi-session work. That supports a short "session start ritual" written into the instructions.

### Gaps
- I did not fetch Claude Code's docs pages on todo lists/Tasks or `/goal`, so this section has no details on Claude Code's built-in task-list persistence across sessions.
- Addy Osmani's 2026 post mentions an Anthropic follow-up that uses full context resets rebuilt from a handoff file (see the next section). I did not fetch that Anthropic primary source.

## Popular plan/progress conventions (PLAN.md, TODO/PROGRESS, per-task plan files, spec → plan → todo, handoffs)

### Takeaway
Practitioners' conventions follow the same pipeline: a **spec** (what and why), then a **plan** broken into small, testable, ordered steps, then a **checklist or progress log** the agent ticks off, plus git commits as checkpoints. They differ in where the files live (one root PLAN.md versus dated per-feature plan files) and in format (Markdown checkboxes versus JSON versus a real issue tracker such as Beads).

### Cited Findings
- **Harper Reed, "My LLM codegen workflow atm", 2025-02-16** [harper.blog](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/):
  - Files in the repo: `spec.md` (from idea honing), `prompt_plan.md` (step-by-step prompts), `todo.md` (checklist).
  - The idea-honing prompt has the LLM "Ask me one question at a time", then compile a "developer-ready specification". The planning prompt (a reasoning model) asks for a "detailed, step-by-step blueprint" in small iterative chunks that "end with wiring things together" with no "orphaned code". There are TDD and non-TDD variants. The todo prompt: "Can you make a `todo.md` that I can use as a checklist? Be thorough."
  - The codegen tool checks items off `todo.md` as it works, which keeps state across sessions.
  - Caveats: success "really depends on how well step 2 went"; it is easy to get "over my skis" (the process outpaces your understanding), so he recommends checking against the plan and testing; the tools are "single player"; brownfield context gets too big.
- **obra/superpowers `writing-plans` skill** (GitHub main, page undated) [SKILL.md](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md):
  - Plans are saved to `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`; user preferences override this. Older write-ups cite `docs/plans/YYYY-MM-DD-…`, but the current default is the `docs/superpowers/plans/` path.
  - Required header: `# [Feature Name] Implementation Plan`, a blockquote naming the execution sub-skill and stating that steps use `- [ ]` checkboxes, then `**Goal:**`, `**Architecture:**`, `**Tech Stack:**`, `**Spec:**` (path to the spec), `## Global Constraints` (copied verbatim from the spec) and `## Review Focus`.
  - "Each step is one action with a checkable result". Step cycle: write a failing test, run it, implement, run it, commit. Each task lists Files (Create/Modify/Test) and Interfaces (Consumes/Produces). "A task is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate." "A plan longer than the code it describes has written the code instead."
  - Handoff: the human reviews the plan before implementation, then chooses subagent-driven execution (fresh subagent and reviewer per task) or native in-session execution.
- **Addy Osmani, "How to write a good spec for AI agents"** [addyosmani.com](https://addyosmani.com/blog/good-spec/) (also republished on [O'Reilly Radar](https://oreilly.com/radar/how-to-write-a-good-spec-for-ai-agents)): have the agent draft a spec from a short goal and save it as `SPEC.md` so it persists across sessions; have it question you about ambiguities; review the plan before execution; avoid dumping a huge spec because of the model's "attention budget"; split work into smaller tasks. (Details are from the search summary; I did not fetch the full article.)
- **Addy Osmani, "Long-running agents", 2026-04-28** [addyosmani.com](https://addyosmani.com/blog/long-running-agents):
  - It surveys a set of files: `prd.json` (Ralph-loop task list; "itself is amnesiac, but the filesystem isn't"), `feature-list.json` plus `init.sh` (Anthropic), a living plan file or CLAUDE.md, `progress.txt`/`claude-progress.txt`/`CHANGELOG.md` as "append-only lab notes", `AGENTS.md` as a rolling rulebook ("short, every line earned by a real failure"), a **done-condition file** (testable completion criteria so the agent can't redefine "done"), a **handoff file** for rebuilding after full context resets, and a session event log.
  - "Summarization alone was not enough for very long jobs", so Anthropic used full context resets rebuilt from a handoff file (Osmani's summary of Anthropic's work).
- **Ralph loop** (as summarized by third parties): a bash loop re-runs the agent; `prd.json` is the plan, `progress.txt` the lab notes, `AGENTS.md` the rolling rulebook. [Sid Bharath: Ralph Wiggum](https://sidbharath.com/blog/ralph-wiggum-claude-code/); [Addy Osmani](https://addyosmani.com/blog/long-running-agents)
- **Steve Yegge, Beads** (Medium intro post [steve-yegge.medium.com](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a); package [pkg.go.dev](https://pkg.go.dev/github.com/steveyegge/beads@v0.11.0)): a git-backed issue tracker (`bd` CLI, JSONL in `.beads/` plus a SQLite cache) built to *replace* Markdown plans. Its argument is that agents only know what is on disk, and a pile of conflicting or obsolete plan documents confuses them. Plan files lack dependencies, priority and any compaction strategy. The agent queries for the highest-priority unblocked work at session start and files newly discovered work as issues. It is alpha. (These points come from search summaries of these pages plus a third-party write-up, [morphllm.com](https://www.morphllm.com/beads-agent-memory). The claim that Beads inspired Claude Code Tasks is unverified.)
- Anthropic's Claude Code docs use `PLAN.md` and `SPEC.md` by name in examples: a spec interview written to SPEC.md, and review "against PLAN.md". [Claude Code best practices](https://code.claude.com/docs/en/best-practices)

### Inferences
- Three placements are common:
  1. **A single root file** (PLAN.md or todo.md), which is simple and suits solo projects.
  2. **Dated per-feature plan files** (superpowers), which give a natural archive because each plan is frozen once done.
  3. **Structured trackers** (feature-list JSON, prd.json, Beads), which resist rewriting and suit autonomous runs.
- For a solo learning project with human review at each milestone, option 1 or a hybrid (root PLAN.md for the roadmap plus short dated per-milestone notes) is enough. Beads-level tooling is overkill.
- The "done-condition file" and superpowers' "Global Constraints copied verbatim" both guard against the agent quietly redefining success. The project's existing "Done when" checks per milestone already do this job.

### Gaps
- **Simon Willison**: I found no primary simonwillison.net post specifically about plan/progress files or memory banks within this search budget. The only hit was a secondhand reference to his post on Cursor's long-running agents ("Scaling long-running autonomous coding"). His views on this topic remain unverified here.
- I found no primary source for a canonical "handoff.md" or "session log" template beyond Osmani's description and Anthropic's progress.txt example.

## Keeping these files fresh and lean (anti-staleness and anti-bloat rules)

### Takeaway
The rules that hold up are: separate stable from volatile content; keep the always-loaded file short and index-like, and move detail into files read on demand; update at defined trigger points (end of each task or session, or an explicit "update memory bank" command); make progress records append-only or flip-only; let git and a runnable check be the source of truth; and prune regularly, with every rule justified by a real failure.

### Cited Findings
- Stable versus volatile split: Cline marks `activeContext.md` as the file that "updates most frequently" and `projectbrief.md` as the source of truth. [Cline Docs](https://docs.cline.bot/prompting/cline-memory-bank) Claude Code says to exclude "Information that changes frequently" from CLAUDE.md. [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- Index plus on-demand detail: the `MEMORY.md` index loads only its first 200 lines or 25KB; topic files are read on demand; when near the cap, Claude is told to "keep one line per entry, move detail into topic files, and merge or drop stale entries". [Claude Code memory](https://code.claude.com/docs/en/memory)
- Size budget: keep CLAUDE.md under 200 lines; imports don't reduce context cost; path-scoped rules do. [Claude Code memory](https://code.claude.com/docs/en/memory) "Would removing this cause Claude to make mistakes? If not, cut it." [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- Avoid duplicating the code: auto memory "skips anything it can derive from the codebase, such as architecture, file paths, or debugging fixes" and anything already in CLAUDE.md. [Claude Code memory](https://code.claude.com/docs/en/memory) Best practices exclude "File-by-file descriptions of the codebase". [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- Freshness signal: auto-memory files get a `modified` ISO 8601 timestamp, which "shows how current the fact is". [Claude Code memory](https://code.claude.com/docs/en/memory)
- Update cadence: commit plus a progress note at the end of every session; a smoke test at the start of every session. [Anthropic harness post](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) "Update memory bank" as a forced full review. [Cline Docs](https://docs.cline.bot/prompting/cline-memory-bank)
- Rewrite resistance: JSON feature lists in which only `passes` may change. [Anthropic harness post](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Rulebooks stay "short, every line earned by a real failure"; progress logs are append-only. [Addy Osmani, 2026-04-28](https://addyosmani.com/blog/long-running-agents)
- Tooling for staleness: `stalebrain` audits agent memory files against the current code using per-type half-lives (paths 30 days, conventions 120 days), after which facts are re-verified or downgraded to hypotheses [PyPI: stalebrain](https://pypi.org/project/stalebrain/). `claude-code-auto-memory` watches edits, deletes and moves and updates docs in the background [GitHub](https://github.com/severity1/claude-code-auto-memory). (From search summaries; third-party tools, not evaluated.)
- One maintenance guide recommends dated rules with a one-line "why", a monthly prune, and turning enforceable rules into hooks or lint rather than prose. [mcp.directory, 2026](https://mcp.directory/blog/claude-md-agents-md-maintenance-2026) (Third-party; from search summary.) The hooks advice matches Anthropic's: hooks are "deterministic and guarantee the action happens" whereas CLAUDE.md is advisory. [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- Archiving: superpowers' dated per-feature plan files (`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`) archive themselves by design. [obra/superpowers](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md) Beads replaces plan archives with closed issues. [Yegge](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)

### Inferences
- A practical rule set for this project:
  1. The always-loaded CLAUDE.md stays a short pointer plus rules.
  2. PLAN.md holds the stable roadmap and spec.
  3. Volatile "where are we / next step / open questions" lives in one small section or file that is rewritten (not appended) each session.
  4. Completed-milestone detail moves to a dated log or archive file, leaving one line and a commit hash in Progress.
  5. The AI updates state at each "Done when" stop, before handing back for review.
- Recording the commit hash or date next to each ticked item turns "progress" claims into checkable claims tied to git, which reduces doc/code drift.

### Gaps
- I found no rigorous measurements (beyond anecdotes and a vendor's unverified "40% token reduction" claim) of how much these hygiene rules improve outcomes.

## Failure modes reported by practitioners

### Takeaway
The recurring failures are: **drift** (docs claim things the code no longer does, and stale notes are worse than none); **bloat** (always-loaded context so long that rules get ignored, which feeds context rot); **duplication and contradiction** (the same fact in several files, with Claude picking one at random); **false progress** (premature "done", tests deleted or edited, self-grading bias); **maintenance burden** (updates forgotten); and **plan sprawl** (many obsolete plan files confusing the agent).

### Cited Findings
- Drift and staleness: "documentation decays"; stale notes lead the agent to rely on outdated context; the files only work if someone updates them. [MemoryLake (vendor of a competing product)](https://www.memorylake.ai/en/blogs/set-up-cline-memory-bank); [PromptLayer glossary](https://www.promptlayer.com/glossary/cline-memory-bank). One Reddit poster reported that six months on, half the rules were wrong and the agent kept following them, and that a stale CLAUDE.md is worse than none because it actively misleads. (Via search summary of [mcp.directory](https://mcp.directory/blog/claude-md-agents-md-maintenance-2026); I did not locate the original thread.)
- Bloat: "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" and "If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long". [Claude Code best practices](https://code.claude.com/docs/en/best-practices) Overly verbose memory files add noise. [PromptLayer](https://www.promptlayer.com/glossary/cline-memory-bank) Context rot. [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Contradiction: "if two instructions contradict each other, Claude may pick one arbitrarily"; review CLAUDE.md, nested files and rules periodically, or run `/doctor prompt-audit`. [Claude Code memory](https://code.claude.com/docs/en/memory) Markdown has no notion of precedence between conflicting rules ("markdown is your agent's config layer. It is not its memory layer."). [Jugeni Substack](https://jugeni.substack.com/p/your-agents-markdown-file-is-becoming) (opinion essay)
- False progress: premature completion, regressions, deleting failing tests, self-grading bias, alignment drift through repeated summarization, and "memory drift". [Addy Osmani, 2026-04-28](https://addyosmani.com/blog/long-running-agents) Features marked done without proper testing, and later agents seeing progress and declaring the job done. [Anthropic harness post](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Markdown gets rewritten: JSON was chosen because the model is "less likely to inappropriately change or overwrite JSON files compared to Markdown files". [Anthropic harness post](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Plan sprawl: conflicting or obsolete plan documents confuse agents, which was the motivation for Beads. [Yegge via search summary](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)
- Human comprehension: "over my skis", where the process outpaces your understanding. [Harper Reed, 2025-02-16](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/)
- Session-level: the kitchen-sink session, repeated corrections polluting context, infinite exploration. [Claude Code best practices](https://code.claude.com/docs/en/best-practices)

### Inferences (what to borrow for a solo learning/portfolio project with plans, milestones, phases)
Context: this repo already has a single 445-line `PLAN.md` that combines AI instructions (section 0), the app spec (section 1), Part 2/3 curricula, and a Progress checklist at the bottom, with CLAUDE.md pointing to it. Based on the findings above:
- **Keep**: CLAUDE.md as a short pointer, PLAN.md as the roadmap, and the "Done when" checks as done-conditions (this matches Osmani's done-condition file and Anthropic's feature list).
- **Borrow from Cline/Roo**: separate stable from volatile. Add a small, frequently rewritten "Current state" block (or `docs/progress.md` / `activeContext`-style file): current milestone, last thing completed, next step, open questions or blockers. Add a `decisions.md` (Roo's decisionLog: context, decision, rationale), which is useful portfolio and interview material and records "why".
- **Borrow from Anthropic**: a fixed session-start ritual (read the Progress/Current state section, run `git log --oneline -10`, run the app or tests as a smoke check before new work), and a session-end ritual (tick the item, write a 3–5 line progress note, commit). Make the checklist tick-only: the AI may change `[ ]` to `[x]` and add a date or commit hash, but must not rewrite or delete milestone items without asking. That is the Markdown equivalent of "only change `passes`".
- **Borrow from superpowers/Harper Reed**: for larger milestones (for example each Part 2/3 module), an optional dated per-milestone plan file (`docs/plans/YYYY-MM-DD-<milestone>.md`) with Goal, Constraints and checkbox steps, frozen once done. This archives itself, so PLAN.md doesn't bloat.
- **Borrow from Claude Code docs**: keep volatile state out of CLAUDE.md; use `/clear` between milestones and start fresh from disk state rather than relying on compaction; optionally add a compaction instruction in CLAUDE.md ("When compacting, preserve current milestone and next step"); let auto memory capture the user's preferences and feedback rather than duplicating them in PLAN.md.
- **Avoid**: a "read ALL files every task" rule; the same fact in both CLAUDE.md and PLAN.md; append-only logs that are always loaded; adding Beads, MCP memory servers or other tooling to a solo learning project.
- **Learning-project specific**: Harper Reed's "over my skis" warning applies most where the user writes the code (Parts 2–3). Progress notes there should record what the *user* learned or struggled with (for quiz and review), not only what was built.

### Gaps
- I found no reliable primary source on HN or Reddit with quantitative evidence about Memory Bank failure rates. Reports are anecdotal or come via vendors and secondary blogs, and the search did not surface the original HN threads.
- I found no source that evaluates these patterns specifically for *learning* projects, where the human writes the code and the AI teaches. The recommendations above are extrapolations.
