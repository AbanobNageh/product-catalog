# Evidence on Repository Context Files for AI Coding Agents, and How Developers Showcase AI-Assisted Work

Research date: 2026-10-21. Every claim below links to its source. "Evidence" means a measured result from a study. "Opinion" means practitioner or vendor guidance with no controlled measurement behind it. Both are labelled throughout.

## Q1. Do AGENTS.md / CLAUDE.md / cursor-rules files improve agent task success or cost? (empirical studies, with numbers)

### Takeaway
The controlled studies from 2026 agree on one thing. Context files do not measurably raise task success. LLM-generated files are neutral to slightly negative, and developer-written files give at most a small gain that is not statistically significant. Their effect on cost is mixed. One study found cost rose by about 20% or more, while another found runtime and output tokens fell. All three report that agents do follow the specific instructions in these files, such as which tool to use. Repository overviews and architecture descriptions do not help.

### Cited Findings

**Gloaguen et al., "Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?" (ETH Zurich / LogicStar; arXiv 2602.11988; v1 12 Feb 2026, v3 29 Sep 2026)**
- **Setup:** SWE-bench Lite (300 tasks, 11 Python repos, using LLM-generated context files), plus a new benchmark, CTXbench. CTXbench has 138 instances from 12 repos that have developer-committed context files, mined from 5,694 PRs. Agents tested: Claude Code (Sonnet 4.5), Codex (GPT-5.2 and GPT-5.1 mini) and Qwen Code (Qwen3-30B-Coder). — [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
- **Headline (EVIDENCE):** "providing context files does not generally improve task success rates, while increasing inference cost by over 20% on average." — [arXiv abstract](https://arxiv.org/abs/2602.11988)
- **LLM-generated files vs none:** resolution fell by about 0.5% on SWE-bench Lite and about 2% on CTXbench. Neither drop is significant (p = 0.87 and p = 0.37). — [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
- **Developer-written files vs none (CTXbench):** about +2.4%, not significant (p = 0.21). Developer files did significantly outperform LLM files (p = 0.038). — [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
  - **Caveat:** my extraction found an inconsistency in the paper. The introduction cites a roughly 7% developer-vs-LLM gap that does not match the section 4.2 figures, and one table header reads "Plan-Bench". Check against the PDF before quoting the 7% figure. — [arXiv PDF](https://arxiv.org/pdf/2602.11988)
- **Cost and steps:**
  - LLM-generated files added about 2.5 steps on SWE-bench and 3.9 on CTXbench, and raised cost by about 20% and 23%. Both increases are significant.
  - Developer files added about 3.3 steps and raised cost by up to 19%.
  - GPT-5.2 used 14–22% more reasoning tokens with context files.
  - Source: [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
- **Behaviour (EVIDENCE):**
  - Agents follow instructions. When `uv` was mentioned in the file, it was used about 1.6 times per instance, versus under 0.01 times when it was not mentioned.
  - With context files, agents run more tests, read and search more files, and run more quality checks.
  - Codebase overviews did not help agents find the relevant files sooner. For GPT-5.1 mini, the number of steps before it touched a relevant file rose significantly.
  - Source: [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
- **Repos with no other documentation:** when all other docs are removed, LLM-generated files improve results by about 2.7% and beat developer files. The authors suggest this explains anecdotal reports that context files help. — [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
- **Authors' recommendations:** omit LLM-generated context files for now. Limit developer files to things not already in the README, such as non-standard conventions and non-functional requirements. Evaluate any file rigorously. — [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
- **Limitations:** Python only. Measures task resolution only, not code quality or security. CTXbench is small (138 instances, one sample per setting). — [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
- **Secondary coverage:** some coverage headlines this paper as "AGENTS.md files reduce coding agent performance". That overstates it, because the drops were not significant. — [AI Tools Hub summary](https://ai-tools-aggregator-seven.vercel.app/blog/2026-02-17-agents-md-evaluation-study/)

**Lulla et al., "On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents" (arXiv 2601.20404; ICSE JAWs 2026 workshop; v2 30 Mar 2026)**
- **EVIDENCE:** across 10 repos and 124 GitHub PRs run with and without AGENTS.md, having the file was associated with 28.64% lower median wall-clock runtime and 16.58% fewer output tokens. Task completion stayed comparable. — [arXiv abstract](https://arxiv.org/abs/2601.20404)
- **Limitation (according to a later paper):** the study used Codex-family agents and did not control for how the file is injected. — [Khatri 2026](https://arxiv.org/html/2607.27250v1)
- **Conflict with Gloaguen et al.:** Gloaguen found cost went up by about 20% or more. Lulla found runtime and tokens went down. The two studies use different agents, tasks and metrics: inference cost vs runtime and output tokens. — [Gloaguen](https://arxiv.org/abs/2602.11988); [Lulla](https://arxiv.org/abs/2601.20404)

**Khatri, "Do Context Files Help Coding Agents? A Two-Agent Ablation Study on Real Repositories" (arXiv 2607.27250; 28 Jul 2026; independent researcher)**
- **Setup:**
  - Agents: Claude Code (claude-sonnet-4-6) and Codex CLI (gpt-5.5).
  - Tasks: 17 merged-PR tasks from 3 Python repos (pdm, firebase-admin-python, opshin), with context files of 248–1,236 words.
  - Three strategies: none, always_on (the full AGENTS.md in every prompt) and selective (wiki files loaded on demand).
  - 288 evaluated runs, scored against hidden gold tests.
  - Source: [arXiv HTML](https://arxiv.org/html/2607.27250v1)
- **Pass rates (EVIDENCE):**
  - Claude: none 53.3%, always_on 55.6%, selective 55.6% (permutation p = 1.00).
  - Codex: none 58.8%, always_on 56.9%, selective 52.9% (p = 0.66).
  - Source: [arXiv HTML](https://arxiv.org/html/2607.27250v1)
- **Efficiency:**
  - For Claude, selective loading cut cache-creation tokens significantly (Holm-corrected p = 0.012).
  - On opshin, whose AGENTS.md warns that its tests are slow, wall-clock time fell about 24% (2,689 s → about 2,050 s). Full-suite pytest runs per cell dropped from 3.67 to 2.44 (always_on) and 1.67 (selective). The author labels this exploratory.
  - Codex's efficiency metrics were flat.
  - Source: [arXiv HTML](https://arxiv.org/html/2607.27250v1)
- **Why runs failed:** failures came from implementation skill (design, pattern choice, wiring), not from missing repository facts a context file could have supplied. A probe found the real AGENTS.md never turned a near-miss into a pass. — [arXiv HTML](https://arxiv.org/html/2607.27250v1)
- **Limitations:** the study is badly underpowered. It can only detect effects above about 30 percentage points, and detecting 10 pp would need roughly 120–200 tasks. The two agents receive the file through different injection channels, and the selective corpus is confounded with corpus size. — [arXiv HTML](https://arxiv.org/html/2607.27250v1)

**McMillan, "Instruction Adherence in Coding Agent Configuration Files: A Factorial Study of Four File-Structure Variables" (arXiv 2605.10039; 11 May 2026)**
- **Setup:** 1,650 Claude Code sessions, giving 16,050 function-level observations. Two TypeScript codebases. Mostly Sonnet 4.6, with Opus 4.6 as a check. — [arXiv abstract](https://arxiv.org/abs/2605.10039)
- **File structure (EVIDENCE):** file size, instruction position, file architecture (single vs split files) and contradictions in adjacent files had no detectable effect on compliance after correction. For size and conflict, Bayes factors of 0.05–0.10 actively support no effect. — [arXiv abstract](https://arxiv.org/abs/2605.10039)
- **Within-session decay:** the largest effect was within a session. Each additional generated function lowered the odds of compliance by about 5.6% (OR = 0.944), non-monotonically. This replicated on the second codebase and on Opus 4.6. The analysis was not pre-specified. — [arXiv abstract](https://arxiv.org/abs/2605.10039)
- **Limitation:** compliance was measured on one trivial target annotation, so it may not generalise to complex rules. — [arXiv abstract](https://arxiv.org/abs/2605.10039)

**What these files contain (descriptive studies)**
- **Agent READMEs (arXiv 2511.12884; v2 Aug 2026):** 2,303 context files from 1,925 repos (922 CLAUDE.md, 694 AGENTS.md, 687 copilot-instructions.md).
  - Content shares: test procedures 75.9%, implementation details 70.8%, architecture 68.1%, security 14.8%, performance 14.5%.
  - The files "evolve like configuration code through frequent, small additions" and are "complex, difficult-to-read artifacts."
  - Sources: [arXiv abstract](https://arxiv.org/abs/2511.12884); [file counts via search snippet of PDF](https://arxiv.org/pdf/2511.12884)
- **Chatlatanagulchai et al., "On the Use of Agentic Coding Manifests" (arXiv 2509.14744):** 253 CLAUDE.md files from 242 repos. Structure is shallow, typically one main heading. The most common content is build/run instructions, implementation details and architecture. — [alphaxiv](https://www.alphaxiv.org/abs/2509.14744.md)
- **"Context Engineering for AI Agents in Open-Source Software" (MSR 2026):** found 466 of 10,000 mined repos had adopted a context-file format, and the formats have no standard yet. I only saw secondary coverage of this paper, so these figures are unverified. — [ClawSouls blog](https://blog.clawsouls.ai/en/tags/msr-2026/)

### Inferences
- Two descriptive studies show architecture overviews are among the most common content (68%). Gloaguen found overviews do not help. So what developers put in these files and what helps agents do not match.
- The instructions that produce measurable effects are specific to the repo and non-obvious to the agent:
  - which tool to use (`uv` usage went from under 0.01 to about 1.6 per instance)
  - warnings that tests are slow (about 24% less wall-clock time on opshin)
  - non-standard conventions

  A short file of such rules is better supported than a long descriptive overview.
- Because LLM-generated files were neutral to negative and cost more, there is evidence against blindly running `/init`. The exception is repos that have no other documentation.
- Null results from small studies (Khatri: 17 tasks; Gloaguen CTXbench: 138) do not prove "no effect". They rule out large effects only. SWE-bench-style tasks also do not measure the human-collaboration goals of a learning project, such as tutoring mode, stopping for review and progress tracking.
- McMillan found file structure does not matter but session length does. This favours short sessions and fresh context over fine-tuning the file's layout.

### Gaps
- None of the studies measured process-control instructions, such as "stop and wait for review" or "don't write the solution, teach". These are the kind of behavioural rules a learning project's CLAUDE.md contains.
- I found no controlled study of cursor rules (`.cursor/rules/*.mdc`) specifically, beyond the descriptive counts.
- No study covered non-Python stacks with real outcome metrics. McMillan used TypeScript but measured compliance only.
- I could not verify the full text of the MSR 2026 "Context Engineering" paper.

## Q2. Context rot, long-context degradation and instruction-count limits: what do they imply for always-loaded vs on-demand docs?

### Takeaway
The research is consistent. Model performance becomes less reliable as input grows, even on trivial tasks. It is sensitive to where information sits and to distractors. Instruction-following accuracy falls as the number of simultaneous instructions grows, with a bias toward instructions that come earlier. Anthropic's own guidance recommends minimal always-loaded context plus "just-in-time" retrieval. Together these support a small always-loaded file that points to documents loaded on demand.

### Cited Findings
**Chroma, "Context Rot" (Hong, Troynikov, Huber; 14 July 2025)**
- **Setup:** tested 18 LLMs (5 Anthropic, 7 OpenAI, 3 Google, 3 Qwen). — [Chroma](https://www.trychroma.com/research/context-rot)
- **Findings (EVIDENCE):**
  - Performance degrades with input length even on simple tasks.
  - Needle-question pairs with lower semantic similarity degrade faster.
  - Even one distractor lowers accuracy, and the effect grows with length.
  - Shuffled haystacks beat coherent ones across all 18 models.
  - On LongMemEval (306 prompts), every model did better with focused prompts (about 300 tokens) than with the full history (about 113k tokens).
  - In the repeated-words task (25–10,000 words, 1,090 variations), all models degraded.
  - Source: [Chroma](https://www.trychroma.com/research/context-rot)
- **Quotes:** "Where and how information is presented in a model's context strongly influences task performance". Models "do not use their context uniformly". — [Chroma](https://www.trychroma.com/research/context-rot)
- **Unverified figures:** some blogs circulate a "25–30% effective context" figure and a "7.9% drop" attributed to Chroma. I could not find either in the report. Treat both as unverified. — [search summary of secondary posts](https://particula.tech/blog/chroma-context-rot-long-context-degradation)

**Liu et al., "Lost in the Middle" (arXiv 2307.03172, 2023; TACL 2024)**
- **EVIDENCE:** retrieval and QA performance follows a U shape. It is best when relevant information is at the start or end of the context, and degrades considerably when it is in the middle of long contexts. — [arXiv](https://arxiv.org/abs/2307.03172); summarised in [MorphLLM](https://www.morphllm.com/context-rot)

**IFScale, "How Many Instructions Can LLMs Follow at Once?" (Distyl AI; arXiv 2507.11538, July 2025; NeurIPS 2025)**
- **Setup:** 20 models from 7 providers. Instruction density ranged from 10 to 500 keyword-inclusion constraints. — [arXiv](https://arxiv.org/html/2507.11538v1)
- **Findings (EVIDENCE):**
  - The best frontier models reached only 68% accuracy at 500 instructions.
  - Degradation followed three patterns:
    - threshold decay for reasoning models (o3, gemini-2.5-pro)
    - linear decay (gpt-4.1, claude-sonnet-4)
    - exponential decay (gpt-4o, llama-4-scout)
  - Models were biased toward earlier instructions.
  - Source: [arXiv](https://arxiv.org/html/2507.11538v1)
- **Limitation:** the constraints are simple keyword inclusions, not behavioural coding rules. — [arXiv](https://arxiv.org/html/2507.11538v1)

**Anthropic, "Effective context engineering for AI agents" (29 Sep 2025)**
- **Vendor guidance, grounded in its own observations:**
  - Context is a finite resource with an "attention budget". "Every new token introduced depletes this budget by some amount."
  - The goal is "the smallest set of high-signal tokens that maximize the likelihood of your desired outcome."
  - Source: [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Hybrid model:**
  - "CLAUDE.md files are naively dropped into context up front," while glob and grep let the agent fetch everything else just in time.
  - Agents should "maintain lightweight identifiers (file paths, stored queries, web links, etc.)" and load data at runtime ("progressive disclosure").
  - Source: [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Long tasks:** recommends compaction, structured note-taking (for example "maintaining a NOTES.md file"), and sub-agents that work in clean context windows and return condensed summaries. — [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

**HumanLayer, "Writing a good CLAUDE.md" (Kyle, 25 Nov 2025). OPINION, informed by IFScale.**
- **Instruction budget:**
  - Frontier thinking models follow "~150-200 instructions with reasonable consistency".
  - Claude Code's system prompt already contains "~50 individual instructions".
  - Consensus length is "< 300 lines is best", and HumanLayer's own root file is under 60 lines.
  - Source: [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- **Relevance filtering:** Claude Code wraps CLAUDE.md in a reminder that the content "may or may not be relevant to your tasks". Task-specific content is therefore more likely to be ignored. — [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- **Other recommendations:**
  - Progressive disclosure via separate, self-describing markdown files.
  - "Prefer pointers to copies" (file:line references rather than code snippets).
  - "Never send an LLM to do a linter's job".
  - Don't auto-generate with `/init`.
  - Source: [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)

### Inferences
- Several lines of evidence point the same way:
  - Degradation grows with length and is worse with distractors (Chroma).
  - Instruction count matters and earlier instructions are favoured (IFScale).
  - Information in the middle is under-used (Liu et al.).
  - Overviews don't help but specific instructions are followed (Gloaguen).

  Together these support a short always-loaded file of high-priority, broadly applicable rules near the top. Volatile or task-specific material belongs in separate files the agent reads on demand.
- Direct test of this design: Khatri's on-demand ("selective") strategy matched always_on on correctness and cut Claude's cache-creation tokens. The study is small, but the cost direction favours on-demand loading.
- McMillan found no size or position effect. That means position and length rules from general long-context research may matter less at CLAUDE.md scale (hundreds to low thousands of tokens) than at 100k-token scale. The bigger risk is context growing within a long session.

### Gaps
- No study directly measured CLAUDE.md length vs adherence at realistic file sizes with complex rules. McMillan comes closest, but used one trivial rule.
- The "150–200 instructions" figure is HumanLayer's reading of IFScale, not a measured result for coding-agent rules.

## Q3. Practical guidance on keeping AI-maintained docs current

### Takeaway
There is almost no controlled evidence here. The guidance is practitioner opinion and tooling. It converges on five practices:
1. Keep one canonical file with pointers, not copies.
2. Separate stable reference material from volatile state, such as a todo or progress file.
3. Make doc updates part of the task's definition of done.
4. Catch drift deterministically with hooks or CI, and use LLM review where needed.
5. Prune regularly, because files tend to grow by accretion.

### Cited Findings
- **Files grow by accretion (EVIDENCE, descriptive):** context files "evolve like configuration code through frequent, small additions". This implies a natural drift toward bloat. — [Agent READMEs, arXiv 2511.12884](https://arxiv.org/abs/2511.12884)
- **Remove redundancy (EVIDENCE-backed recommendation):** Gloaguen et al. recommend keeping only content not already in the README, such as non-standard conventions and non-functional requirements. Redundant overviews add cost without benefit. — [arXiv HTML v3](https://arxiv.org/html/2602.11988v3)
- **Pointers over copies (OPINION):** "Prefer pointers to copies". Code snippets in CLAUDE.md go stale, while file:line references do not duplicate content. — [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- **Use deterministic tools for checkable rules (OPINION):** linters and formatters, plus a Stop hook that runs them and feeds errors back. — [HumanLayer](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
- **Keep volatile state outside the context window (VENDOR GUIDANCE):**
  - Structured note-taking, such as a NOTES.md or to-do list, that persists outside the context window and is re-read later.
  - Compaction for long sessions.
  - Source: [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Separate the spec from changing state (PRACTITIONER):**
  - Harper Reed's workflow keeps a stable `spec.md` (built by having the LLM interview him one question at a time).
  - Alongside it sit `prompt_plan.md` (per-step prompts) and `todo.md`, a checklist the codegen tool ticks off. The todo file keeps state across sessions.
  - Sources: [harper.blog, Feb 2025](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/); [Simon Willison commentary](https://simonwillison.net/2025/Feb/21/my-llm-codegen-workflow-atm/)
- **Drift-detection tooling (PRACTITIONER/TOOLS, unverified efficacy):**
  - **Sync options:** a symlink, a pre-commit hook (not reproduced by `git clone`, so every teammate must install it), a SessionStart hook, or a CI drift check, which is rated safest for teams. — [DEV Community](https://dev.to/yurukusa/keep-agentsmd-and-claudemd-in-sync-5-user-side-fixes-and-where-each-quietly-breaks-35p5)
  - **Static checkers:** `agentslint` checks for stale paths, broken links and missing command targets. — [PyPI agentslint](https://pypi.org/project/agentslint/). A Cursor-forum CLI detects missing commands, dead paths and conflicting nested files. — [Cursor forum](https://forum.cursor.com/t/built-a-small-cli-to-detect-agents-md-drift-missing-commands-dead-paths-conflicting-nested-files/159582)
  - **Single-source generators with CI verify steps:** [Bernstein agents-md](https://bernstein.readthedocs.io/en/latest/agents-md/); [Ma'at](https://pkg.go.dev/github.com/getmaat/maat@v0.4.0)
  - **LLM-based drift review in CI:** `claude-code-action` checks merged PRs against the docs and opens a follow-up PR. It catches semantic drift that static checks miss, but is less deterministic. — [understandingdata.com](https://understandingdata.com/posts/doc-drift-detection-ci/)
- **Git history as the log (PRACTITIONER EXAMPLE):** Cloudflare's workers-oauth-provider points readers to the commit history: "Check out the commit history to see how Claude was prompted." Git, not a separate log file, holds the process record. — [HISTORY.md](https://github.com/cloudflare/workers-oauth-provider/blob/main/HISTORY.md)

### Inferences
- A defensible design based on the sources above:
  - **Stable, always-loaded rules:** short, behavioural and non-obvious, in CLAUDE.md.
  - **Stable reference loaded on demand:** the plan, architecture and conventions, behind pointers.
  - **Volatile state in one place:** a progress checklist or todo, updated as part of each milestone's "done" step.
  - **History in git:** commit messages and PRs, rather than an ever-growing session log in an always-loaded file.
- Accretion is documented. A periodic "prune" pass (delete what the README or code already says, and what the agent does correctly without being told) is consistent with Gloaguen's finding that redundant content adds cost.
- Mechanical drift (dead paths, renamed scripts) is cheap to catch with a script or CI step. Semantic drift (a doc that no longer matches the design) needs a human or LLM review step, which fits a "Done when" review checkpoint.

### Gaps
- I found no empirical study measuring how often AI-maintained docs go stale, or whether definition-of-done rules or hooks reduce drift.
- I found nothing measured comparing an in-repo progress file with an issue tracker or git log for agent state.
- I found no reliable figures on how well the drift tools listed above work. The sources are READMEs and blogs.

## Q4. How do developers transparently showcase AI-assisted work in portfolio or public repos, and what do readers find credible?

### Takeaway
The credible public examples share three traits:
1. The AI's role is stated plainly.
2. Concrete artifacts are exposed: prompts, specs, plans, transcripts or commit history.
3. The human's verification or review work is spelled out.

Advice on what hiring managers value comes almost entirely from career-advice blogs, not surveys. Those blogs agree that the risk is unexplained or generic AI output, not the use of AI itself.

### Cited Findings
- **Cloudflare workers-oauth-provider (Kenton Varda, Cloudflare; 2025–2026). A flagship example.**
  - What its HISTORY.md says:
    - "This library (including the schema documentation) was largely written with the help of Claude".
    - "Claude's output was thoroughly reviewed by Cloudflare engineers", with the code checked against the relevant RFCs.
    - Readers are invited to "Check out the commit history to see how Claude was prompted."
    - It states that the project is "not vibe coded".
    - It admits the first output was imperfect and was fixed by further prompting: "Not perfect, but I just told the AI to fix things, and it did."
    - Source: [HISTORY.md](https://github.com/cloudflare/workers-oauth-provider/blob/main/HISTORY.md)
  - The repo also links an AGENTS.md for contribution conventions from its README. — [GitHub README](https://github.com/cloudflare/workers-oauth-provider/)
- **Harper Reed, "My LLM codegen workflow atm" (Feb 2025):** publishes the workflow and keeps its artifacts in the repo (`spec.md`, `prompt_plan.md`, `todo.md`). Simon Willison called it "a very well-thought out process". — [harper.blog](https://harper.blog/2025/02/16/my-llm-codegen-workflow-atm/); [Simon Willison](https://simonwillison.net/2025/Feb/21/my-llm-codegen-workflow-atm/)
- **Simon Willison's practice:**
  - His posts and TILs routinely include the exact prompt and link the full Claude transcript, for example the GitHub OAuth Worker TIL. — [TIL](https://til.simonwillison.net/cloudflare/workers-github-oauth)
  - He also documents what review later found: missing error handling and a login CSRF bug from an unchecked `state` parameter, which he then fixed with Claude. — [Simon Willison blog, Nov 2024](https://feeds.simonwillison.net/2024/Nov/29/github-oauth-cloudflare/)
  - His AI-assisted-programming tag collects such posts. — [simonwillison.net tag](https://simonwillison.net/tags/ai-assisted-programming/)
  - His stance (OPINION): people remain responsible for checking and standing behind what they publish. — [search summary of Willison's writing](https://www.remio.ai/post/simon-willison-says-dont-be-a-meat-proxy-for-ai)
- **Career-advice sources (OPINION, low-quality / SEO-oriented):**
  - Recommend a short disclosure per project that names which tasks the AI did, and describes the developer's own contribution and verification. — [learnist.org](https://www.learnist.org/how-to-disclose-ai-tools-in-portfolio/); [Artech](https://www.artech.com/blog/ai-assisted-portfolio-credibility/)
  - Accept commit history, prompt logs and decision-explaining comments as proof of authorship. Live walkthroughs of the logic count as stronger. — [Artech](https://www.artech.com/blog/ai-assisted-portfolio-credibility/)
  - Treat unedited AI boilerplate in a README as a red flag. Code the candidate cannot explain in an interview undermines them. — [Vibe Coder Blog](https://blog.vibecoder.me/building-a-portfolio-that-shows-your-skills-not-just-ai)

### Inferences
- Applied to a learning or portfolio repo, the credible pattern would be:
  - a short "How this was built" section or file that states who did what. In this project the AI wrote the Part 1 code under milestone review, and the human wrote the Kubernetes and Terraform parts.
  - the plan and spec committed as the steering artifact.
  - git history with meaningful commits, including AI co-author trailers where applicable.
  - a record of review findings and corrections the human made.

  This mirrors the Cloudflare and Willison examples: an explicit role split, inspectable artifacts and documented verification.
- Raw session dumps are likely noise to readers. No source found recommends them. The examples that work publish curated artifacts (spec, plan, key prompts, transcripts linked from a write-up) rather than everything.
- The human-written Kubernetes and Terraform parts, with quiz and review history, are a direct answer to the "can you explain it?" concern the career blogs raise.

### Gaps
- I found no survey or systematic data on how hiring managers react to AI-usage disclosure in portfolios. All the available material is opinion from career blogs.
- I could not confirm a standing Simon Willison practice of committing prompt files to repos, as opposed to putting prompts in posts and transcripts.
- I did not inspect the workers-oauth-provider commit log directly to see how the prompts are formatted in the commit messages.
- I found no studies on whether AI-disclosure sections in READMEs change trust or adoption of open-source projects.
