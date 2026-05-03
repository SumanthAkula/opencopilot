# Plan Quality Checklist: GitHub Copilot Configuration Adapter for OpenCode

**Purpose**: Validate completeness, clarity, and consistency of the technical design documents (plan.md, data-model.md, contracts/) before implementation begins
**Created**: 2026-05-03
**Audience**: Implementer (author) self-review
**Depth**: Standard
**Feature**: [plan.md](../plan.md) · [data-model.md](../data-model.md) · [contracts/](../contracts/)

---

## Requirement Completeness

- [ ] CHK001 - Are discovery path requirements defined for all three Copilot file types (instructions, agents, skills) with explicit glob patterns? [Completeness, Spec §FR-001, §FR-003, §FR-005]
- [ ] CHK002 - Is the `.github/copilot-instructions.md` vs `.github/instructions/**/*.instructions.md` discovery distinction explicitly specified (different path, different frontmatter behavior)? [Completeness, Contracts §copilot-file-formats.md]
- [ ] CHK003 - Are requirements documented for the optional user-override config block (`opencopilot.github_dir`, `inject_instructions`, etc.) — specifically, which version it targets and what happens if partially specified? [Completeness, Contracts §plugin-interface.md]
- [ ] CHK004 - Is the `recentlyEditedFiles` eviction policy (cap at 100 per session) specified in both the data model and the contract, or only in one place? [Completeness, Data Model §PluginCache]
- [ ] CHK005 - Are requirements defined for the fallback behavior when `experimental.chat.system.transform` is unavailable (the `session.prompt` fallback path)? [Completeness, Plan §Technical Context]
- [ ] CHK006 - Are file-size limits (e.g., 30,000 character cap on agent `systemPrompt`) specified for instruction files and skill content as well, or only for agent definitions? [Completeness, Data Model §CopilotAgentDefinition]
- [ ] CHK007 - Is the `watchedPaths` field in `PluginCache` defined with a clear population strategy — which paths are added, when, and what triggers removal? [Completeness, Data Model §PluginCache]

---

## Requirement Clarity

- [ ] CHK008 - Is "zero-config mode" defined with an explicit list of what is NOT required (i.e., no `opencode.json` changes, no CLI flags, no env vars)? Or does the spec rely on the reader inferring this? [Clarity, Spec §FR-006]
- [ ] CHK009 - Is "graceful degradation" (FR-007) quantified? What exactly constitutes "a warning" — stderr log line, UI notification, or both? [Clarity, Spec §FR-007]
- [ ] CHK010 - Is "purely additive" (FR-008) defined with a concrete example of what would violate it (e.g., overwriting an existing `config.agent` key)? [Clarity, Spec §FR-008]
- [ ] CHK011 - Is the `applyTo` evaluation trigger clearly defined — does it evaluate at hook-call time against the session's edited files, or at scan time? [Clarity, Contracts §experimental.chat.system.transform]
- [ ] CHK012 - Is the duplicate-injection guard ("MUST NOT inject duplicate content if called multiple times") specified with a concrete mechanism (e.g., a Set of injected file paths per session)? [Clarity, Contracts §experimental.chat.system.transform]
- [ ] CHK013 - Is "provider/model-id format" for the `model` field normalization defined with examples and a list of recognized providers? Or is the normalization behavior left to implementer discretion? [Clarity, Data Model §CopilotAgentDefinition]
- [ ] CHK014 - Is the `normalizedKey` derivation algorithm fully specified (e.g., how are non-alphanumeric characters besides hyphens handled, what happens with leading/trailing hyphens)? [Clarity, Data Model §CopilotAgentDefinition]

---

## Requirement Consistency

- [ ] CHK015 - Does the `tool.execute.before` contract say "Exact mechanism: to be confirmed during implementation" — is this an open design question or is it intentionally deferred? Does it conflict with the closed/complete framing of the design docs? [Consistency, Contracts §tool.execute.before]
- [ ] CHK016 - Are the built-in agent name collision list (`build`, `plan`, `general`, `explore`, `compaction`, `title`, `summary`) consistent between data-model.md and tasks.md (T014)? [Consistency, Data Model §CopilotAgentDefinition, Tasks §T014]
- [ ] CHK017 - Does the `config` hook contract say "skip if key already exists" but the data model's `derivePermissions` section makes no mention of this precedence rule? Are they consistent? [Consistency, Contracts §config hook, Data Model §Derived OpenCode agent config]
- [ ] CHK018 - The data model lists `.github/agents/*.md` and `.github/agents/*.agent.md` as patterns, but copilot-file-formats.md also uses `.github/agents/*.md OR .github/agents/*.agent.md` — are these identical in intent, or are there edge cases (e.g., dotfiles, nested dirs) that are handled differently between the two documents? [Consistency, Data Model §CopilotAgentDefinition, Contracts §copilot-file-formats.md]

---

## Acceptance Criteria Quality

- [ ] CHK019 - Is SC-001 ("active within 60 seconds") measurable from the plugin's perspective? What does "active" mean — injected into system prompt, or observable in agent behavior? [Measurability, Spec §SC-001]
- [ ] CHK020 - Is SC-002 ("100% of Copilot instruction files") measurable? Does it define what counts as a "supported file pattern" and where that list is authoritatively maintained? [Measurability, Spec §SC-002]
- [ ] CHK021 - Is SC-005 ("every unmappable field documented as a named known gap") auditable — is there a canonical location where gaps are listed, and is that list complete per the contracts? [Measurability, Spec §SC-005]

---

## Scenario Coverage

- [ ] CHK022 - Are requirements defined for the case where `.github/agents/` contains subdirectories (not just flat `.md` files)? [Coverage, Edge Case]
- [ ] CHK023 - Are requirements defined for symlinks inside `.github/` — should they be followed, skipped, or treated as errors? [Coverage, Edge Case, Gap]
- [ ] CHK024 - Are concurrent session scenarios addressed — what happens when two OpenCode sessions run simultaneously in the same project and both write to `recentlyEditedFiles`? [Coverage, Exception Flow, Data Model §PluginCache]
- [ ] CHK025 - Is the behavior defined when a `.github/` file changes *during* an active LLM call (i.e., `file.watcher.updated` fires while `experimental.chat.system.transform` is mid-execution)? [Coverage, Race Condition, Gap]
- [ ] CHK026 - Are requirements specified for the case where `applyTo` patterns in an instruction file match zero files (empty recently-edited set) — should the file be injected or skipped? [Coverage, Spec §FR-001, Contracts §experimental.chat.system.transform]
- [ ] CHK027 - Is the behavior defined for skill name shadowing — when `.opencode/skills/` and `.github/skills/` both have a skill with the same name, the data model says native wins; is this tested against the `tool.execute.before` hook logic? [Coverage, Data Model §CopilotSkill]

---

## Edge Case Coverage

- [ ] CHK028 - Is the behavior defined for a Copilot instruction file with *only* frontmatter and an empty body? (Data model says skip with warning — is this consistent with the file-formats contract?) [Edge Case, Data Model §CopilotInstructionFile, Contracts §copilot-file-formats.md]
- [ ] CHK029 - Is the behavior defined for agent files where `tools: []` (deny all) AND `user-invocable: false` are both set — does the combination produce a sensible OpenCode agent? [Edge Case, Data Model §CopilotAgentDefinition]
- [ ] CHK030 - Is the maximum number of agents, instructions, and skills per project bounded? The plan specifies performance goals for "< 20 instruction files, < 10 agents, < 10 skills" — are behavior guarantees only valid within these bounds, and is this communicated to the user? [Edge Case, Plan §Technical Context]
- [ ] CHK031 - Is the behavior defined for a `SKILL.md` file where `name` in frontmatter does NOT match the directory name — the data model says "directory name wins," but is this documented as a user-visible warning in the README requirement (FR-009)? [Edge Case, Data Model §CopilotSkill, Spec §FR-009]

---

## Non-Functional Requirements

- [ ] CHK032 - Is the "< 50ms startup" performance requirement defined with a measurement methodology (what clock, what machine baseline, what constitutes "startup")? [NFR, Clarity, Plan §Technical Context]
- [ ] CHK033 - Is the "< 5ms per call" hook overhead requirement measurable in isolation from OpenCode's own processing time? Is there a way to instrument it? [NFR, Measurability, Plan §Technical Context]
- [ ] CHK034 - Are memory usage bounds defined for `PluginCache` (e.g., max total size of cached instruction content, max agent definitions)? [NFR, Gap]
- [ ] CHK035 - Are OS compatibility requirements stated beyond "POSIX paths with `path.join`"? Is Windows WSL explicitly in or out of scope for v1? [NFR, Completeness, Plan §Technical Context]

---

## Dependencies & Assumptions

- [ ] CHK036 - Is the assumption that "Copilot skill files already follow OpenCode's SKILL.md convention" validated — does contracts/copilot-file-formats.md confirm this, or is it a residual assumption? [Assumption, Spec §Assumptions]
- [ ] CHK037 - Is the assumption that "Copilot plans = system prompt / instruction content" formally resolved or still pending? The spec marks it "pending confirmation during planning" — was it resolved in plan.md? [Assumption, Spec §Assumptions]
- [ ] CHK038 - Is the `@opencode-ai/plugin` package version pinned or at least range-specified? Is there a risk of breaking changes in the `experimental.*` hooks between plugin versions? [Dependency, Plan §Technical Context]
- [ ] CHK039 - Is `js-yaml` (or Bun's built-in YAML) the confirmed dependency, or is it still a choice? If Bun's built-in is used, is it documented as a Bun-only constraint? [Dependency, Plan §Technical Context]

---

## Ambiguities & Conflicts

- [ ] CHK040 - The `tool.execute.before` contract explicitly says the interception mechanism is "to be confirmed during implementation" — is this ambiguity acceptable before implementation starts, or should the mechanism be resolved in the design docs first? [Ambiguity, Contracts §tool.execute.before]
- [ ] CHK041 - The `event` hook contract references `sessionID` from "event context" but adds "if sessionID is available from event context; otherwise use a global recent-files set" — is this ambiguity in the event payload schema resolved, or does it depend on runtime discovery? [Ambiguity, Contracts §event hook]
- [ ] CHK042 - Is the `applyTo` field in copilot-file-formats.md specified as "single glob string or comma-separated list" but the data model types it as `string[]` — is the parsing contract (string → string[]) explicitly defined in parser.ts requirements? [Conflict, Contracts §copilot-file-formats.md, Data Model §CopilotInstructionFile]
- [ ] CHK043 - Are "ignored fields" (e.g., `disable-model-invocation`, `mcp-servers`, `handoffs` in agent files) documented as known gaps in the README requirement (FR-009), or only in the file-formats contract? [Ambiguity, Spec §FR-009, Contracts §copilot-file-formats.md]
