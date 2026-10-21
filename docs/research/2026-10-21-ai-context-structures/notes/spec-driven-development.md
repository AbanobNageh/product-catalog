# Spec-Driven Development (SDD) Frameworks and Docs-as-Code Practices for AI Coding Assistants

Research date: 2026-10-21. Every fact below carries an inline source. Items marked "(prior knowledge, not re-fetched)" are well-known facts I did not re-check in this session; the writer should treat them as lower confidence.

Context for the judgement sections: the target is a small solo learning/portfolio project. Part 1 is a NestJS + Go two-service app that the AI writes milestone by milestone. Parts 2–3 are Kubernetes manifests and Terraform modules that the human writes while the AI tutors. The project already has a `CLAUDE.md` pointing to a `PLAN.md` with an "Instructions for the AI assistant" section, per-milestone "Done when" checks and a Progress section.

---

## 1. GitHub Spec Kit: constitution, specify/plan/tasks flow, layout, commands, version/status

### Takeaway
Spec Kit is GitHub's MIT-licensed, Python CLI-based SDD toolkit (`specify`). It reached 1.0.0 on 2026-08-21 and was at 1.2.2 on 2026-10-19. Its core flow is constitution → specify → plan → tasks → implement, now followed by a newer `converge` loop. Each feature lives in a numbered `specs/NNN-feature/` folder on its own git branch. By 2026 it has grown into a platform with extensions, presets, bundles, workflows and an MCP server, which makes it heavier than it was at launch.

### Cited Findings
**Status and version**
- The repo has about 142.2k stars, 12.7k forks and 2,242 commits, under the MIT license. A news item mentions "Spec Kit 1.0 and the expanded toolkit" in an October 16, 2026 video. — [github/spec-kit](https://github.com/github/spec-kit)
- Recent releases. 1.2.2 (2026-10-19): workflow/extension fixes. 1.2.1 (2026-10-16): output capture for workflow steps, documents the MCP version and artifact tools. 1.2.0 (2026-10-13): built-in GitHub workflow step and a "filesystem policy foundation". 1.1.3 (2026-10-09): deprecates the core `taskstoissues` command. 1.1.1 (2026-10-06): experimental MCP stdio server. 1.0.0: 2026-08-21. — [Spec Kit CHANGELOG](https://raw.githubusercontent.com/github/spec-kit/main/CHANGELOG.md)
- `/speckit.converge` was added in 0.11.2. Per-integration command spelling (dot vs hyphen) first appears in 0.8.1 (2026-04-24, the earliest visible dated entry in the part of the changelog I read). — [Spec Kit CHANGELOG](https://raw.githubusercontent.com/github/spec-kit/main/CHANGELOG.md)
- Spec Kit was first announced by GitHub around September 2025 — (prior knowledge, not re-fetched) [GitHub blog: Spec-driven development with AI](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)

**Commands (current README)**
- The README now uses the hyphenated `/speckit-` prefix. Core SDD commands: `/speckit-constitution`, `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`, `/speckit-converge`. You "repeat implement and converge until convergence reports 'Converged.'" Clarify, checklist and consistency analysis are covered in the SDD walkthrough. — [github/spec-kit README](https://github.com/github/spec-kit)
- Optional extensions add commands. `specify extension add bug` gives `/speckit-bug-assess`, `-fix` and `-test`, with output in `.specify/bugs/<slug>/`. `specify extension add assess` gives `/speckit-assess-intake`, `-research`, `-define`, `-shape` and `-decide`, with output in `.specify/assessments/<slug>/`. Setup is `specify init my-project --integration copilot`, and many agents are supported through an integrations index. — [github/spec-kit README](https://github.com/github/spec-kit)
- The repo root includes `.specify/memory`, `extensions/`, `presets/`, `bundles/`, `workflows/`, `templates/`, `integrations/` and `spec-driven.md`. — [github/spec-kit](https://github.com/github/spec-kit)

**Philosophy and constitution (spec-driven.md)**
- "Power inversion": specs generate code, and code is the "last-mile" expression. Maintaining software means evolving the spec and regenerating plans and code. — [spec-driven.md](https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md)
- The example constitution articles:
  - I: Library-First ("Every feature… MUST begin its existence as a standalone library")
  - II: CLI Interface Mandate
  - III: Test-First Imperative ("NON-NEGOTIABLE… strict TDD")
  - IV–VI: project-defined
  - VII: Simplicity (at most 3 projects, no future-proofing)
  - VIII: Anti-Abstraction (use framework features directly)
  - IX: Integration-First Testing (real DBs over mocks, contract tests first)
  
  — [spec-driven.md](https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md)
- "Phase -1 gates" (Simplicity, Anti-Abstraction, Integration-First) run during planning. A failed gate needs a fix or a written justification in a "Complexity Tracking" section. — [spec-driven.md](https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md)
- Ambiguities must be flagged as `[NEEDS CLARIFICATION: specific question]` rather than guessed, and the spec is not complete until none remain. — [spec-driven.md](https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md)

**Feature layout and numbering**
- `/speckit.specify` scans existing specs for the next number (001, 002…), makes a semantic branch name (e.g. `003-chat-system`), creates that branch and creates `specs/[branch-name]/`. The listed outputs for that example are below. — [spec-driven.md](https://raw.githubusercontent.com/github/spec-kit/main/spec-driven.md)
  ```text
  specs/003-chat-system/
  ├── spec.md          # what/why: user stories, functional requirements, [NEEDS CLARIFICATION]
  ├── plan.md          # how: tech choices, phase gates, complexity tracking
  ├── research.md      # library/version research
  ├── data-model.md    # entities
  ├── contracts/       # API contracts (e.g. OpenAPI), contract tests
  ├── quickstart.md    # key validation scenarios
  └── tasks.md         # ordered, parallelisable ([P]) task list
  ```
- The commonly documented project-level layout is `.specify/memory/constitution.md`, `.specify/scripts/` and `.specify/templates/` (spec/plan/tasks templates). Only `.specify/memory` was visible in the fetched repo listing. — (prior knowledge, partly confirmed) [github/spec-kit](https://github.com/github/spec-kit)
  ```text
  .specify/
  ├── memory/constitution.md
  ├── scripts/            # create-new-feature, setup-plan, etc.
  └── templates/          # spec-template.md, plan-template.md, tasks-template.md
  specs/
  └── 001-<feature>/ ...  # as above
  ```
- Böckeler found that one Spec Kit spec spans many files (eight in one example), and that each spec gets its own branch. — [Martin Fowler / Böckeler, Understanding SDD: Kiro, spec-kit, and Tessl](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)

### Inferences
- The `specs/NNN-feature/` layout plus "spec per branch" fits feature-team work. A solo learner on milestone-sized work would produce many folders that nobody re-reads.
- The ideas worth borrowing without the tool are: a short "constitution" (already effectively `PLAN.md` section 0), `[NEEDS CLARIFICATION]` markers, `contracts/` (an OpenAPI or proto file shared by the NestJS and Go services is real, useful code-adjacent spec), and a `quickstart.md`-style validation list (the same idea as the plan's "Done when" checks).
- Constitution Article I (Library-First) and Article II (CLI Mandate) are opinionated defaults that don't suit a NestJS + Go web service. Adopting the template as-is would push the AI in odd directions, which matches Böckeler's "followed constitution rules too eagerly" observation.

### Gaps
- I could not fetch a current verbatim `.specify/` tree for 1.x. The README no longer shows `specs/NNN-feature/` and its links point to a walkthrough I did not read. Whether 1.x still writes `research.md`, `data-model.md`, `contracts/` and `quickstart.md` by default is unconfirmed (they are documented in `spec-driven.md`).
- The exact release in which `/speckit.` was renamed to `/speckit-` was not found. The changelog shows per-integration resolution rather than one rename.
- I found no single headline feature for 1.0.0 in the changelog excerpt.

---

## 2. AWS Kiro specs and steering files

### Takeaway
Kiro (AWS's agentic IDE, now also CLI and Web) uses three-file specs: `requirements.md` (EARS-style "WHEN … THE SYSTEM SHALL …" criteria) or `bugfix.md`, then `design.md`, then `tasks.md`. Specs come in Requirements-First, Design-First and "Quick Spec" (no approval gates) variants. Persistent context lives in `.kiro/steering/`, with three foundation files (`product.md`, `tech.md`, `structure.md`) and four inclusion modes. Kiro also reads `AGENTS.md`.

### Cited Findings
- Core files: `requirements.md` (user stories + acceptance criteria) for feature specs, or `bugfix.md` (current, expected and unchanged behaviour) for bugfix specs. Then `design.md` (architecture, sequence diagrams, data flow, error handling, testing strategy) and `tasks.md` (discrete, trackable tasks with real-time status). — [Kiro docs: Specs](https://kiro.dev/docs/specs/) (page updated 2026-10-15)
- Spec types: Feature Specs (Requirements-First or Design-First), **Quick Spec** ("generates all three artifacts in one pass without approval gates, for well-understood features") and Bugfix Specs. Kiro builds a dependency graph from `tasks.md` and runs independent tasks concurrently in "waves". — [Kiro docs: Specs](https://kiro.dev/docs/specs/)
- EARS in `requirements.md`: the pattern is "WHEN [condition/event] THE SYSTEM SHALL [expected behavior]", e.g. "WHEN a user submits a form with invalid data THE SYSTEM SHALL display validation errors next to the relevant fields". Kiro can analyse requirements for inconsistencies, ambiguities and gaps before design. — [Kiro docs: Feature Specs](https://kiro.dev/docs/specs/feature-specs/) (updated 2026-08-04)
- Requirements-First (Requirements → Design → Tasks) suits cases where behaviour is known and the architecture is flexible. Design-First (Design → Requirements → Tasks) suits cases with an architecture in mind or strict non-functional requirements. — [Kiro docs: Feature Specs](https://kiro.dev/docs/specs/feature-specs/)
- Steering lives in workspace `.kiro/steering/` or global `~/.kiro/steering/`, and workspace wins on conflict. The foundation files are `product.md` (purpose, users, features, goals), `tech.md` (frameworks, libraries, constraints) and `structure.md` (file organisation, naming, imports, architecture). — [Kiro docs: Steering](https://kiro.dev/docs/steering/) (updated 2026-10-21)
- Inclusion modes are set in YAML front matter: `always` (default), `fileMatch` (with `fileMatchPattern` glob or array), `manual` (referenced via `#filename`) and `auto` (matched on `description`, needs `name`). Kiro reads `AGENTS.md` at global, root and subdirectory level, always included. Steering can reference live files, line ranges and folders. — [Kiro docs: Steering](https://kiro.dev/docs/steering/)
- Böckeler describes Kiro requirements as user stories with GIVEN/WHEN/THEN acceptance criteria and tasks that trace back to requirement numbers, and calls Kiro "mostly spec-first". — [Böckeler, martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- Typical layout (spec path is prior knowledge; the steering path is confirmed):
  ```text
  .kiro/
  ├── steering/
  │   ├── product.md
  │   ├── tech.md
  │   ├── structure.md
  │   └── api-standards.md      # e.g. fileMatch: "src/api/**"
  └── specs/
      └── <feature-name>/
          ├── requirements.md   # or bugfix.md
          ├── design.md
          └── tasks.md
  ```

### Inferences
- The steering split (product / tech / structure) maps directly onto what a solo project's `CLAUDE.md` or `AGENTS.md` should contain, and is the most portable idea from Kiro. `fileMatch` scoping suggests path-scoped rules in Claude Code for the K8s/Terraform folders, e.g. "tutor mode, don't write solutions".
- Quick Spec shows that Kiro's own team accepted that the full gated flow is too heavy for well-understood work.
- EARS-style "WHEN … SHALL …" lines are a cheap way to make "Done when" checks testable without adopting Kiro.

### Gaps
- The fetched Kiro pages did not state the `.kiro/specs/<feature>/` path explicitly. It is from prior knowledge.
- I did not retrieve the full EARS pattern set (ubiquitous, event-driven, state-driven, unwanted-behaviour, optional-feature, from Mavin et al.) from a primary source this session.

---

## 3. BMAD Method: personas, PRD/architecture, sharded stories, docs layout, v6 changes

### Takeaway
BMAD is a multi-persona, agile-roles framework. Stable is v6.12 (2026-09-03), and a v7 preview on `main` restructures it again. In v6 the classic separate personas were consolidated: Barry, Quinn and Bob merged into Amelia (Dev) in v6.3.0, and Paige was retired and document sharding removed in v6.11.0. Implementation goes through one `bmad-build` skill that scales its ceremony to the change. v7 moves documents into "initiatives" with a Product Owner persona, Sofia, and `tickets.toml`. BMAD is the most ceremony-heavy option and the fastest-moving one.

### Cited Findings
- BMAD describes itself as an agile method for AI-driven development covering "what to build, how it holds together, and how it changes as you learn". Small changes go straight to build and complex work gets more planning. — [BMAD-METHOD README](https://github.com/bmad-code-org/BMAD-METHOD)
- Stable is v6.12, installed with `npx bmad-method install` (Node 20.12+, Python 3.10+) and "frozen except for bug fixes". The V7 Preview Alpha is on `main` (`npx skills add bmad-code-org/BMAD-METHOD --skill '*'`, or a Claude Code plugin via `/plugin marketplace add bmad-code-org/bmad-plugins`). The README gives a v7 ETA of 2026-10-16. Modules: BMad Method, BMad Builder, Creative Intelligence Suite, Test Architect, BMad Loop (unattended epic build/verify/retro) and Game Dev Studio. — [BMAD-METHOD README](https://github.com/bmad-code-org/BMAD-METHOD)
- From the changelog:
  - v6.0.0 = "V6 Stable Release! The End of Beta!"
  - v6.3.0 consolidated Barry (quick-flow solo dev), Quinn (QA) and Bob (Scrum Master) into Amelia, the Developer agent.
  - v6.11.0: Mary remains Analyst, Paige (tech writer) retired, sharding tools `bmad-index-docs` and `bmad-shard-doc` removed, and `bmad-build` introduced as the renamed Quick Dev ("the one official way BMad implements code").
  - v6.12.0 (2026-09-03): Build "decides how much ceremony a change needs… simple changes get a two-section spec".
  
  — [BMAD CHANGELOG](https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/CHANGELOG.md)
- v7 (unreleased draft) introduces Initiatives ("every document lands in the active initiative", with `bmad migrate method` for v6 projects). Sofia, the Product Owner (`bmad-agent-po`), replaces `bmad-spec`, `bmad-ticket` and `bmad-correct-course`. Tickets go in a `tickets/` folder as `tickets.toml`, `planning_artifacts` is no longer read, and web bundles are removed. — [BMAD CHANGELOG](https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/CHANGELOG.md)
- Current planning-path guidance sizes planning by intent:
  - Trivial: "You don't need BMad for an obvious, low-risk edit."
  - One session: `bmad-build`.
  - Epic-sized: Sofia slices it into stories in an ordered `tickets.toml`.
  - Project-sized (about 20+ sessions): shared product docs, then an initiative sliced into epics.
  
  A PRD is needed only "when more than one person must agree on what the product is, or more than one epic must not diverge". — [BMAD docs: Choose a Planning Path](https://docs.bmad-method.org/plan/choose-a-planning-path/)
- Documents go into `<type>-<slug>/` folders inside the active initiative, defaulting to `_bmad-output`. Outputs include `brief-<slug>.md`, `prd-<slug>.md` + `addendum.md` + `.memlog.md`, `DESIGN.md`/`EXPERIENCE.md`/`ux-<slug>.md`, `architecture-<slug>.md` and `research-<topic>.md`. — [BMAD docs: Choose a Planning Path](https://docs.bmad-method.org/plan/choose-a-planning-path/)
- v6-era layout per secondary sources: planning outputs (PRD, architecture, epics) in `_bmad-output/planning-artifacts/`, with epics as one `epics.md` or sharded files. Sprint tracking is `implementation-artifacts/sprint-status.yaml`, "the single tracking artifact the whole dev cycle reads and writes". Stories sit in `implementation-artifacts/stories/` (sources differ on whether stories go there or under `epics/`). — [BMAD docs (getting started, v6)](https://docs.bmad-method.org/tutorials/getting-started), [Plannotator BMAD profile](https://docs.plannotator.ai/frameworks/bmad-method.md), [developertoolkit.ai](https://developertoolkit.ai/en/ecosystem/frameworks/bmad-method/)
  ```text
  _bmad/                       # installed method: config.yaml, agents/skills/workflows (v6)
  _bmad-output/
  ├── planning-artifacts/      # product-brief, prd.md, architecture.md, epics.md (or sharded)
  └── implementation-artifacts/
      ├── sprint-status.yaml
      └── stories/             # one story/spec file per story
  ```
  (This tree is assembled from secondary sources; v7 replaces it with initiative folders and `tickets.toml`.)

### Inferences
- BMAD's own guidance now says a solo, single-person project without diverging epics doesn't need a PRD. Its later releases deliberately cut personas, sharding and ceremony, which is an implicit concession to the overhead critique.
- The classic "sharded PRD → architecture → story files by a Scrum Master agent" flow that most 2025 tutorials describe no longer exists in current BMAD. The report should not present it as current.
- The ideas worth borrowing are the single status file the AI reads and writes (`sprint-status.yaml`, already equivalent to the Progress section of `PLAN.md`) and "ceremony scales with change size".
- The version churn (v6.0 → v6.12 → v7 in about a year, with breaking layout migrations) is itself a cost for a learning project.

### Gaps
- No v6.0.0 release date was found. The v6 `_bmad/` internal tree was not confirmed from a primary source, and the getting-started page now redirects to a v7-style "build your first change" page.
- Whether v7 shipped on or around 2026-10-16 is unconfirmed. The changelog still marked it "Unreleased" when fetched.

---

## 4. Other notable frameworks: OpenSpec, Tessl, Agent OS

### Takeaway
OpenSpec (Fission-AI, about 72.6k stars) is the lightest mainstream SDD tool. It keeps living specs in `openspec/specs/` and per-change proposals in `openspec/changes/<name>/` with spec deltas, then archives each change and merges it into the specs. It is explicitly brownfield-friendly and "fluid, not rigid". Tessl bets on spec-as-source but has pivoted mostly to a skills registry, and its framework is still closed beta. Agent OS v3 (Builder Methods) is "standards-first": product mission/roadmap/tech-stack docs plus codebase-derived standards, with spec writing delegated to the agent's plan mode.

### Cited Findings
**OpenSpec**
- OpenSpec adds "a lightweight spec layer so you and your AI agree on what to build before any code is written". It works with 30+ assistants, has about 72.6k stars, installs via `npm @fission-ai/openspec@latest` (Node 20.19+), and is "built for brownfield not just greenfield". Its principles: fluid not rigid, iterative not waterfall, easy not complex, scalable from personal projects to enterprises, and "no rigid phase gates". — [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
- Commands. Default profile: `/opsx:explore` and `/opsx:propose <name>`, then `/opsx:apply` and `/opsx:archive`. Expanded profile: `/opsx:new`, `/opsx:continue`, `/opsx:ff`, `/opsx:verify`, `/opsx:bulk-archive`, `/opsx:onboard`. Spec deltas use headings like `ADDED Requirements` with WHEN/THEN scenarios. Archiving moves the folder to `openspec/changes/archive/2025-01-23-add-dark-mode/` and updates the specs. "Stores (beta)" let planning live in a separate shared repo. — [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
  ```text
  openspec/
  ├── specs/                       # living source of truth, per capability
  └── changes/
      ├── add-dark-mode/
      │   ├── proposal.md          # why / what changes
      │   ├── specs/               # deltas: ADDED/MODIFIED/REMOVED Requirements + scenarios
      │   ├── design.md            # optional technical decisions
      │   └── tasks.md             # checklist
      └── archive/
          └── 2025-01-23-add-dark-mode/
  ```
- Spec Kit 1.0.13 (2026-09-29) added an "openspec extension" to its catalog. — [Spec Kit CHANGELOG](https://raw.githubusercontent.com/github/spec-kit/main/CHANGELOG.md)

**Tessl**
- In Böckeler's October 2025 review, Tessl Framework (private beta) was a CLI plus MCP server with `@generate`/`@test` tags and `tessl build`. Generated files carry "GENERATED FROM SPEC - DO NOT EDIT", one spec maps to one code file, and the same spec regenerated non-deterministically. It was the only tool aiming at spec-anchored/spec-as-source. — [Böckeler, martinfowler.com](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- Tessl was repositioned on 2026-01-29: the registry became a skills registry and the framework launched in closed beta. The registry has been in open beta since September 2025, with 3,000+ skills by June 2026 and a Snyk security score since March 2026. One reviewer calls spec-as-source "still mostly a thesis as of mid-2026". — [CodeMySpec: Tessl Review (2026)](https://codemyspec.com/blog/tessl-review), [rywalker.com research note](https://rywalker.com/research/tessl), [Tessl registry: tessl-labs/spec-driven-development](https://tessl.io/registry/tessl-labs/spec-driven-development) (secondary sources; not verified against Tessl announcements)

**Agent OS (Builder Methods)**
- v3 ("Leaner and more aligned for 2026") keeps standards and product planning. New in v3: `/discover-standards` (the agent proposes standards from the codebase), `/inject-standards` (into conversations, plans or Claude Skills) and an `index.yml` for relevance detection. Spec writing moved to the agent's native plan mode, plus `/shape-spec` for targeted questions. Product files are `agent-os/product/mission.md`, `roadmap.md` and `tech-stack.md`. Profiles manage standards sets per project type. — [Agent OS migration (buildermethods.com)](https://buildermethods.com/agent-os/migration), [Agent OS v3 discussion #310](https://github.com/buildermethods/agent-os/discussions/310), [The 3-Layer Context System](https://buildermethods.com/agent-os/concepts)
- One review says Agent OS "changed shape significantly in January 2026", and that much secondhand coverage describes the old version. — [CodeMySpec: Agent OS Review (2026)](https://codemyspec.com/blog/agent-os-review)
  ```text
  agent-os/
  ├── product/
  │   ├── mission.md
  │   ├── roadmap.md
  │   └── tech-stack.md
  ├── standards/          # + index.yml for relevance
  └── specs/              # dated spec folders (layout unchanged from v2)
  ```

### Inferences
- OpenSpec's "living spec plus change deltas, archive on done" model is the closest fit to how specs actually stay in sync with code. Archiving forces a reconciliation step, which directly targets drift.
- Agent OS's three-layer model (standards / product / specs) and Kiro's steering trio converge on the same idea: a small, always-loaded "what, with what, how organised" context. That idea is more durable than any specific per-feature workflow.
- A trend across all of these tools in 2026: they are folding into the agents' native features (plan mode, skills, AGENTS.md, plugins) rather than standing alone.

### Gaps
- Exact current OpenSpec version and release date: the Releases section was empty in the fetch.
- Other 2026 entrants (e.g. agent-native "plan mode" conventions, Cursor/Copilot planning features, Superpowers-style skill packs) were not researched in depth.

---

## 5. ADRs (Nygard, MADR, adr-tools) as AI context; Diátaxis for organising docs

### Takeaway
ADRs are short, numbered, immutable-once-accepted records of one decision each: context, decision, consequences. MADR 4.0.0 (2024-09-17) is the most-used structured template and recommends `docs/decisions/NNNN-title-with-dashes.md`. For an AI assistant, ADRs give stable, low-drift "why" context: they record a moment in time, so they don't go stale the way a spec describing current behaviour does. Diátaxis (tutorials / how-to / reference / explanation) gives a lightweight way to say where every non-plan doc belongs.

### Cited Findings
- An ADR "captures a single AD and its rationale", including trade-offs and consequences, and the collection forms the decision log. The site credits Michael Nygard's 2011 post with popularising ADRs and lists Y-statements (Zdun et al.) as an alternative format. — [adr.github.io](https://adr.github.io/)
- Nygard's original format has the sections Title, Status, Context, Decision and Consequences. The records are short, numbered sequentially, kept in the repo, and superseded rather than edited. — (prior knowledge, not re-fetched) [Nygard, Documenting Architecture Decisions (2011)](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- `adr-tools` (Nat Pryce) is a shell CLI (`adr init doc/adr`, `adr new …`, `adr new -s 3 …` to supersede) built on the Nygard format. — (prior knowledge, not re-fetched) [npryce/adr-tools](https://github.com/npryce/adr-tools)
- MADR 4.0.0 (2024-09-17) sections:
  - Title
  - Context and Problem Statement (required)
  - Decision Drivers
  - Considered Options (required)
  - Decision Outcome (required), with optional Consequences and Confirmation
  - Pros and Cons of the Options
  - More Information
  
  Optional YAML front matter: `status` (proposed / rejected / accepted / deprecated / superseded by ADR-NNNN), `date`, `decision-makers`, `consulted`, `informed`. Location is `docs/decisions` and naming is `NNNN-title-with-dashes.md`. "Bare" and "minimal" templates also exist. — [MADR](https://adr.github.io/madr/)
- Diátaxis identifies four documentation needs and forms: tutorials, how-to guides, technical reference and explanation. It covers content, style and architecture, has been adopted in "hundreds of documentation projects" (testimonials from Vonage, Gatsby, Cloudflare), and calls itself lightweight with no implementation constraints. — [diataxis.fr](https://diataxis.fr/)
- Diátaxis was created by Daniele Procida and arranges the four types on two axes: action vs cognition, and acquisition (study) vs application (work). — (prior knowledge; not stated on the fetched home page) [diataxis.fr](https://diataxis.fr/)

### Inferences
- For AI context, ADRs complement the plan. `PLAN.md` says what is next, and ADRs say why a choice was made (e.g. "Go service uses gRPC vs REST", "Postgres vs SQLite", "kind vs minikube", "Terraform state backend"). An assistant told "read docs/decisions before proposing architecture changes" is less likely to quietly undo earlier choices, which addresses the "agent recreated/ignored existing structure" failure Böckeler saw.
- For a learning project, the MADR "Considered Options + Pros/Cons" sections double as learning artefacts and portfolio evidence of reasoning. The MADR minimal template keeps the cost low.
- Diátaxis mapping for this repo:
  - Tutorial: a README quickstart ("run both services with docker compose").
  - How-to: "deploy to kind", "apply Terraform".
  - Reference: OpenAPI/proto contracts, env vars, Make/PowerShell targets.
  - Explanation: ADRs plus K8s/Terraform concept notes the AI tutors with.
  
  `PLAN.md` itself is project management, not documentation, and sits outside Diátaxis.

### Gaps
- I found no primary source (vendor doc or study) that measures ADRs' effect on AI assistant behaviour. The AI-context benefit above is inference and practitioner convention, not evidence.
- adr-tools' current maintenance status was not checked.

---

## 6. Critiques: overhead, markdown sprawl, spec drift; when SDD is overkill

### Takeaway
The most authoritative critique is Birgitta Böckeler's (Thoughtworks, on martinfowler.com, 2025-10-15). It finds that SDD tools are mostly "spec-first" in practice, inflate small tasks ("a sledgehammer to crack a nut"), produce verbose markdown that is harder to review than code, give a false sense of control, and echo model-driven development's failure modes. Thoughtworks Radar placed SDD in "Assess" (Nov 2025). SDD is overkill when the work is small, exploratory or done by one person, unless the spec is kept to a thin, living layer.

### Cited Findings
- Three levels: **spec-first** (spec for the current task, may be discarded), **spec-anchored** (kept and evolved with the feature) and **spec-as-source** (humans edit only specs, code is generated). Böckeler finds that all tools are spec-first, few commit to spec-anchored, and maintenance strategy is vague. — [Böckeler, martinfowler.com, 2025-10-15](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- Overhead: Kiro turned a small bug into 4 user stories with 16 acceptance criteria, "like using a sledgehammer to crack a nut". Spec Kit felt like overkill for a medium feature, and plain AI-assisted coding might have given more control in the same time. — [Böckeler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- Review burden: "To be honest, I'd rather review code than all these markdown files." Spec Kit's files were repetitive and verbose. — [Böckeler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- False sense of control: agents ignored instructions. Spec Kit recreated existing classes as duplicates, and elsewhere followed constitution rules too eagerly. Heavy up-front specs conflict with the small iterative steps that work best for control. It was unclear when specs should be functional vs technical. The model-driven development parallel suggests spec-as-source could inherit "inflexibility and non-determinism". Closing question: "Are we making something worse in the attempt of making it better?" — [Böckeler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- Thoughtworks Technology Radar, Assess ring (published 2025-11-05; not on the current Vol. 34, 2026/04): "the workflows remain elaborate and opinionated", "some generate lengthy spec files that are hard to review", and "handcrafting detailed rules for AI ultimately doesn't scale". — [Thoughtworks Radar: Spec-driven development](https://www.thoughtworks.com/radar/techniques/spec-driven-development)
- "Waterfall" debate. Defenders argue the objection confuses writing a spec before coding with freezing it, and concede that SDD "practiced badly, with frozen specifications handed off to implementers, does reproduce waterfall's failure modes". — [Augment Code: SDD vs Waterfall](https://www.augmentcode.com/guides/spec-driven-development-vs-waterfall)
- Small and exploratory work: "SDD requires knowing what to specify. If you do not know yet, specs are premature." — [Glukhov: SDD vs Vibe Coding](https://glukhov.org/ai-devtools/vibe-coding/spec-driven-development-vs-vibe-coding/)
- Spec drift: one essay argues SDD is the "prose-spec drift trap reborn", a repeating cycle of specification tools that drift from code. — [dev.to: SDD is the prose-spec drift trap reborn](https://dev.to/tmfrisinger/spec-driven-development-is-the-prose-spec-drift-trap-reborn-4p99)
- A search summary reported that Kent Beck and Martin Fowler criticised full up-front specification in early January 2026, and that a response argues "spec-anchored" survives the critique. — [levelup.gitconnected: SDD, Kent Beck and Martin Fowler](https://levelup.gitconnected.com/sdd-kent-beck-and-martin-fowler-why-spec-anchored-development-wins-a4c838d5be11) (member-only; claim not verified against Beck/Fowler primary sources)
- The vendors' own concessions:
  - Kiro added Quick Spec "without approval gates, for well-understood features". — [Kiro docs](https://kiro.dev/docs/specs/)
  - BMAD says "You don't need BMad for an obvious, low-risk edit", needs a PRD only when more than one person must agree, and its Build gives simple changes a two-section spec. — [BMAD planning path](https://docs.bmad-method.org/plan/choose-a-planning-path/), [BMAD CHANGELOG](https://raw.githubusercontent.com/bmad-code-org/BMAD-METHOD/main/CHANGELOG.md)
  - OpenSpec markets "no rigid phase gates". — [OpenSpec](https://github.com/Fission-AI/OpenSpec)

### Inferences: when SDD is overkill, and what fits this project
- SDD tooling tends to be overkill when:
  - one person is both "PM" and implementer;
  - tasks are milestone-sized and well understood;
  - the goal is learning by doing rather than throughput;
  - specs would describe current behaviour that the code and tests already express.
  
  All of these apply here, especially in Parts 2–3, where the human writes the code. A generated spec or tasks list would amount to the solution, which conflicts with the tutor role.
- What survives the critiques and suits this project (a "spec-lite" stack):
  1. **One always-loaded steering file** (`CLAUDE.md`/`AGENTS.md`, already in place) covering product, tech and structure in the Kiro/Agent OS sense, plus role rules ("Part 1: write code; Parts 2–3: tutor only"). Path-scoped rules could enforce tutor mode in `k8s/` and `terraform/`.
  2. **One plan file as roadmap + status** (`PLAN.md` with milestones, "Done when" checks, a Progress section). This is the BMAD `sprint-status.yaml` / Agent OS `roadmap.md` idea without the framework. The AI ticks items, which keeps drift visible in one place.
  3. **Testable acceptance checks** in EARS-ish form inside each milestone ("WHEN GET /products?category=x THE API SHALL return only matching items"). These turn "Done when" into tests and quiz prompts.
  4. **Code-adjacent contracts** (OpenAPI for NestJS, proto/OpenAPI for Go) as the only "spec" that is also code. This is Spec Kit's `contracts/` idea, and it can't drift silently if CI validates it.
  5. **ADRs (MADR minimal) in `docs/decisions/`** for the 5–15 real decisions. They are low-drift, double as learning and portfolio artefacts, and keep the AI from re-litigating choices.
  6. **Optionally, OpenSpec-style change folders only for a cross-service change** (e.g. adding a feature that touches both services). Archive them when done so nothing lingers.
  7. **Diátaxis** as the filing rule for `docs/` (README tutorial, how-tos, reference, explanation).
- Avoid: a full Spec Kit `specs/NNN-*` per milestone (8 files each, constitution defaults that don't fit), BMAD persona chains (version churn, PRD explicitly not needed for one person), and Tessl spec-as-source (closed beta, non-deterministic).
- Drift mitigation that works at small scale: give every planning doc a single owner (the AI updates `PLAN.md` progress at each milestone end); prefer docs that record decisions (ADRs, archived changes) over docs that restate current behaviour; and treat tests and contracts as the executable spec.

### Gaps
- I found no quantitative study (controlled or survey) on SDD productivity or drift for small projects. Critiques and defences are practitioner opinion.
- The Beck/Fowler January 2026 remarks were not verified from a primary source.
- I did not find a 2026 follow-up by Böckeler updating the October 2025 assessment for Spec Kit 1.x or Kiro's Quick Spec.
