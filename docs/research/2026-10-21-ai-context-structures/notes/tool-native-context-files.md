# Tool-native project context mechanisms for AI coding assistants (as of 2026-10-21)

Research scope: what the vendors' own docs say about how each tool loads persistent project context from a repo. Primary sources were fetched on 2026-10-21 unless noted. Two vendor doc URLs now redirect: `developers.openai.com/codex/guides/agents-md` returns a 308 to `learn.chatgpt.com/docs/agent-configuration/agents-md`, and `docs.windsurf.com/windsurf/cascade/memories` returns a 307 to `docs.devin.ai/desktop/cascade/memories`.

## Claude Code: CLAUDE.md, imports, .claude/rules, auto memory, Skills, subagents, AGENTS.md

### Takeaway
Claude Code loads CLAUDE.md files from the working directory and every directory above it, in full, at launch. CLAUDE.md files in subdirectories load only when Claude touches a file there. `@imports` are expanded at launch, so they organize content but do not save tokens. To save context you need path-scoped `.claude/rules/` files (which load when a matching file is touched) or Skills (only the description is always present; the body loads when the skill is used). Anthropic says to keep each CLAUDE.md under 200 lines. Since v2.1.277 Claude Code reads AGENTS.md natively, but by default only when no CLAUDE.md exists.

### Cited Findings
**Locations and scopes**
- Four scopes, loaded from broadest to most specific:
  - Managed policy: `C:\Program Files\ClaudeCode\CLAUDE.md` on Windows, `/etc/claude-code/CLAUDE.md` on Linux, `/Library/Application Support/ClaudeCode/CLAUDE.md` on macOS.
  - User: `~/.claude/CLAUDE.md`.
  - Project: `./CLAUDE.md` or `./.claude/CLAUDE.md`.
  - Local: `./CLAUDE.local.md`, which is personal and should be gitignored.
  - Source: [Claude Code docs: memory](https://code.claude.com/docs/en/memory)
- Organizations can also put managed CLAUDE.md content inline through the `claudeMd` key in `managed-settings.json`. — [memory](https://code.claude.com/docs/en/memory)

**Load timing and hierarchy**
- "CLAUDE.md and CLAUDE.local.md files in the directory hierarchy above the working directory are loaded at launch. Files in subdirectories load on demand." — [memory](https://code.claude.com/docs/en/memory)
- Subdirectory CLAUDE.md files load "once Claude reads, writes, or edits another file in that subdirectory." This includes Bash reads such as `cat` or `head` on a single file. — [memory](https://code.claude.com/docs/en/memory)
- "All discovered files are concatenated into context rather than overriding each other." Content is ordered from the filesystem root down to the working directory. Within a directory, `CLAUDE.local.md` is appended after `CLAUDE.md`. — [memory](https://code.claude.com/docs/en/memory)
- CLAUDE.md content "is delivered as a user message after the system prompt, not as part of the system prompt itself." Claude treats it "as context, not enforced configuration". Anything that must be enforced belongs in hooks or permission settings. — [memory](https://code.claude.com/docs/en/memory)
- Block-level HTML comments (`<!-- ... -->`) in CLAUDE.md are stripped before injection, "without spending context tokens on them." — [memory](https://code.claude.com/docs/en/memory)
- After `/compact`, the project-root CLAUDE.md is re-read from disk and re-injected. Nested CLAUDE.md files and path-scoped rules load again on demand. — [memory](https://code.claude.com/docs/en/memory)
- `claudeMdExcludes` (glob patterns matched against absolute paths) skips unwanted CLAUDE.md or rules files, for example in monorepos. Managed CLAUDE.md files cannot be excluded. — [memory](https://code.claude.com/docs/en/memory)
- `/context` lists the memory files that loaded at launch. Subdirectory CLAUDE.md files do not appear there, because they print a `Loaded` line only when they load. — [memory](https://code.claude.com/docs/en/memory)

**Imports**
- Syntax is `@path/to/import`. Relative paths resolve against the importing file. Imports can recurse to "a maximum depth of four hops."
- Imports inside code spans and fenced code blocks are ignored.
- Spaces in paths must be backslash-escaped. Quoted paths are not imported at all.
- The first time a project-level file imports something outside the working directory, Claude Code shows a one-time approval dialog.
- Source: [memory](https://code.claude.com/docs/en/memory)
- "Imports help you organize a long file but don't reduce its context cost, because imported files also load at launch." — [memory](https://code.claude.com/docs/en/memory)

**.claude/rules/**
- `.md` files under `.claude/rules/` are discovered recursively. Rules with no `paths` frontmatter "are loaded at launch with the same priority as `.claude/CLAUDE.md`." — [memory](https://code.claude.com/docs/en/memory)
- Rules with `paths:` glob frontmatter load only "when Claude uses the Read, Write, or Edit tool on a matching file" (or reads it with a Bash read). `paths` is the only frontmatter field Claude Code reads; other fields are ignored. — [memory](https://code.claude.com/docs/en/memory)
- User-level rules go in `~/.claude/rules/`. Symlinked shared rules are supported. — [memory](https://code.claude.com/docs/en/memory)

**Size guidance**
- "target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence." — [memory](https://code.claude.com/docs/en/memory)
- Hard limit: "Claude Code loads a CLAUDE.md file of up to 4 MiB in full and skips a larger file." Startup and `/status` show warnings when a file is over the recommended length or when files add up past a combined limit. The combined limit is not given as a number. — [memory](https://code.claude.com/docs/en/memory)
- `/doctor` proposes trims that cut "content Claude can derive from the codebase, such as directory layouts, dependency lists, and architecture overviews," and keep "pitfalls, rationale, and conventions that differ from tool defaults." `/doctor prompt-audit` (v2.1.283+) checks instruction files for outdated or conflicting content. — [memory](https://code.claude.com/docs/en/memory)

**What to put in CLAUDE.md (Anthropic best practices)**
- "Keep it concise. For each line, ask: 'Would removing this cause Claude to make mistakes?' If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual instructions!" — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- Include:
  - Bash commands Claude can't guess
  - Code style rules that differ from defaults
  - Testing instructions
  - Repository etiquette
  - Project-specific architectural decisions
  - Developer environment quirks
  - Gotchas
- Exclude:
  - Anything derivable from code
  - Standard language conventions
  - Detailed API docs (link to them instead)
  - Frequently changing information
  - Long tutorials
  - File-by-file descriptions
  - "write clean code" platitudes
- Source for both lists: [best practices](https://code.claude.com/docs/en/best-practices)
- "If an entry is a multi-step procedure or only matters for one part of the codebase, move it to a skill or a path-scoped rule instead." — [memory](https://code.claude.com/docs/en/memory)
- Use "IMPORTANT" on single lines only. "If you emphasize many lines, none of them stands out." — [best practices](https://code.claude.com/docs/en/best-practices)
- "The context window is the most important resource to manage." — [best practices](https://code.claude.com/docs/en/best-practices)

**Auto memory**
- Claude writes notes to `~/.claude/projects/<project>/memory/`, which is machine-local, per git repo, and shared across worktrees. The folder holds a `MEMORY.md` index plus topic files. — [memory](https://code.claude.com/docs/en/memory)
- "The first 200 lines of `MEMORY.md`, or the first 25KB, whichever comes first, are loaded at the start of every conversation." Topic files are read on demand. — [memory](https://code.claude.com/docs/en/memory)
- Memory types are `user`, `feedback`, `project`, and `reference`. Claude "skips anything it can derive from the codebase" and anything CLAUDE.md already says. Auto memory is on by default in local sessions; turn it off with `autoMemoryEnabled: false` or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. — [memory](https://code.claude.com/docs/en/memory)

**Skills (progressive disclosure)**
- Locations:
  - Project: `.claude/skills/<name>/SKILL.md`
  - Personal: `~/.claude/skills/<name>/SKILL.md`
  - Nested: `<subdir>/.claude/skills/`, which loads the first time Claude reads or edits a file in that subdirectory
  - Plugin and enterprise skills
  - Source: [Claude Code docs: skills](https://code.claude.com/docs/en/skills)
- What is in context when:
  - Always: the description. `description` plus `when_to_use` is truncated at 1,536 characters in the listing.
  - When invoked: the SKILL.md body.
  - When the body points to them: supporting files.
  - Source: [skills](https://code.claude.com/docs/en/skills)
- Unlike CLAUDE.md, "a skill's body loads only when it's used, so long reference material costs almost nothing until you need it." — [skills](https://code.claude.com/docs/en/skills)
- "Keep `SKILL.md` under 500 lines. Move detailed reference material to separate files." — [skills](https://code.claude.com/docs/en/skills)
- Create a skill "when a section of CLAUDE.md has grown into a procedure rather than a fact." — [skills](https://code.claude.com/docs/en/skills)
- After compaction, invoked skills are re-attached: the first 5,000 tokens of each, within a combined budget of 25,000 tokens. — [skills](https://code.claude.com/docs/en/skills)
- Skills follow the [Agent Skills](https://agentskills.io) open standard, "which works across multiple AI tools." Claude Code adds extensions such as `context: fork`, `paths`, `disable-model-invocation`, and `` !`command` `` injection. — [skills](https://code.claude.com/docs/en/skills)

**Subagents**
- Subagents "run in separate context windows and report back summaries". "Use subagents to keep research out of" the main context. — [best practices](https://code.claude.com/docs/en/best-practices)
- A sub-agent may use tens of thousands of tokens but "returns only a condensed, distilled summary of its work," often 1,000–2,000 tokens. — [Anthropic Engineering, "Effective context engineering for AI agents" (2025-09-29)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- The main conversation's auto memory is not loaded into subagents, except forks. Subagents can have their own `memory` directory. — [memory](https://code.claude.com/docs/en/memory)
- The same article calls Claude Code's design a hybrid: CLAUDE.md is "naively dropped into context up front," while glob and grep retrieve everything else just in time. It recommends the "smallest possible set of high-signal tokens," and structured note-taking (for example NOTES.md) outside the context window. — [context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

**AGENTS.md in Claude Code**
- Since v2.1.277, Claude Code reads AGENTS.md through a built-in plugin (`cc-plugin-agents-md@builtin`; the ID was `agents-md@builtin` before v2.1.285). — [memory](https://code.claude.com/docs/en/memory)
- The default setting, `claude-md-or-agents-md`, reads AGENTS.md only if there is no `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` in the working directory or above it. — [memory](https://code.claude.com/docs/en/memory)
- `~/.claude/CLAUDE.md`, the managed CLAUDE.md, and `.claude/rules/` files do not count for that check. — [memory](https://code.claude.com/docs/en/memory)
- Other values are `claude-md-and-agents-md`, `claude-md`, and `managed-only`. — [memory](https://code.claude.com/docs/en/memory)
- `AGENTS.local.md`, `AGENTS.override.md`, and `.agents/` are not read. — [memory](https://code.claude.com/docs/en/memory)
- Adding a `CLAUDE.local.md` stops AGENTS.md from loading under the default setting. — [memory](https://code.claude.com/docs/en/memory)
- Some sessions read CLAUDE.md files only: versions before v2.1.277, sessions with the built-in plugin disabled, and the first session after an upgrade from v2.1.276 or earlier. Before v2.1.281, Bedrock sessions and sessions with telemetry disabled could not load AGENTS.md either. — [memory](https://code.claude.com/docs/en/memory)
- A CLAUDE.md that tells Claude in words to read AGENTS.md means "Claude sees `AGENTS.md` only if it decides to open the file". Anthropic recommends an `@AGENTS.md` import instead. — [memory](https://code.claude.com/docs/en/memory)
- `/init` migrates `.cursor/rules/`, `.cursorrules`, and `.github/copilot-instructions.md`. With `CLAUDE_CODE_NEW_INIT=1` it also migrates AGENTS.md, `.devin/rules/`, `.windsurf/rules/`, `.windsurfrules`, and `.clinerules`. `/import` copies another agent's config once. — [memory](https://code.claude.com/docs/en/memory)

### Inferences
- In Claude Code, the only mechanisms that cut always-on context cost are nested subdirectory CLAUDE.md files, `paths:`-scoped rules, Skills, and subagents. Imports do not.
- The current repo's CLAUDE.md tells Claude in prose to "Read `PLAN.md` first". By Anthropic's own description of the analogous AGENTS.md case, that is non-deterministic. An `@PLAN.md` import is deterministic, but it loads the whole file every session.
- A large, frequently changing progress log is a poor fit for always-loaded memory. Anthropic says to exclude "information that changes frequently".

### Gaps
- I did not fetch the subagents page (`/docs/en/sub-agents#what-loads-at-startup`). Whether a standard (non-fork) subagent loads project CLAUDE.md by default is not verified here; the memory page only says some subagents "start without project instructions".
- The numeric combined-size warning threshold for all instruction files is not documented on the pages I read.

## AGENTS.md: the standard, stewardship, tool support, nesting, recommended content

### Takeaway
AGENTS.md is a plain-Markdown "README for agents" with no required fields. agents.md says it is stewarded by the Agentic AI Foundation under the Linux Foundation and claims more than 60k open-source projects use it. The nearest file in the directory tree wins, and the user's chat prompt overrides everything. Support is near-universal: Codex, Cursor, Copilot, Gemini/Antigravity, Windsurf/Devin, Kiro, and now Claude Code natively. Load semantics differ by tool.

### Cited Findings
- AGENTS.md is "a simple, open format," a "README for agents" for details that would clutter a human-facing README. It has no required fields. "used by over 60k open-source projects." — [agents.md](https://agents.md)
- Stewardship: "stewarded by the Agentic AI Foundation under the Linux Foundation". Copyright: "AGENTS.md a Series of LF Projects, LLC." Credited originators: OpenAI Codex, Amp, Jules (Google), Cursor, and Factory. — [agents.md](https://agents.md)
- Tools listed as supporting it:
  - OpenAI: Codex
  - Google: Jules, Gemini CLI
  - Factory, Aider, goose, opencode, Zed, Warp
  - VS Code, Cursor, Windsurf, Devin, Augment Code
  - UiPath, JetBrains Junie
  - Amp, RooCode, Kilo Code, Phoenix, Semgrep, Ona
  - GitHub Copilot coding agent
  - Source: [agents.md](https://agents.md)
- The agents.md page does not list Claude Code. Claude Code's own docs document native support since v2.1.277. — [agents.md](https://agents.md); [Claude Code memory](https://code.claude.com/docs/en/memory)
- Nesting: agents read "the nearest AGENTS.md in the directory tree," so the closest file takes precedence, and explicit user chat prompts override everything. The OpenAI main repo had 88 AGENTS.md files. — [agents.md](https://agents.md)
- Recommended sections:
  - Project overview
  - Build and test commands
  - Code style guidelines
  - Testing instructions
  - Security considerations
  - Optional extras: commit and PR guidelines, gotchas, large dataset notes, deployment steps
  - Source: [agents.md](https://agents.md)
- If test commands are listed, agents will try to run them and fix failures before finishing. — [agents.md](https://agents.md)
- Migration tip: `mv AGENT.md AGENTS.md && ln -s AGENTS.md AGENT.md`. Aider: `read: AGENTS.md` in `.aider.conf.yml`. Gemini CLI: set `context.fileName` in `.gemini/settings.json`. — [agents.md](https://agents.md)
- The spec gives no size limit. — [agents.md](https://agents.md)

### Inferences
- "Nearest file wins" (agents.md, Copilot) differs from "concatenate root-to-leaf, later wins on conflict" (Codex, Claude Code, Gemini, Cursor). In practice, both mean nested files should hold only what is specific to that directory and avoid repeating the root.

### Gaps
- I did not verify the date the Agentic AI Foundation was formed or the date AGENTS.md moved to it; the agents.md page states only the current stewardship. My recollection is a December 2025 announcement, but it is unverified.
- The 60k adoption figure is self-reported by agents.md.

## Cursor: .cursor/rules, rule types, AGENTS.md, .cursorrules, Memories

### Takeaway
Cursor project rules are `.mdc` files in `.cursor/rules/` (subfolders allowed) with `description`, `globs`, and `alwaysApply` frontmatter. That gives four modes: Always Apply, Apply Intelligently, Apply to Specific Files, and Apply Manually. AGENTS.md, including nested files, is supported as a plain alternative. Cursor recommends keeping rules under 500 lines. A Cursor staff reply on the forum says Memories was removed in v2.1.17. The legacy `.cursorrules` file is no longer mentioned in the current rules docs, and its deprecation date is unverified.

### Cited Findings
- Rule types:
  - Always Apply: "Apply to every chat session".
  - Apply Intelligently: "When Agent decides it's relevant based on description".
  - Apply to Specific Files: "When file matches a specified pattern," using `globs`.
  - Apply Manually: "When @-mentioned in chat (e.g., `@my-rule`)."
  - Source: [Cursor docs: Rules](https://cursor.com/docs/context/rules)
- Files must use the `.mdc` extension. A plain `.md` file in `.cursor/rules` is ignored because it lacks frontmatter. Frontmatter fields are `description`, `globs`, and `alwaysApply`. Rules can be organized in folders. — [Cursor Rules](https://cursor.com/docs/context/rules)
  - This is the summarizer's paraphrase. Verify the `.md` claim directly if it matters; earlier Cursor versions accepted both.
- AGENTS.md is a "plain markdown alternative" in the project root. Nested AGENTS.md files in subdirectories combine with their parents, "more specific instructions taking precedence." — [Cursor Rules](https://cursor.com/docs/context/rules)
- User Rules are global and set in Customize → Rules. They apply to Agent (Chat) only, not Inline Edit. Team Rules come from the dashboard on Team and Enterprise plans and can be enforced. Precedence is Team → Project → User. — [Cursor Rules](https://cursor.com/docs/context/rules)
- Best practices:
  - "Keep rules under 500 lines".
  - Split rules into composable pieces.
  - Reference files instead of copying them. A referenced file's contents are not inlined, so the agent reads it when needed.
  - "Start simple. Add rules only when you notice Agent making the same mistake repeatedly"
  - Don't paste full style guides; use a linter.
  - Source: [Cursor Rules](https://cursor.com/docs/context/rules)
- Memories: a Cursor staff reply says "The Memories feature was removed starting from version 2.1.17". Users can export memories to an `.mdc` file through the "Export memories" command and move them into Rules. — [Cursor forum: "Are my memories gone?"](https://forum.cursor.com/t/are-my-memories-gone/144057)
- `.cursorrules`: the current official rules page does not mention it. — [Cursor Rules](https://cursor.com/docs/context/rules)
  - Third-party guides disagree on when it was deprecated (late 2024 vs. 0.43–0.45). They say it still loads. Not verified against an official changelog. — [gauravtiwari.org](https://gauravtiwari.org/cursor-rules/) (third-party)
- Claude Code's `/init` still imports `.cursorrules`, which suggests such files still exist in the wild. — [Claude Code memory](https://code.claude.com/docs/en/memory)

### Inferences
- Cursor's "Apply Intelligently" mode works like Claude Code Skills: only the description is always present. "Apply to Specific Files" works like Claude's `paths:` rules.

### Gaps
- Official date of Memories removal (the forum gives only the version) and official `.cursorrules` deprecation and removal status: no primary changelog entry found.
- Whether Cursor reads CLAUDE.md: not stated on the rules page.

## GitHub Copilot: copilot-instructions.md, *.instructions.md, AGENTS.md, prompt files

### Takeaway
Copilot reads three kinds of files:
- Repo-wide `.github/copilot-instructions.md`, always added to requests.
- Path-scoped `.github/instructions/**/NAME.instructions.md` files with `applyTo` globs.
- Agent files: AGENTS.md (nearest wins), or a single root `CLAUDE.md` or `GEMINI.md`.

Support varies a lot by surface. The cloud agent and Copilot CLI read everything. VS Code Chat reads AGENTS.md only. Visual Studio and Eclipse chat ignore agent files.

### Cited Findings
- `.github/copilot-instructions.md`: "Instructions are automatically added to requests that you submit to Copilot." — [GitHub Docs: add repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- Path-specific files are `.github/instructions/NAME.instructions.md` (subdirectories allowed). Frontmatter `applyTo` takes comma-separated globs, for example `"**/*.ts,**/*.tsx"`. The optional `excludeAgent` accepts `"code-review"` or `"cloud-agent"`. When both apply, the repo-wide and path-specific files are both used. — [add repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- On GitHub.com, path-specific instructions "are only supported for Copilot cloud agent and Copilot code review." — [add repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- AGENTS.md can appear anywhere; "the nearest `AGENTS.md` file in the directory tree will take precedence." "Alternatively, a single `CLAUDE.md` or `GEMINI.md` in the repository root can be used." — [add repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- Priority is personal, then repository, then organization, but "all sets of relevant instructions are provided to Copilot." — [add repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- Code review reads instructions, agent instructions, and agent skills from the PR's head branch. — [add repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- Support matrix, by surface. Source: [GitHub Docs: custom instructions support](https://docs.github.com/en/copilot/reference/custom-instructions-support)

  | Surface | `copilot-instructions.md` | `*.instructions.md` | Agent files (AGENTS.md / CLAUDE.md / GEMINI.md) |
  |---|---|---|---|
  | GitHub.com Chat | Yes | No | No |
  | GitHub.com cloud agent | Yes | Yes | Yes |
  | GitHub.com code review | Yes | Yes | Yes, plus `REVIEW.md` |
  | VS Code Chat | Yes | Yes | AGENTS.md only |
  | VS Code code review | Yes | No | No |
  | Visual Studio Chat | Yes | Yes | No |
  | JetBrains Chat | Yes | Yes | No |
  | Eclipse Chat | Yes | No | No |
  | Xcode Chat | Yes | Yes | No |
  | Copilot CLI | Yes | Yes | Yes |

  Personal instructions for Copilot CLI live in `~/.copilot/`.
- Size: the only length guidance is in GitHub's sample onboarding prompt, "Instructions must be no longer than 2 pages." — [add repository instructions](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)

### Inferences
- A repo whose only instruction file is AGENTS.md is invisible to Copilot Chat on GitHub.com, Visual Studio, JetBrains, Eclipse, and Xcode. To cover all Copilot surfaces you still need `.github/copilot-instructions.md`, even if it is short or duplicates AGENTS.md.

### Gaps
- Prompt files (`.github/prompts/*.prompt.md`) are not covered by the pages I fetched. Their format and support are unverified here.
- The "4,000 characters for code review" limit is not mentioned on the fetched pages. Unverified.

## OpenAI Codex, Google Gemini CLI / Antigravity CLI, Windsurf (now Devin Desktop), Kiro

### Takeaway
- Codex concatenates AGENTS.md files from the global home and from the git root down to the working directory, with a hard 32 KiB combined cap.
- Gemini CLI loads GEMINI.md hierarchically, with just-in-time subdirectory discovery. Its docs banner says it was replaced by Antigravity CLI on 2026-06-18.
- Windsurf docs now redirect to "Devin Desktop". Rules live in `.devin/rules/` (with `.windsurf/rules/` as fallback) and are limited to 12,000 characters per workspace file.
- Kiro uses `.kiro/steering/*.md` with `always`, `fileMatch`, `manual`, and `auto` inclusion, and always-included AGENTS.md.

### Cited Findings
**OpenAI Codex**
- Global level: in `~/.codex` (or `CODEX_HOME`), Codex reads `AGENTS.override.md` if present, otherwise `AGENTS.md`. Only the first non-empty file is used. — [OpenAI Codex docs: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Project level: Codex walks from the project root (typically the git root) down to the current directory. In each directory it checks `AGENTS.override.md`, then `AGENTS.md`, then `project_doc_fallback_filenames`, using at most one file per directory. — [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Files are concatenated root-down with blank lines between them. "Files closer to your current directory override earlier guidance." Empty files are skipped. The instruction chain is built once per run or session, so restart Codex to pick up changes. — [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Size: `project_doc_max_bytes` defaults to 32 KiB (32,768 bytes). Once the combined size reaches it, Codex stops adding files. The fix is to raise the limit or split into nested directories. — [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- Config example in `~/.codex/config.toml`: `project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]`, `project_doc_max_bytes = 65536`. For GitHub code review, add a `## Code Review Rules` section. — [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

**Google Gemini CLI / Antigravity CLI**
- Gemini CLI loads context in this order:
  - Global `~/.gemini/GEMINI.md`.
  - Workspace directories and their parents.
  - Just in time: when a tool accesses a file or directory, the CLI scans that directory and its ancestors "up to a trusted root."
  - All found files are concatenated and sent with every prompt.
  - Source: [Gemini CLI docs: GEMINI.md](https://geminicli.com/docs/cli/gemini-md/)
- Gemini CLI imports use `@file.md`. Custom filenames are set with `context.fileName`, for example `["AGENTS.md","CONTEXT.md","GEMINI.md"]`. Commands are `/memory show` and `/memory reload`. — [Gemini CLI GEMINI.md](https://geminicli.com/docs/cli/gemini-md/)
- The docs banner says Gemini CLI was replaced by Antigravity CLI on June 18, 2026. — [Gemini CLI GEMINI.md](https://geminicli.com/docs/cli/gemini-md/)
- Antigravity, from third-party sources only:
  - The CLI (`agy`) reads GEMINI.md or AGENTS.md and walks up to the `.git` root. — [toolsbase.dev migration guide](https://toolsbase.dev/en/blog/gemini-cli-to-antigravity-migration); [Medium: 15 Antigravity CLI tips](https://medium.com/google-cloud/15-antigravity-cli-tips-ddbc21c10a20)
  - The IDE uses `.agents/rules/` (with `.agent/rules` kept for backward compatibility), a 12,000-character limit per rule file, and GEMINI.md taking precedence over AGENTS.md on conflicts. — [thepromptshelf.dev](https://thepromptshelf.dev/blog/google-antigravity-agents-md-rules-guide-2026)
  - A forum thread reports Antigravity 2.2.1 not following GEMINI.md or AGENTS.md rules. — [Google AI dev forum](https://discuss.ai.google.dev/t/bug-feedback-antigravity-2-2-1-models-not-following-global-nor-agents-rules-fake-using-skills-tools/172904)

**Windsurf / Devin Desktop**
- `docs.windsurf.com` now redirects to `docs.devin.ai`. The page uses "Devin Desktop" and calls Cascade "the legacy Cascade agent". — [Devin Desktop docs: memories and rules](https://docs.devin.ai/desktop/cascade/memories)
- Locations:
  - Global: `~/.codeium/windsurf/memories/global_rules.md`, always on.
  - Workspace: `.devin/rules/*.md`, preferred, with `.windsurf/rules/*.md` as fallback.
  - Legacy root `.windsurfrules`: "is also still read".
  - AGENTS.md: allowed in any directory.
  - Enterprise system rules: `C:\ProgramData\Devin\rules\` on Windows.
  - Source: [Devin Desktop docs](https://docs.devin.ai/desktop/cascade/memories)
- The `trigger` frontmatter sets activation:
  - `always_on`: full content goes into the system prompt on every message.
  - `model_decision`: only the description is in the system prompt.
  - `glob`: applies when matching files are read or edited.
  - `manual`: activated with `@rule-name`.
  - Root AGENTS.md is always on. A subdirectory AGENTS.md is auto-applied by a glob for that directory.
  - Source: [Devin Desktop docs](https://docs.devin.ai/desktop/cascade/memories)
- Limits: 12,000 characters per workspace rule file and 6,000 for the global rules file. No combined total is stated. — [Devin Desktop docs](https://docs.devin.ai/desktop/cascade/memories)
- Auto-generated memories are stored locally in `~/.codeium/windsurf/memories/`, tied to one workspace, and not committed. The new Devin Local agent does not persist memories, and the docs recommend migrating them to skills. — [Devin Desktop docs](https://docs.devin.ai/desktop/cascade/memories)

**Kiro**
- Steering files go in `.kiro/steering/` (workspace) or `~/.kiro/steering/` (global). When they conflict, the workspace wins. — [Kiro docs: Steering](https://kiro.dev/docs/steering/)
- Foundation files are `product.md`, `tech.md`, and `structure.md`, "included in every interaction by default." — [Kiro Steering](https://kiro.dev/docs/steering/)
- Inclusion modes (front matter):
  - `always` (the default).
  - `fileMatch` with `fileMatchPattern`, which can be an array.
  - `manual`, via `#steering-file-name`.
  - `auto`, with `name` and `description`; included "when your request matches the description."
  - Source: [Kiro Steering](https://kiro.dev/docs/steering/)
- File references: `#[[file:path]]`, `#[[file:path:start-end]]`, and `#[[folder:path]]`. — [Kiro Steering](https://kiro.dev/docs/steering/)
- AGENTS.md is read from the workspace root, subdirectories, and `~/.kiro/steering/`. It has no inclusion modes and is always included. — [Kiro Steering](https://kiro.dev/docs/steering/)
- Best practices: "One domain per file". Explain why, not just what. Include examples. Never include secrets. — [Kiro Steering](https://kiro.dev/docs/steering/)

### Inferences
- Every major tool now has the same three tiers:
  - Always-on: root file or `alwaysApply`/`always_on`/`always`.
  - File-scoped: globs, `paths`, `applyTo`, `fileMatch`.
  - Description-triggered or on-demand: Skills, Cursor "Apply Intelligently", Windsurf `model_decision`, Kiro `auto`.
- Only the always-on root content is portable across tools as a single file (AGENTS.md). Each tool's scoped and on-demand formats are its own.
- Codex's 32 KiB cap and Windsurf's 12,000-character limit are the tightest hard limits. Anthropic's 200-line guideline (roughly 8–12 KB) fits comfortably within them.

### Gaps
- Official Google Antigravity docs (IDE and CLI) were not found in search. All Antigravity specifics are third-party and should be treated as unverified.
- Exact Windsurf → Devin Desktop rename date: not stated on the docs page.
- Kiro size limits: not stated on the steering page.

## llms.txt: what it is and whether it helps repo-level context

### Takeaway
llms.txt, proposed by Jeremy Howard on 2024-09-03 (spec v2 modified 2026-08-10), is a website-root Markdown index of links. Agents use it on demand to find documentation. It is not a repo-instruction mechanism, and no coding tool documented here loads it automatically from a repository.

### Cited Findings
- Proposed by Jeremy Howard on September 3, 2024. The page is v2, modified August 10, 2026. The 2024 proposal "was largely a prediction" that is now "routine." — [llmstxt.org](https://llmstxt.org/)
- Format:
  - An H1 name, the only required section.
  - A blockquote summary.
  - Optional detail paragraphs.
  - H2 sections listing `[name](url): notes` links.
  - An "Optional" H2 section for links that can be skipped.
  - Sites are also asked to serve `.md` versions of pages.
  - Source: [llmstxt.org](https://llmstxt.org/)
- Use: "used on demand, when an agent needs information about a topic while assisting a user." "used most heavily for software documentation, where coding agents follow them." The spec does not describe repositories as an intended use. — [llmstxt.org](https://llmstxt.org/)
- Example of real use: Claude Code's own docs pages begin with a pointer to `https://code.claude.com/docs/llms.txt` "to discover all available pages." — [Claude Code memory](https://code.claude.com/docs/en/memory)

### Inferences
- For a solo dev's repo, llms.txt adds nothing the agent will auto-load. Its only value is as a published docs index for a library others consume. The repo-side equivalent of "an index with links, details elsewhere" is a short AGENTS.md or CLAUDE.md that points to `docs/` files, plus on-demand Skills or rules.

### Gaps
- None of the fetched tool docs (Claude Code, Codex, Cursor, Copilot, Kiro, Windsurf) say they read a repo-local `llms.txt` automatically. Absence is inferred from their documented file lists, not stated explicitly.

## Practical multi-tool setup (AGENTS.md as the source of truth)

### Takeaway
Anthropic's documented pattern is to keep shared instructions in `AGENTS.md` and add a `CLAUDE.md` containing `@AGENTS.md` plus any Claude-only notes. This repo is on Windows, and Anthropic advises against the symlink alternative there. Add `.github/copilot-instructions.md` only if you use Copilot surfaces that ignore AGENTS.md.

### Cited Findings
- Anthropic's recommended `CLAUDE.md`: `@AGENTS.md` followed by a `## Claude Code` section of Claude-specific instructions. "Claude reads the imported file first, then the rest." — [Claude Code memory](https://code.claude.com/docs/en/memory)
- Keeping the import "never makes Claude read `AGENTS.md` twice, whichever Project instructions value you use." Under `claude-md-and-agents-md`, "Claude Code skips an `AGENTS.md` it has already loaded." — [Claude Code memory](https://code.claude.com/docs/en/memory)
- Symlink option: `ln -s AGENTS.md CLAUDE.md`. Caveats:
  - Edit and Write refuse to write through a symlink.
  - Windows: "use the `@AGENTS.md` import instead". Creating symlinks needs Admin rights or Developer Mode, and Git checks out a committed symlink as a plain text file unless `core.symlinks` is enabled, "which leaves that clone with a one-line `CLAUDE.md`."
  - Source: [Claude Code memory](https://code.claude.com/docs/en/memory)
- Alternatively, delete CLAUDE.md entirely and rely on native AGENTS.md reading (v2.1.277+). Keep a CLAUDE.md with the import "if some of your sessions can't load `AGENTS.md` directly." — [Claude Code memory](https://code.claude.com/docs/en/memory)
- Other tools reading AGENTS.md natively:
  - Codex. — [Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
  - Cursor. — [Cursor](https://cursor.com/docs/context/rules)
  - Copilot cloud agent, code review, CLI, and VS Code Chat. — [GitHub support matrix](https://docs.github.com/en/copilot/reference/custom-instructions-support)
  - Windsurf/Devin. — [Devin Desktop](https://docs.devin.ai/desktop/cascade/memories)
  - Kiro. — [Kiro](https://kiro.dev/docs/steering/)
  - Gemini CLI, via `context.fileName`. — [Gemini CLI](https://geminicli.com/docs/cli/gemini-md/)
- Copilot can instead read a single root `CLAUDE.md` or `GEMINI.md`. — [GitHub Docs](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions)
- Gemini CLI can be pointed at AGENTS.md with `{"context":{"fileName":["AGENTS.md","GEMINI.md"]}}`. — [Gemini CLI](https://geminicli.com/docs/cli/gemini-md/); [agents.md](https://agents.md)

### Inferences
- Cheapest robust layout for a solo developer using Claude Code on Windows:
  1. A short root `AGENTS.md` (under ~200 lines) with commands, conventions, gotchas, and pointers to deeper docs.
  2. A `CLAUDE.md` with `@AGENTS.md` and a few Claude-only lines. Use the import, not a symlink.
  3. Area-specific guidance in path-scoped `.claude/rules/*.md` (`paths:` globs) or in nested `AGENTS.md`/`CLAUDE.md` in subfolders (for example `k8s/`, `terraform/`), which load on demand.
  4. Procedures, tutorials, and reference material in Skills or plain `docs/*.md`, linked but not `@`-imported.
- Large, volatile files such as a full PLAN.md with progress logs should be linked rather than `@`-imported. A small "current status" excerpt could be imported if it must always be present. This follows Anthropic's "exclude information that changes frequently" advice and the fact that imports don't save tokens.
- Nested-file semantics differ across tools: Claude and Codex concatenate, while agents.md and Copilot say the nearest file wins. Keeping nested files additive and non-contradictory makes them behave the same everywhere.

### Gaps
- No vendor publishes token-cost benchmarks comparing these layouts. The cost reasoning above is inferred from the documented load timing, not measured.
