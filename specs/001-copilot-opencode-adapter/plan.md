# Implementation Plan: Bridge Copilot Gaps (Prompt Files, Hooks, Model Mapping)

**Branch**: `001-copilot-opencode-adapter` | **Date**: 2026-05-03 | **Spec**: [spec.md](../spec.md)

**Input**: Feature specification from `/specs/001-copilot-opencode-adapter/spec.md` with gap analysis from [README.md](../../README.md)

## Summary

This plan addresses the four correctable gaps identified in the OpenCopilot plugin's README.md that have known solutions from the spec:

1. **Prompt Files** (`.github/prompts/*.prompt.md`) - Convert to instruction files with `applyTo: "**/*"`
2. **Hooks** (`.github/hooks/*.json`) - Bridge to OpenCode plugin events
3. **Disable Model Invocation** (`disable-model-invocation` field) - Map to `hidden: true` via `user-invocable: false`
4. **Model Mapping** (unknown model names) - Enhance the `KNOWN_MODELS` map in `mapper.ts`

The plan follows the Constitution's Compatibility-First principle (I) by making these Copilot features work in OpenCode without requiring users to modify their existing Copilot configuration files.

## Technical Context

**Language/Version**: TypeScript (Bun runtime, OpenCode plugin API)  
**Primary Dependencies**: `@opencode-ai/plugin`, `js-yaml` (already installed)  
**Storage**: In-memory `PluginCache` (no persistent storage needed)  
**Testing**: Bun test runner (`./node_modules/.bin/bun test`)  
**Target Platform**: OpenCode plugin (Node/Bun runtime, Linux/macOS/Windows)  
**Project Type**: OpenCode plugin (TypeScript library loaded from `.opencode/plugins/`)  
**Performance Goals**: Scan startup < 100ms for typical `.github/` directories; hook latency < 10ms per invocation  
**Constraints**: Must not modify user files (Constitution I); must use only published OpenCode plugin API (Constitution II)  
**Scale/Scope**: 4 gap implementations; ~500 LOC added; 4 new test suites

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| **I. Compatibility-First** | ✅ PASS | All gaps addressed without requiring user file modifications. Prompt files are auto-converted; hooks are auto-bridged; `disable-model-invocation` maps transparently. |
| **II. Plugin Architecture** | ✅ PASS | All changes confined to plugin codebase (`src/`, `.opencode/plugins/`). No OpenCode core modifications. |
| **III. Transparent Mapping** | ✅ PASS | All new mappings documented in README.md mapping table and this plan. |
| **IV. Workflow Integrity** | ✅ PASS | Following specify → plan → tasks → implement cycle. |
| **V. Simplicity & YAGNI** | ✅ PASS | Only implementing gaps with known solutions from spec. No speculative features. |

**Gate Status**: ✅ ALL PASSED — Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-copilot-opencode-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 output - architecture decisions
├── data-model.md        # Phase 1 output - entity definitions
├── quickstart.md        # Phase 1 output - developer guide
├── contracts/           # Phase 1 output - file format docs
│   ├── copilot-file-formats.md
│   └── plugin-interface.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── types.ts         # ADD: CopilotPromptFile, CopilotHookDefinition types
├── parser.ts        # MODIFY: Add prompt file frontmatter parsing
├── scanner.ts       # MODIFY: Add scanPromptFiles(), scanHookFiles()
├── mapper.ts        # MODIFY: Enhance KNOWN_MODELS, add prompt-to-instruction mapping
├── glob-matcher.ts  # UNCHANGED: Reuse existing applyTo glob evaluation
└── index.ts         # MODIFY: Export new types and functions

.opencode/plugins/
└── opencopilot.ts   # MODIFY: Add prompt injection, hook bridging logic

tests/
├── unit/
│   ├── scanner-prompts.test.ts    # NEW: Prompt file scanning tests
│   ├── scanner-hooks.test.ts      # NEW: Hook file scanning tests
│   ├── mapper-models.test.ts      # NEW: Model mapping enhancement tests
│   └── mapper-disable.test.ts     # NEW: disable-model-invocation tests
└── integration/
    └── hooks-bridge.test.ts       # NEW: End-to-end hook bridging tests
```

**Structure Decision**: Single project structure (OpenCode plugin). All gap implementations are within the existing plugin architecture. No new top-level directories needed.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All gap implementations follow the established patterns in the codebase (scanner → mapper → plugin hooks).

---

## Phase 0: Research & Architecture Decisions

### Decision 1: Prompt File Detection and Conversion Strategy

**Decision**: Treat `.github/prompts/*.prompt.md` files as path-specific instruction files with `applyTo: "**/*"`.

**Rationale**: Prompt files in Copilot are used to provide reusable prompt templates that can be invoked. Since OpenCode doesn't have a direct equivalent, the next-best mapping is to convert them to instruction files that are always injected (global scope). This preserves the content without requiring user intervention.

**Alternatives considered**:
- **Skill conversion**: Convert to skills and register in `<available_skills>` — Rejected because prompt files have different semantics (they're invoked by file reference in Copilot chat, not as skills).
- **Ignore completely** — Rejected because it violates Constitution I (Compatibility-First).

**Implementation approach**:
1. Add `scanPromptFiles(githubDir)` to `scanner.ts`
2. Parse frontmatter for `mode` field (Copilot prompt files support `mode: "instruction"` or `mode: "assistant"`)
3. Convert to `CopilotInstructionFile` with `applyTo: ["**/*"]`
4. Inject via existing `experimental.chat.system.transform` hook

**Copilot prompt file format** (from GitHub docs):
```markdown
---
mode: instruction
description: Code review checklist
---
Review all PR changes for security vulnerabilities...
```

### Decision 2: Hook File Bridging Strategy

**Decision**: Parse `.github/hooks/*.json` files and register corresponding OpenCode plugin hooks programmatically.

**Rationale**: Copilot hooks are JSON files that define lifecycle events (e.g., `onChatStart`, `onCodeReview`). OpenCode has equivalent hooks (`session.created`, `tool.execute.before`). By parsing the JSON and dynamically registering handlers, we bridge the gap without user modification.

**Alternatives considered**:
- **Ignore hooks** — Rejected (violates Constitution I).
- **Require manual plugin code** — Rejected (requires user to write TypeScript).

**Implementation approach**:
1. Define `CopilotHookDefinition` type in `types.ts`:
   ```typescript
   export interface CopilotHookDefinition {
     filePath: string
     event: string  // e.g., "onChatStart", "onCodeReview"
     script?: string  // Shell command to execute
     description?: string
   }
   ```

2. Add `scanHookFiles(githubDir)` to `scanner.ts`

3. Map Copilot events to OpenCode hooks:
   | Copilot Hook | OpenCode Hook | Notes |
   |---|---|---|
   | `onChatStart` | `session.created` | Inject message via `session.prompt` |
   | `onCodeReview` | N/A | Log warning (OpenCode has no code-review mode) |
   | `onFileSave` | `file.watcher.updated` | Re-scan logic already exists |

4. Execute hook logic in `opencopilot.ts` by iterating cached hooks

**Caveat**: Copilot hooks can specify shell scripts. OpenCode hooks are TypeScript functions. For v1, we'll log a warning that script execution is not supported and only document-based hooks (those with inline content) are processed.

### Decision 3: Disable Model Invocation Mapping

**Decision**: Map Copilot's `disable-model-invocation: true` to OpenCode's `hidden: true` (via `user-invocable: false` in the existing mapper).

**Rationale**: `disable-model-invocation` in Copilot prevents the agent from being invoked directly by the user (it can only be invoked programmatically by other agents). OpenCode's `hidden: true` achieves the same effect by removing the agent from the `@` autocomplete menu.

**Wait** — looking at the existing code in `mapper.ts` (line 125):
```typescript
hidden: !def.userInvocable,
```

The existing code already handles `user-invocable` from Copilot agent frontmatter. The gap is that `disable-model-invocation` is a separate field that should ALSO set `hidden: true`.

**Implementation approach**:
1. In `scanner.ts`, parse `disable-model-invocation` from agent frontmatter
2. In `mapper.ts`, if `disableModelInvocation === true`, force `hidden: true` regardless of `user-invocable`
3. Document in README.md mapping table

**Field mapping**:
| Copilot Field | OpenCode Field | Logic |
|---|---|---|
| `disable-model-invocation: true` | `hidden: true` | Force hide |
| `user-invocable: false` | `hidden: true` | Already implemented |
| Both set | `hidden: true` | `disable-model-invocation` takes precedence |

### Decision 4: Model Mapping Enhancement

**Decision**: Expand the `KNOWN_MODELS` map in `mapper.ts` to include all models from the [GitHub Copilot documentation](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-with-an-ai-model), plus community-contributed models.

**Rationale**: The current `KNOWN_MODELS` map (lines 155-173 in `mapper.ts`) only includes a handful of models. Users with `model: "gpt-4.1"` or `model: "claude-sonnet-4"` get a warning and the model is omitted. By expanding the map, we reduce warnings and improve compatibility.

**Implementation approach**:
1. Add ~20+ models to `KNOWN_MODELS` based on:
   - OpenAI: `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `o1`, `o1-pro`, `o3`, `o3-mini`
   - Anthropic: `claude-3.5-sonnet`, `claude-3.5-haiku`, `claude-sonnet-4`, `claude-opus-4`
   - Google: `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-2.0-flash`, `gemini-2.5-pro`
   - Others: `llama-3.1-405b`, `mistral-large`
2. Add a `normalizeModel()` function that handles:
   - Dots vs hyphens (`claude-3.5-sonnet` vs `claude-3-5-sonnet`)
   - Version suffixes (`claude-sonnet-4` → `anthropic/claude-sonnet-4-20250514`)
3. Log a clearer warning with a link to documentation for unknown models

**Model normalization examples**:
| Input | Output |
|---|---|
| `gpt-4o` | `openai/gpt-4o` |
| `gpt-4.1` | `openai/gpt-4.1` |
| `claude-3.5-sonnet` | `anthropic/claude-3-5-sonnet-20241022` |
| `claude-sonnet-4` | `anthropic/claude-sonnet-4-20250514` |
| `gemini-2.5-pro` | `google/gemini-2.5-pro` |
| `unknown-model` | `undefined` (warning logged) |

---

## Phase 1: Design & Contracts

### Data Model Updates (data-model.md amendments)

#### New Entity: `CopilotPromptFile`

Represents a parsed `.github/prompts/*.prompt.md` file.

| Field | Type | Source | Notes |
|---|---|---|---|
| `filePath` | `string` | File path on disk | Absolute path |
| `description` | `string \| null` | Frontmatter `description` | Used for logging |
| `mode` | `"instruction" \| "assistant" \| null` | Frontmatter `mode` | Default: `"instruction"` |
| `content` | `string` | File body (after frontmatter) | Converted to instruction |
| `lastModified` | `number` | `fs.stat().mtimeMs` | Cache invalidation |

**Validation rules**:
- `content` MUST be non-empty to be included
- `mode: "assistant"` prompts are converted to `applyTo: ["**/*"]` instructions (same as instruction mode for v1)

#### New Entity: `CopilotHookDefinition`

Represents a parsed `.github/hooks/*.json` file.

| Field | Type | Source | Notes |
|---|---|---|---|
| `filePath` | `string` | File path on disk | Absolute path |
| `event` | `string` | JSON `event` field | Copilot hook event name |
| `script` | `string \| null` | JSON `script` field | Shell command (not executed in v1) |
| `description` | `string \| null` | JSON `description` field | Informational |

**Supported event mappings**:
| Copilot Event | OpenCode Hook | Action |
|---|---|---|
| `onChatStart` | `session.created` | Log message (script not executed in v1) |
| `onCodeReview` | N/A | Warning logged (not supported) |
| `onFileSave` | `file.watcher.updated` | Already handled by event hook |

### Contract Updates

#### File: `contracts/copilot-file-formats.md` (already exists - amend)

Add sections for prompt files and hooks:

**Prompt File Format (.github/prompts/*.prompt.md)**:
```markdown
---
mode: instruction  # or "assistant"
description: Optional description
---

# Prompt content here
```

**Hook File Format (.github/hooks/*.json)**:
```json
{
  "event": "onChatStart",
  "script": "echo 'Chat started'",
  "description": "Runs on chat start"
}
```

### Component Impact Analysis

#### `src/types.ts` - MODIFY
- Add `CopilotPromptFile` interface (5 lines)
- Add `CopilotHookDefinition` interface (5 lines)
- Update `PluginCache` to include `prompts: CopilotPromptFile[]` and `hooks: CopilotHookDefinition[]` (2 lines)

#### `src/scanner.ts` - MODIFY
- Add `scanPromptFiles(githubDir): Promise<CopilotPromptFile[]>` function (~30 lines)
  - Pattern: `.github/prompts/**/*.prompt.md`
  - Parse frontmatter for `mode` and `description`
  - Convert to `CopilotPromptFile` objects
- Add `scanHookFiles(githubDir): Promise<CopilotHookDefinition[]>` function (~40 lines)
  - Pattern: `.github/hooks/**/*.json`
  - Parse JSON, validate `event` field
  - Return array of hook definitions
- Update `scanGithubDir()` to call new scanners and populate cache (~10 lines)

#### `src/mapper.ts` - MODIFY
- Enhance `KNOWN_MODELS` map with 20+ additional models (~30 lines)
- Add `normalizeModel()` handling for dot/hyphen variations (~15 lines)
- Update `toOpenCodeAgent()` to check `disableModelInvocation` field (~5 lines)
  - Import and parse `disable-model-invocation` from frontmatter in `scanner.ts`
  - Pass to mapper or handle in scanner before calling `toOpenCodeAgent()`

#### `src/parser.ts` - UNCHANGED
- Existing frontmatter parsing works for prompt files (they use same YAML format)

#### `.opencode/plugins/opencopilot.ts` - MODIFY
- Add prompt file injection in `systemTransformHook` (~15 lines)
  - Iterate `cache.prompts` and inject content similar to instructions
- Add hook bridging logic in plugin initialization (~25 lines)
  - Iterate `cache.hooks` and log appropriate messages for `onChatStart`
  - Future: execute scripts if OpenCode adds shell execution hook
- Update `eventHook` to re-scan prompts and hooks on file changes (~10 lines)

### Dependency-Ordered Task List

| Task ID | Task | Depends On | Est. Effort | Files Modified |
|---------|------|------------|-------------|----------------|
| **T001** | Add `CopilotPromptFile` and `CopilotHookDefinition` types to `types.ts` | None | 30 min | `src/types.ts` |
| **T002** | Implement `scanPromptFiles()` in `scanner.ts` | T001 | 1 hour | `src/scanner.ts` |
| **T003** | Implement `scanHookFiles()` in `scanner.ts` | T001 | 1.5 hours | `src/scanner.ts` |
| **T004** | Update `scanGithubDir()` to call new scanners | T002, T003 | 30 min | `src/scanner.ts` |
| **T005** | Enhance `KNOWN_MODELS` map in `mapper.ts` | None | 1 hour | `src/mapper.ts` |
| **T006** | Add `disableModelInvocation` parsing in `scanner.ts` | None | 30 min | `src/scanner.ts` |
| **T007** | Update `toOpenCodeAgent()` to handle `disableModelInvocation` | T006 | 30 min | `src/mapper.ts` |
| **T008** | Add prompt injection in `systemTransformHook` | T002 | 1 hour | `.opencode/plugins/opencopilot.ts` |
| **T009** | Add hook bridging logic in plugin initialization | T003 | 1.5 hours | `.opencode/plugins/opencopilot.ts` |
| **T010** | Update `eventHook` for prompt/hook file changes | T004 | 30 min | `.opencode/plugins/opencopilot.ts` |
| **T011** | Write unit tests for prompt file scanning | T002 | 1 hour | `tests/unit/scanner-prompts.test.ts` |
| **T012** | Write unit tests for hook file scanning | T003 | 1 hour | `tests/unit/scanner-hooks.test.ts` |
| **T013** | Write unit tests for model mapping | T005 | 1 hour | `tests/unit/mapper-models.test.ts` |
| **T014** | Write unit tests for disable-model-invocation | T007 | 1 hour | `tests/unit/mapper-disable.test.ts` |
| **T015** | Write integration test for hook bridging | T009 | 1.5 hours | `tests/integration/hooks-bridge.test.ts` |
| **T016** | Update README.md mapping table with new gaps addressed | T007, T009 | 30 min | `README.md` |
| **T017** | Update data-model.md with new entities | T001 | 30 min | `specs/.../data-model.md` |

**Total Estimated Effort**: ~14 hours

### Testing Strategy

#### Unit Tests

| Component | Test Cases | Expected Coverage |
|-----------|------------|-------------------|
| `scanPromptFiles()` | - Finds `.github/prompts/*.prompt.md` files<br>- Parses frontmatter correctly<br>- Handles missing `mode` field (defaults to `instruction`)<br>- Skips empty files<br>- Handles invalid frontmatter gracefully | 90%+ |
| `scanHookFiles()` | - Finds `.github/hooks/*.json` files<br>- Parses valid JSON correctly<br>- Skips invalid JSON<br>- Handles missing `event` field<br>- Handles unknown events (warns) | 90%+ |
| `KNOWN_MODELS` map | - All known models normalize correctly<br>- Unknown models return `undefined`<br>- Dot/hyphen variations handled<br>- Logs warning for unknowns | 95%+ |
| `disableModelInvocation` | - `true` → `hidden: true`<br>- `false` → respects `user-invocable`<br>- Not set → respects `user-invocable` | 95%+ |

#### Integration Tests

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Prompt file discovery | 1. Create `.github/prompts/test.prompt.md`<br>2. Start OpenCode session<br>3. Check system prompt | Prompt content injected |
| Hook bridging | 1. Create `.github/hooks/onChatStart.json`<br>2. Start OpenCode session<br>3. Check logs | Hook recognized, message logged |
| Model normalization | 1. Create agent with `model: "gpt-4.1"`<br>2. Start OpenCode session<br>3. Check agent config | Model normalized to `openai/gpt-4.1` |
| Disable model invocation | 1. Create agent with `disable-model-invocation: true`<br>2. Start OpenCode session<br>3. Check agent config | `hidden: true` set |

---

## Phase 2: Implementation Planning (Tasks File)

The actual task breakdown for implementation (to be created by `/speckit.tasks`) will include:

1. **Setup tasks** (parallel):
   - T001: Add types to `types.ts`
   - T005: Enhance `KNOWN_MODELS` in `mapper.ts`

2. **Scanner tasks** (after T001):
   - T002: Implement `scanPromptFiles()`
   - T003: Implement `scanHookFiles()`
   - T006: Add `disableModelInvocation` parsing
   - T004: Update `scanGithubDir()`

3. **Mapper tasks** (parallel with scanner):
   - T007: Update `toOpenCodeAgent()` for `disableModelInvocation`

4. **Plugin hook tasks** (after scanner):
   - T008: Add prompt injection
   - T009: Add hook bridging
   - T010: Update `eventHook`

5. **Test tasks** (parallel with implementation):
   - T011-T015: Write unit and integration tests

6. **Documentation tasks** (final):
   - T016: Update README.md
   - T017: Update data-model.md

---

## Summary of Changes

### New Files
- `tests/unit/scanner-prompts.test.ts`
- `tests/unit/scanner-hooks.test.ts`
- `tests/unit/mapper-models.test.ts`
- `tests/unit/mapper-disable.test.ts`
- `tests/integration/hooks-bridge.test.ts`

### Modified Files
- `src/types.ts` - Add 2 new interfaces, update `PluginCache`
- `src/scanner.ts` - Add 2 new scan functions, update `scanGithubDir()`
- `src/mapper.ts` - Enhance `KNOWN_MODELS`, update `toOpenCodeAgent()`
- `.opencode/plugins/opencopilot.ts` - Add prompt injection, hook bridging
- `README.md` - Update mapping table
- `specs/001-copilot-opencode-adapter/data-model.md` - Add new entities

### Key Metrics
- **Lines added**: ~300 (source) + ~200 (tests) = ~500 LOC
- **New test suites**: 5
- **Gaps addressed**: 4 (prompt files, hooks, disable-model-invocation, model mapping)
- **Estimated implementation time**: 14 hours

---

**Plan Status**: ✅ Complete - Ready for `/speckit.tasks` to generate task breakdown.
