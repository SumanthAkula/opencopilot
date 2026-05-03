---

description: "Task list for OpenCopilot plugin implementation"
---

# Tasks: GitHub Copilot Configuration Adapter for OpenCode

**Input**: Design documents from `specs/001-copilot-opencode-adapter/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Not requested in specification. Test tasks are NOT included.

**Organization**: Tasks are grouped by user story to enable independent implementation and
testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Exact file paths included in all descriptions

## Path Conventions

- Plugin source: `src/` at repository root
- Plugin entry: `.opencode/plugins/opencopilot.ts`
- Tests: `tests/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize TypeScript project structure and shared tooling.

- [x] T001 Initialize TypeScript project with `package.json`, `tsconfig.json`, and `bun.lockb` at repo root
- [x] T002 [P] Add `@opencode-ai/plugin` dependency and type declarations to `package.json`
- [x] T003 [P] Add `js-yaml` (or equivalent YAML parser) dependency to `package.json`
- [x] T004 Create `src/types.ts` with `CopilotInstructionFile`, `CopilotAgentDefinition`, `CopilotSkill`, and `PluginCache` type definitions per `specs/001-copilot-opencode-adapter/data-model.md`
- [x] T005 Create `tests/fixtures/sample-github/` directory tree with representative fixture files: `copilot-instructions.md`, `instructions/ts-rules.instructions.md`, `agents/security-auditor.md`, `skills/git-release/SKILL.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core parsing and scanning infrastructure shared by all user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T006 Create `src/parser.ts` with `parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string }` — handles YAML frontmatter delimited by `---`; returns `{ frontmatter: {}, body: content }` if no frontmatter
- [x] T007 [P] Create `src/glob-matcher.ts` with `matchesAny(filePath: string, patterns: string[]): boolean` — evaluates `applyTo` glob patterns against a file path using a glob library or manual `**`/`*` logic
- [x] T008 Create `src/scanner.ts` with `scanGithubDir(githubDir: string): Promise<PluginCache>` — walks `.github/` and returns a populated `PluginCache`; returns empty cache if directory does not exist; logs `[opencopilot] Loaded: N instruction files, M agents, K skills from .github/` to stderr on completion

**Checkpoint**: `parseFrontmatter`, `matchesAny`, and `scanGithubDir` are the shared foundation — all user story work depends on these three functions.

---

## Phase 3: User Story 4 + User Story 1 — Zero-Config Discovery & Instructions (Priority: P1) 🎯 MVP

**Goal**: Plugin auto-discovers `.github/` files at startup and injects Copilot instruction
content into the OpenCode system prompt before every LLM call.

**Independent Test**: Install plugin in a project with `.github/copilot-instructions.md`
containing a unique phrase, start an OpenCode session — every LLM response should reflect
the instruction without any `opencode.json` changes.

### Implementation for US4 (Zero-Config Discovery) + US1 (Instructions)

- [x] T009 [US1] Extend `src/scanner.ts` with `scanInstructionFiles(githubDir: string): Promise<CopilotInstructionFile[]>` — discovers `.github/copilot-instructions.md` (no frontmatter, `applyTo: ["**/*"]`) and `.github/instructions/**/*.instructions.md` (parse `applyTo` and `excludeAgent` frontmatter); skips empty files with a warning
- [x] T010 [P] [US1] Create `src/mapper.ts` with `buildInstructionSection(file: CopilotInstructionFile): string` — formats a `CopilotInstructionFile` as a Markdown section: `## Instructions from {relative_path}\n{content}`
- [x] T011 [US1] Create `.opencode/plugins/opencopilot.ts` — plugin entry point that: (1) calls `scanGithubDir(worktree + "/.github")` to populate `PluginCache` on init, (2) returns a hooks object with `experimental.chat.system.transform` and stubs for `config`, `tool.execute.before`, and `event`
- [x] T012 [US1] Implement `experimental.chat.system.transform` hook in `.opencode/plugins/opencopilot.ts` — for each `CopilotInstructionFile` in cache: if `applyTo` is `["**/*"]` (copilot-instructions.md), always inject; for path-specific files, evaluate `applyTo` against `cache.recentlyEditedFiles.get(sessionID) ?? new Set()` using `matchesAny`; push formatted sections via `buildInstructionSection` into `output.system`; catch all errors and log without rethrowing
- [x] T013 [US4] Implement `event` hook stub in `.opencode/plugins/opencopilot.ts` — on `file.watcher.updated` events: if the changed file is under `.github/`, re-scan that specific file and update `PluginCache`; if the changed file is any path, add it to `cache.recentlyEditedFiles[sessionID]` (cap at 100 entries per session)

**Checkpoint**: At this point, US4 (zero-config) and US1 (instructions) are fully functional. A project with `.github/copilot-instructions.md` or `.github/instructions/*.instructions.md` should have those instructions active in OpenCode sessions.

---

## Phase 4: User Story 2 — Copilot Agent Definitions Work in OpenCode (Priority: P2)

**Goal**: Agents defined in `.github/agents/*.md` are available as OpenCode subagents via
`@` mention, with their description, system prompt, and tool restrictions mapped correctly.

**Independent Test**: Create `.github/agents/code-reviewer.md` with `description` frontmatter,
start OpenCode, type `@code` — the agent should appear in autocomplete and respond with
its defined persona.

### Implementation for US2 (Agent Definitions)

- [x] T014 [US2] Extend `src/scanner.ts` with `scanAgentFiles(githubDir: string): Promise<CopilotAgentDefinition[]>` — discovers `.github/agents/*.md` and `.github/agents/*.agent.md`; parses frontmatter; derives `normalizedKey` (lowercase, hyphens only from filename); skips files missing `description` with a warning; checks for name collision with built-in agent names (`build`, `plan`, `general`, `explore`, `compaction`, `title`, `summary`) and suffixes with `-copilot` if collision found
- [x] T015 [P] [US2] Extend `src/mapper.ts` with `toOpenCodeAgent(def: CopilotAgentDefinition): AgentConfig` — maps `CopilotAgentDefinition` fields to OpenCode `config.agent` entry per the field mapping table in `specs/001-copilot-opencode-adapter/data-model.md`; implements `derivePermissions(tools)` (null→`{}`, `[]`→`{"*":"deny"}`, list→per-tool allow with tool alias normalization table from data-model.md)
- [x] T016 [US2] Extend `src/scanner.ts` `scanGithubDir` to also call `scanAgentFiles` and populate `cache.agents`
- [x] T017 [US2] Implement `config` hook in `.opencode/plugins/opencopilot.ts` — iterate `cache.agents`; for each entry, if `config.agent[normalizedKey]` does not already exist, set `config.agent[normalizedKey] = toOpenCodeAgent(def)`; initialize `config.agent` to `{}` if undefined; catch all errors

**Checkpoint**: At this point, US1, US2, and US4 are all functional independently. Copilot agent files produce visible, selectable agents in OpenCode.

---

## Phase 5: User Story 3 — Copilot Skills Work in OpenCode (Priority: P3)

**Goal**: Skills in `.github/skills/*/SKILL.md` appear in the agent's available skill list
and their content is served when invoked.

**Independent Test**: Create `.github/skills/git-release/SKILL.md` with valid `name` and
`description`, start OpenCode, ask the agent to "use the git-release skill" — the agent
acknowledges the skill and follows its instructions.

### Implementation for US3 (Skills)

- [x] T018 [US3] Extend `src/scanner.ts` with `scanSkillFiles(githubDir: string): Promise<CopilotSkill[]>` — discovers `.github/skills/*/SKILL.md`; parses `name`, `description`, `license`, `allowed-tools` frontmatter; validates `name` matches `^[a-z0-9]+(-[a-z0-9]+)*$` and matches directory name; skips files missing required fields with a warning
- [x] T019 [P] [US3] Extend `src/mapper.ts` with `buildSkillsListing(skills: CopilotSkill[]): string` — returns an XML block in OpenCode's `<available_skills>` format listing all skills by name and description
- [x] T020 [US3] Extend `src/scanner.ts` `scanGithubDir` to also call `scanSkillFiles` and populate `cache.skills`
- [x] T021 [US3] Extend `experimental.chat.system.transform` hook in `.opencode/plugins/opencopilot.ts` to also push `buildSkillsListing(cache.skills)` into `output.system` when `cache.skills.size > 0`
- [x] T022 [US3] Implement `tool.execute.before` hook in `.opencode/plugins/opencopilot.ts` — when `input.tool === "skill"` and `output.args.name` matches a key in `cache.skills`, mutate `output.args` to inject the skill content; if direct arg mutation is insufficient, push skill content via a follow-up `output.system` push (research exact interception mechanism against OpenCode `skill` tool source); no-op for skill names not in cache

**Checkpoint**: All four user stories are independently functional. A project with `.github/copilot-instructions.md`, `.github/agents/`, and `.github/skills/` works fully with OpenCode via the plugin.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Hardening, documentation, and cleanup across all stories.

- [x] T023 [P] Write `README.md` at repo root documenting: installation instructions, all supported Copilot file types, complete Copilot → OpenCode mapping table, all known gaps (from `specs/001-copilot-opencode-adapter/research.md`), and troubleshooting guide (from `specs/001-copilot-opencode-adapter/quickstart.md`)
- [x] T024 [P] Add error boundary in `src/scanner.ts` — wrap the entire `scanGithubDir` function body in try/catch; on any unhandled error, log `[opencopilot] Warning: scan failed: {error.message}` and return an empty `PluginCache` so the plugin never crashes OpenCode startup
- [x] T025 Validate plugin startup log output in `.opencode/plugins/opencopilot.ts` — confirm `[opencopilot] Loaded: N instruction files, M agents, K skills from .github/` is printed to stderr with correct counts after scan completes
- [x] T026 [P] Run `bun run build` (or `bun check` for type checking) and resolve any TypeScript errors across `src/`, `.opencode/plugins/`, and `tests/`
- [ ] T027 Manually verify quickstart scenarios from `specs/001-copilot-opencode-adapter/quickstart.md`: (1) instructions loaded, (2) agent available via `@`, (3) skill invoked

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — blocks all user story work
- **US4 + US1 (Phase 3)**: Depends on Phase 2 — can start immediately after foundational
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with Phase 3 if staffed
- **US3 (Phase 5)**: Depends on Phase 2 — can run in parallel with Phases 3 & 4 if staffed
- **Polish (Phase 6)**: Depends on all user story phases being complete

### User Story Dependencies

- **US4 + US1 (P1)**: Depends only on Foundational. No dependency on US2 or US3.
- **US2 (P2)**: Depends only on Foundational. No dependency on US1 or US3.
- **US3 (P3)**: Depends on Foundational. Extends US1's `system.transform` hook — best implemented after Phase 3 but technically independent at the scanner/mapper level.

### Within Each User Story

- Scanner extension → mapper extension → plugin hook wiring
- No test-first requirement (tests not in scope)

### Parallel Opportunities

- T002, T003 can run in parallel (different `package.json` entries — combine into one edit)
- T006, T007 can run in parallel (different files)
- T009, T010 can run in parallel (different files)
- T014, T015 can run in parallel (different files)
- T018, T019 can run in parallel (different files)
- T023, T024, T026 can run in parallel (different files/concerns)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch simultaneously:
Task: "Create src/parser.ts with parseFrontmatter function"      # T006
Task: "Create src/glob-matcher.ts with matchesAny function"     # T007
# Then, once both complete:
Task: "Create src/scanner.ts with scanGithubDir skeleton"       # T008
```

---

## Implementation Strategy

### MVP First (US4 + US1 Only — Phases 1–3)

1. Complete Phase 1: Setup (T001–T005)
2. Complete Phase 2: Foundational (T006–T008)
3. Complete Phase 3: US4 + US1 (T009–T013)
4. **STOP and VALIDATE**: Start OpenCode in a project with `.github/copilot-instructions.md` — confirm instructions appear in agent behavior
5. Plugin is immediately useful at this point

### Incremental Delivery

1. MVP → Instructions active in OpenCode
2. Add Phase 4 (US2) → Copilot agents selectable via `@`
3. Add Phase 5 (US3) → Copilot skills bridged
4. Phase 6 → Production-ready with docs and hardening

---

## Notes

- `[P]` tasks = different files, no shared state dependencies
- T011 (plugin entry point) must exist before T012, T013, T017, T021, T022 can be wired in
- T016 and T020 are scanner integration tasks — they extend `scanGithubDir` to call the new
  sub-scanners; these are small additions (1-2 lines each) but must happen after the
  sub-scanner is complete
- The `experimental.chat.system.transform` hook name is prefixed `experimental.` — if it
  is not available in the installed OpenCode version, fall back to the `event` +
  `session.prompt({ noReply: true })` pattern documented in `research.md` Decision 2
- No user-facing configuration file is created by this plugin — zero-config is the contract
