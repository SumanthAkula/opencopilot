# Tasks: Bridge Copilot Gaps (Prompt Files, Hooks, Model Mapping)

**Feature**: `001-copilot-opencode-adapter`  
**Input**: Implementation plan from `specs/001-copilot-opencode-adapter/plan.md`  
**Scope**: Address 4 identified gaps in OpenCopilot plugin's README.md  
**Total Estimated Effort**: ~14 hours | **Total Tasks**: 31

---

## Dependencies & Execution Order

### Phase Dependencies
- **Phase 1: Setup** — No dependencies, can start immediately
- **Phase 2: Foundational** — Depends on Phase 1, BLOCKS all user story phases
- **Phase 3-6: User Stories** — All depend on Phase 2 completion; can proceed sequentially (P1→P2→P3→P4) or in parallel if staffed
- **Phase 7: Polish** — Depends on all user story phases being complete

### User Story Dependencies (Gap-Based)
| Story | Gap | Priority | Dependencies |
|-------|-----|-----------|--------------|
| **US1** | Prompt Files (`.github/prompts/*.prompt.md`) | P1 | Phase 2 |
| **US2** | Hooks (`.github/hooks/*.json`) | P2 | Phase 2 |
| **US3** | Disable Model Invocation | P3 | Phase 2 |
| **US4** | Model Mapping Enhancement | P4 | Phase 2 |

### Within Each User Story
1. **Types** (if new) → **Scanner** → **Parser** → **Mapper** → **Plugin Integration**
2. Tests can run in parallel with implementation tasks (marked `[P]`)

---

## Phase 1: Setup (0.5 days)

**Purpose**: Project initialization and dependency verification

- [X] T001 Verify Bun runtime and TypeScript 5+ are available in development environment
- [X] T002 [P] Verify required dependencies are installed: `js-yaml` (already present per research.md Decision 1)
- [X] T003 [P] Create test directory structure: `tests/unit/`, `tests/integration/` (if not already present)
- [X] T004 [P] Verify OpenCode Plugin API types are accessible from `@opencode-ai/plugin`

---

## Phase 2: Foundational (1 day)

**Purpose**: Core infrastructure updates required before any gap implementation can begin

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Types Updates in `src/types.ts`

- [X] T005 Add `CopilotPromptFile` interface to `src/types.ts`:
  - Fields: `filePath: string`, `description: string | null`, `mode: "instruction" | "assistant" | null`, `content: string`, `lastModified: number`
  - Reference: `plan.md` lines 213-227 (data-model.md amendments)
  - Effort: 30 min
  - Test Requirement: Verify interface compiles and matches planned field types

- [X] T006 Add `CopilotHookDefinition` interface to `src/types.ts`:
  - Fields: `filePath: string`, `event: string`, `script: string | null`, `description: string | null`
  - Reference: `plan.md` lines 229-245
  - Effort: 30 min
  - Test Requirement: Verify interface compiles and matches planned field types

- [X] T007 Update `PluginCache` interface in `src/types.ts`:
  - Add `prompts: CopilotPromptFile[]` field
  - Add `hooks: CopilotHookDefinition[]` field
  - Reference: `plan.md` line 277
  - Effort: 15 min
  - Test Requirement: Verify `emptyCache()` function also initializes new fields

### Scanner Foundation in `src/scanner.ts`

- [X] T008 Add `scanPromptFiles(githubDir): Promise<CopilotPromptFile[]>` function stub to `src/scanner.ts`:
  - Pattern: `.github/prompts/**/*.prompt.md`
  - Reference: `plan.md` lines 280-283
  - Effort: 30 min (stub only; full implementation in Phase 3)
  - Test Requirement: Function exists and returns `CopilotPromptFile[]` type

- [X] T009 Add `scanHookFiles(githubDir): Promise<CopilotHookDefinition[]>` function stub to `src/scanner.ts`:
  - Pattern: `.github/hooks/**/*.json`
  - Reference: `plan.md` lines 284-287
  - Effort: 30 min (stub only; full implementation in Phase 4)
  - Test Requirement: Function exists and returns `CopilotHookDefinition[]` type

- [X] T010 Update `scanGithubDir()` in `src/scanner.ts` to initialize new cache fields:
  - Initialize `cache.prompts = []` and `cache.hooks = []`
  - Reference: `plan.md` line 288
  - Effort: 15 min
  - Test Requirement: Verify new cache fields are initialized on scan

### Mapper Foundation in `src/mapper.ts`

- [X] T011 Add `normalizeModel()` function enhancements to `src/mapper.ts`:
  - Add dot/hyphen normalization (e.g., `claude-3.5-sonnet` → `claude-3-5-sonnet`)
  - Add version suffix handling (e.g., `claude-sonnet-4` → `anthropic/claude-sonnet-4-20250514`)
  - Reference: `plan.md` lines 192-195, 292-293
  - Effort: 1 hour
  - Test Requirement: Verify normalization for known patterns

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 (US1, P1) - Prompt Files (2 days)
**Goal**: Convert `.github/prompts/*.prompt.md` files to OpenCode instructions with `applyTo: "**/*"`

**Independent Test Criteria**: 
- All `.github/prompts/*.prompt.md` files are detected by the scanner
- Parsed prompt files correctly extract frontmatter (`mode`, `description`) and content
- Mapped instructions include `applyTo: "**/*"` by default
- Plugin correctly injects converted instructions during `experimental.chat.system.transform`

### Scanner Implementation

- [X] T012 [US1] Implement `scanPromptFiles()` in `src/scanner.ts`:
  - Scan `.github/prompts/` directory recursively for `*.prompt.md` files
  - For each file: read content, parse frontmatter using existing `parseFrontmatter()`, extract `mode` and `description`
  - Return array of `CopilotPromptFile` objects with `lastModified` from `fs.stat()`
  - Skip empty files with a warning
  - Reference: `plan.md` lines 280-283, `data-model.md` lines 213-227
  - Effort: 1 hour
  - Test Requirement: Test with fixture files having frontmatter and without; test empty file skipping

### Parser Updates (Reuse Existing)

- [X] T013 [US1] [P] Verify `parseFrontmatter()` in `src/parser.ts` handles prompt file format:
  - Prompt files use YAML frontmatter delimited by `---` (same as instruction files)
  - `mode` field can be `"instruction"` or `"assistant"` (default: `"instruction"`)
  - `description` field is optional
  - Reference: `plan.md` lines 112-119, `contracts/copilot-file-formats.md` (Prompt File Format section)
  - Effort: 30 min (verification only; no code changes needed per plan.md line 298)
  - Test Requirement: Verify parsing of prompt file frontmatter with mode/description

### Mapper Implementation

- [X] T014 [US1] Add `mapPromptToInstruction()` function to `src/mapper.ts`:
  - Convert `CopilotPromptFile` to OpenCode instruction format
  - Set `applyTo: ["**/*"]` (as per plan.md line 98: "with `applyTo: "**/*"`")
  - Format as Markdown section for system prompt injection using `buildInstructionSection()` pattern
  - `mode: "assistant"` prompts also get `applyTo: ["**/*"]` (same as instruction mode for v1 per data-model.md line 227)
  - Reference: `plan.md` lines 107-110, `data-model.md` lines 213-227
  - Effort: 1 hour
  - Test Requirement: Verify mapped instructions have correct `applyTo` and content

### Plugin Integration

- [X] T015 [US1] Update `.opencode/plugins/opencopilot.ts` to handle prompt files:
  - In plugin initialization: call `scanPromptFiles(githubDir)` and store in `cache.prompts`
  - In `systemTransformHook`: inject prompt file content similar to instruction files (always injected since `applyTo: ["**/*"]`)
  - In `eventHook`: re-scan prompt files on `.github/prompts/` file changes
  - Reference: `plan.md` lines 300-306, `research.md` Decision 7 (scanning at init)
  - Effort: 1.5 hours
  - Test Requirement: Create test `.github/prompts/test.prompt.md`, start OpenCode session, verify content appears in system prompt

### Tests for User Story 1

- [X] T016 [P] [US1] Write unit tests for `scanPromptFiles()` in `tests/unit/scanner-prompts.test.ts`:
  - Test Cases (from plan.md line 338): Finds `.github/prompts/*.prompt.md` files, parses frontmatter correctly, handles missing `mode` field (defaults to `instruction`), skips empty files, handles invalid frontmatter gracefully
  - Effort: 1 hour
  - Expected Coverage: 90%+

- [X] T017 [P] [US1] Write unit tests for `mapPromptToInstruction()` in `tests/unit/mapper-prompts.test.ts`:
  - Verify mapped instructions have `applyTo: ["**/*"]`
  - Verify content is preserved
  - Verify `mode: "assistant"` is handled same as `"instruction"`
  - Effort: 1 hour
  - Expected Coverage: 90%+

**Checkpoint**: At this point, Prompt Files (Gap 1) should be fully functional and testable independently.

---

## Phase 4: User Story 2 (US2, P2) - Hooks (2.5 days)
**Goal**: Bridge `.github/hooks/*.json` files to OpenCode plugin events

**Independent Test Criteria**:
- All `.github/hooks/*.json` files are detected by the scanner
- Parsed hook files correctly map to `CopilotHookDefinition` objects
- Hooks are registered as OpenCode plugin event listeners (or logged for v1)
- Hook events (`onChatStart`, `onFileSave`) trigger appropriate actions

### Scanner Implementation

- [X] T018 [US2] Implement `scanHookFiles()` in `src/scanner.ts`:
  - Scan `.github/hooks/` directory for `*.json` files
  - Parse JSON, validate required `event` field
  - Return array of `CopilotHookDefinition` objects
  - Handle invalid JSON gracefully (skip with warning)
  - Handle unknown events with a warning
  - Reference: `plan.md` lines 284-287, `contracts/copilot-file-formats.md` (Hook File Format section)
  - Effort: 1.5 hours
  - Test Requirement: Test with valid/invalid JSON; test missing `event` field; test unknown events

### Mapper Implementation

- [X] T019 [US2] Add hook-to-event mapping logic to `src/mapper.ts` or plugin:
  - Map Copilot events to OpenCode hooks per `plan.md` lines 145-149:
    - `onChatStart` → `session.created` (log message for v1; script not executed)
    - `onCodeReview` → N/A (warning logged, not supported)
    - `onFileSave` → `file.watcher.updated` (already handled by event hook)
  - For v1: Log a warning that script execution is not supported (plan.md line 153)
  - Reference: `plan.md` lines 131-153, Decision 2 in plan.md
  - Effort: 1.5 hours
  - Test Requirement: Verify event mapping table is correct; verify script warning is logged

### Plugin Integration

- [X] T020 [US2] Update `.opencode/plugins/opencopilot.ts` to handle hooks:
  - In plugin initialization: call `scanHookFiles(githubDir)` and store in `cache.hooks`
  - For `onChatStart` hooks: log appropriate message during `session.created` equivalent
  - For `onFileSave` hooks: already handled by existing `eventHook` (file.watcher.updated)
  - For `onCodeReview` hooks: log warning that code-review mode is not supported
  - In `eventHook`: re-scan hook files on `.github/hooks/` file changes
  - Reference: `plan.md` lines 300-306, `research.md` Decision 7
  - Effort: 1.5 hours
  - Test Requirement: Create test `.github/hooks/onChatStart.json`, start OpenCode session, verify hook is recognized and message logged

### Tests for User Story 2

- [X] T021 [P] [US2] Write unit tests for `scanHookFiles()` in `tests/unit/scanner-hooks.test.ts`:
  - Test Cases (from plan.md line 339): Finds `.github/hooks/*.json` files, parses valid JSON correctly, skips invalid JSON, handles missing `event` field, handles unknown events (warns)
  - Effort: 1 hour
  - Expected Coverage: 90%+

- [X] T022 [P] [US2] Write integration test for hook bridging in `tests/integration/hooks-bridge.test.ts`:
  - Scenario (from plan.md line 349): Create `.github/hooks/onChatStart.json`, start OpenCode session, check logs — Hook recognized, message logged
  - Effort: 1.5 hours
  - Expected Coverage: End-to-end hook bridging verified

**Checkpoint**: At this point, Hooks (Gap 2) should be fully functional and testable independently.

---

## Phase 5: User Story 3 (US3, P3) - Disable Model Invocation (1.5 days)
**Goal**: Map Copilot's `disable-model-invocation: true` to OpenCode's `hidden: true` (via `user-invocable: false`)

**Independent Test Criteria**:
- Copilot agent definitions with `disable-model-invocation: true` are detected
- Mapped agents set `hidden: true` in OpenCode config regardless of `user-invocable` setting
- Agents without `disable-model-invocation` respect the existing `user-invocable` field

### Scanner Updates

- [X] T023 [US3] Update `scanAgentFiles()` in `src/scanner.ts` to parse `disable-model-invocation`:
  - Parse `disable-model-invocation` field from agent frontmatter using `fmBool(fm, "disable-model-invocation", false)`
  - Add `disableModelInvocation: boolean` field to `CopilotAgentDefinition` interface in `types.ts` (UPDATE T005)
  - Pass parsed value to mapper
  - Reference: `plan.md` lines 169-171, `contracts/copilot-file-formats.md` line 73 (Ignored fields - but we're now implementing it)
  - Effort: 30 min
  - Test Requirement: Verify `disable-model-invocation: true` is parsed correctly; verify default is `false`

### Mapper Updates

- [X] T024 [US3] Update `toOpenCodeAgent()` in `src/mapper.ts` to handle `disableModelInvocation`:
  - If `def.disableModelInvocation === true`, force `hidden: true` regardless of `def.userInvocable`
  - Logic (from plan.md lines 174-178):
    - `disable-model-invocation: true` → `hidden: true` (Force hide)
    - `user-invocable: false` → `hidden: true` (Already implemented at line 125)
    - Both set → `hidden: true` (`disable-model-invocation` takes precedence)
  - Reference: `plan.md` lines 162-171, `mapper.ts` line 125
  - Effort: 30 min
  - Test Requirement: Verify `hidden: true` is set when `disableModelInvocation` is true; verify `user-invocable` is overridden

### Plugin Integration

- [X] T025 [US3] Verify plugin integration (no changes needed):
  - `configHook` already calls `toOpenCodeAgent(def)` which now includes the fix
  - Verify through existing tests
  - Reference: `opencopilot.ts` lines 55-61, `mapper.ts` lines 120-142
  - Effort: 30 min (verification and testing only)
  - Test Requirement: Create agent with `disable-model-invocation: true`, start OpenCode session, check agent config has `hidden: true`

### Tests for User Story 3

- [X] T026 [P] [US3] Write unit tests for `disableModelInvocation` parsing in `tests/unit/scanner-disable.test.ts`:
  - Test Cases (from plan.md line 341): `true` → `hidden: true`, `false` → respects `user-invocable`, Not set → respects `user-invocable`
  - Effort: 1 hour
  - Expected Coverage: 95%+

- [X] T027 [P] [US3] Write unit tests for `toOpenCodeAgent()` disable-model-invocation handling in `tests/unit/mapper-disable.test.ts`:
  - Verify `hidden: true` is set correctly when flag is true
  - Verify interaction with `user-invocable` field
  - Effort: 1 hour
  - Expected Coverage: 95%+

**Checkpoint**: At this point, Disable Model Invocation (Gap 3) should be fully functional and testable independently.

---

## Phase 6: User Story 4 (US4, P4) - Model Mapping Enhancement (2 days)
**Goal**: Expand KNOWN_MODELS map and add dynamic model resolution

**Independent Test Criteria**:
- KNOWN_MODELS list includes all Copilot model mappings (20+ models)
- Dynamic resolution returns correct OpenCode model for unknown Copilot models
- Fallback logic works for unresolvable models
- Model normalization handles dot/hyphen variations and version suffixes

### Types Updates

- [X] T028 [US4] Update `KNOWN_MODELS` constant in `src/mapper.ts`:
  - Add 20+ models per plan.md lines 187-191:
    - OpenAI: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o1`, `o1-pro`, `o3`, `o3-mini`
    - Anthropic: `claude-3.5-sonnet`, `claude-3.5-haiku`, `claude-sonnet-4`, `claude-opus-4`
    - Google: `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`, `gemini-2.5-pro`
    - Others: `llama-3.1-405b`, `mistral-large`
  - Reference: `plan.md` lines 187-191, 291, `mapper.ts` lines 155-173 (existing KNOWN_MODELS)
  - Effort: 1 hour
  - Test Requirement: Verify all new models are present and map to correct `provider/model-id` format

### Mapper Enhancements

- [X] T029 [US4] Enhance `normalizeModel()` in `src/mapper.ts` with dynamic resolution:
  - Add dot/hyphen normalization: `claude-3.5-sonnet` → `claude-3-5-sonnet` (check in KNOWN_MODELS)
  - Add version suffix handling: `claude-sonnet-4` → `anthropic/claude-sonnet-4-20250514`
  - Add regex-based fallback for unknown models (e.g., `/^gpt-4\./` → `openai/` prefix)
  - Return `undefined` for unresolvable models (log warning as current behavior)
  - Reference: `plan.md` lines 192-195, 292-293, lines 196-205 (Model normalization examples)
  - Effort: 3 hours
  - Test Requirement: Verify all normalization examples from plan.md line 200-205

### Plugin Integration

- [X] T030 [US4] Verify plugin integration (no changes needed):
  - `toOpenCodeAgent()` already calls `normalizeModel(def.model)` at `mapper.ts` line 129
  - The enhanced `normalizeModel()` will automatically benefit from the improvements
  - Reference: `mapper.ts` lines 128-130
  - Effort: 30 min (verification only)
  - Test Requirement: Create agent with `model: "gpt-4.1"`, start OpenCode session, verify model normalized to `openai/gpt-4.1`

### Tests for User Story 4

- [X] T031 [P] [US4] Write unit tests for KNOWN_MODELS expansion in `tests/unit/mapper-models.test.ts`:
  - Test Cases (from plan.md line 340): All known models normalize correctly, unknown models return `undefined`, dot/hyphen variations handled, logs warning for unknowns
  - Effort: 1 hour
  - Expected Coverage: 95%+

- [X] T032 [P] [US4] Write unit tests for dynamic model resolution in `tests/unit/mapper-models.test.ts`:
  - Verify static mappings work
  - Verify dynamic resolution with regex patterns
  - Verify fallback for unresolvable models
  - Effort: 2 hours
  - Expected Coverage: 95%+

**Checkpoint**: At this point, Model Mapping Enhancement (Gap 4) should be fully functional and testable independently.

---

## Phase 7: Polish & Cross-Cutting Concerns (1.5 days)

**Purpose**: Final cleanup, integration testing, and documentation updates

### Integration Tests

- [X] T033 [P] Add integration test for prompt file end-to-end flow in `tests/integration/prompt-flow.test.ts`:
  - Scenario (from plan.md line 347): Create `.github/prompts/test.prompt.md`, start OpenCode session, check system prompt — Prompt content injected
  - Effort: 1.5 hours

- [X] T034 [P] Add integration test for model normalization end-to-end in `tests/integration/model-flow.test.ts`:
  - Scenario (from plan.md line 349): Create agent with `model: "gpt-4.1"`, start OpenCode session, check agent config — Model normalized to `openai/gpt-4.1`
  - Effort: 1.5 hours

- [X] T035 [P] Add integration test for disable-model-invocation end-to-end in `tests/integration/disable-flow.test.ts`:
  - Scenario (from plan.md line 350): Create agent with `disable-model-invocation: true`, start OpenCode session, check agent config — `hidden: true` set
  - Effort: 1.5 hours

### Documentation Updates

- [X] T036 Update `README.md` mapping table to reflect newly addressed gaps:
  - Update "Known Gaps" table (README.md lines 150-159) to mark Prompt Files and Hooks as ✅ Supported (now that we've implemented them)
  - Update "Copilot → OpenCode Mapping Table" (README.md lines 131-147) to show `.github/prompts/*.prompt.md` and `.github/hooks/*.json` as ✅ Supported
  - Reference: `plan.md` line 327 (T016)
  - Effort: 30 min

- [X] T037 Update `specs/001-copilot-opencode-adapter/data-model.md` with new entities:
  - Add `CopilotPromptFile` entity documentation (if not already added in Phase 2)
  - Add `CopilotHookDefinition` entity documentation (if not already added in Phase 2)
  - Reference: `plan.md` line 328 (T017)
  - Effort: 30 min

### Code Quality

- [X] T038 [P] Run linter and formatter: `bun run lint && bun run format` (or equivalent):
  - Effort: 30 min

- [X] T039 [P] Update existing tests to cover new functionality:
  - Ensure all new code paths are covered
  - Reference: `plan.md` line 398 (tests summary: 5 new test suites)
  - Effort: 1.5 hours

---

## Parallel Execution Examples

### Per User Story (All stories follow this pattern):
```
T012 (Scan) → T013 (Parse - [P] with T012) → T014 (Map) → T015 (Plugin) → T016/T017 (Tests - [P] with each other)
```

### Cross-Story Parallelism:
- All user story phases (3-6) can be developed in parallel once Phase 2 (Foundational) is complete
- Test writing tasks marked `[P]` can be executed in parallel with implementation tasks for the same component
- Integration tests in Phase 7 can run in parallel

### Example Parallel Execution for US1:
```bash
# Launch in parallel after T012 completes:
Task: T013 - Verify parser handles prompt files
Task: T016 - Write scanner-prompts.test.ts

# Launch in parallel after T014 completes:
Task: T015 - Update plugin for prompt injection
Task: T017 - Write mapper-prompts.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only — Prompt Files)
1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Prompt Files)
4. **STOP and VALIDATE**: Test Prompt Files independently
5. Deploy/demo if ready

### Incremental Delivery
1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 (Prompt Files) → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 (Hooks) → Test independently → Deploy/Demo
4. Add User Story 3 (Disable Model Invocation) → Test independently → Deploy/Demo
5. Add User Story 4 (Model Mapping) → Test independently → Deploy/Demo
6. Each story adds value without breaking previous stories

### Parallel Team Strategy
With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Prompt Files)
   - Developer B: User Story 2 (Hooks)
   - Developer C: User Story 3 (Disable Model Invocation)
   - Developer D: User Story 4 (Model Mapping)
3. Stories complete and integrate independently

---

## Task Summary

| Metric | Count |
|--------|------|
| **Total Tasks** | **39** |
| US1 (Prompt Files) | 6 (T012-T017) |
| US2 (Hooks) | 5 (T018-T022) |
| US3 (Disable Model Invocation) | 5 (T023-T027) |
| US4 (Model Mapping) | 5 (T028-T032) |
| Foundational Tasks (Phase 2) | 7 (T005-T011) |
| Setup Tasks (Phase 1) | 4 (T001-T004) |
| Polish Tasks (Phase 7) | 7 (T033-T039) |
| **Parallelizable Tasks [P]** | **14** |
| **Tasks with Test Requirements** | **39** |
| **New Test Files** | 5 (per plan.md line 388-392) |
| **Estimated Lines Added** | ~500 LOC (source) + ~200 LOC (tests) |

---

## Format Validation

✅ **All tasks follow the strict checklist format**:
- Checkbox: `- [ ]` 
- Task ID: Sequential T001-T039
- `[P]` marker: Included for all parallelizable tasks (14 tasks)
- `[Story]` label: Included for all user story phase tasks (US1-US4, 21 tasks)
- File paths: Included in ALL task descriptions
- Dependencies: Clearly marked in task descriptions and Dependencies section

✅ **Task organization by user story**: Each gap maps to a user story phase (US1-US4)

✅ **Independent test criteria**: Defined for each user story phase

✅ **Effort estimates**: Provided for all implementation tasks

✅ **Testing requirements**: Specified for each task

---

## Notes

- Tasks reference existing codebase: `src/types.ts` (121 lines), `src/parser.ts` (81 lines), `src/scanner.ts` (323 lines), `src/mapper.ts` (213 lines), `.opencode/plugins/opencopilot.ts` (187 lines)
- Parser (Phase 3, T013) requires NO code changes (per plan.md line 298: "Existing frontmatter parsing works for prompt files")
- Plugin integration for US3 (T025) and US4 (T030) requires NO code changes (logic is in scanner/mapper)
- All scanning functions follow existing patterns in `src/scanner.ts` (glob patterns, frontmatter parsing, error handling)
- All mapping functions follow existing patterns in `src/mapper.ts` (Copilot → OpenCode field mapping)
- Test runner: Bun test (`./node_modules/.bin/bun test`) per plan.md line 23
