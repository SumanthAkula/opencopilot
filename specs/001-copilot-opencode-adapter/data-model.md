# Data Model: GitHub Copilot → OpenCode Adapter

**Feature**: `001-copilot-opencode-adapter`
**Date**: 2026-05-02

This document describes the internal data structures used by the OpenCopilot plugin to
represent parsed Copilot artifacts and the mappings between them and OpenCode config.

---

## Entities

### `CopilotInstructionFile`

Represents a loaded `.github/copilot-instructions.md` or `.github/instructions/*.instructions.md`
file.

| Field | Type | Source | Notes |
|---|---|---|---|
| `filePath` | `string` | File path on disk | Absolute path |
| `applyTo` | `string[]` | Frontmatter `applyTo` | Glob patterns; `["**/*"]` for copilot-instructions.md (applies to all) |
| `excludeAgent` | `string \| null` | Frontmatter `excludeAgent` | `"code-review"` or `"cloud-agent"` or null |
| `content` | `string` | File body (after frontmatter) | Raw Markdown text |
| `lastModified` | `number` | `fs.stat().mtimeMs` | Used for cache invalidation |

**Validation rules**:
- `applyTo` MUST contain at least one non-empty glob string (default: `["**/*"]`)
- `content` MUST be non-empty to be included in system prompt injection
- `filePath` MUST exist at scan time; missing files are silently skipped

**State transitions**:
```
DISCOVERED → PARSED → CACHED → STALE (on file.watcher.updated) → PARSED (re-read)
```

---

### `CopilotAgentDefinition`

Represents a parsed `.github/agents/*.md` or `.github/agents/*.agent.md` file.

| Field | Type | Source | Notes |
|---|---|---|---|
| `filePath` | `string` | File path on disk | Absolute path |
| `rawName` | `string` | Filename without extension | e.g., `"security-auditor"` |
| `name` | `string` | Frontmatter `name` or `rawName` | Display name; may differ from key |
| `normalizedKey` | `string` | Derived from `rawName` | Lowercase, hyphens only — used as OpenCode agent map key |
| `description` | `string` | Frontmatter `description` | Required; plugin skips files without this |
| `systemPrompt` | `string` | File body (after frontmatter) | Raw Markdown; used as `prompt` in OpenCode |
| `model` | `string \| null` | Frontmatter `model` | Normalized to `provider/model-id` format if recognizable, else null |
| `tools` | `string[] \| null` | Frontmatter `tools` | null = all tools; `[]` = deny all |
| `userInvocable` | `boolean` | Frontmatter `user-invocable` | Default: `true` |
| `target` | `string \| null` | Frontmatter `target` | Informational only; not used for filtering |

**Derived OpenCode agent config**:

```typescript
{
  description: agentDef.description,
  mode: "subagent",
  prompt: agentDef.systemPrompt,
  ...(agentDef.model ? { model: agentDef.model } : {}),
  hidden: !agentDef.userInvocable,
  permission: derivePermissions(agentDef.tools),
}
```

**`derivePermissions(tools)`**:
- `null` → `{}` (no restrictions, all allowed)
- `[]` → `{ "*": "deny" }`
- `["read", "search"]` → `{ read: "allow", glob: "allow", grep: "allow", edit: "deny", bash: "deny", task: "deny" }` — deny everything except explicitly listed

**Tool alias normalization** (Copilot alias → OpenCode permission key):

| Copilot alias | OpenCode permission key(s) |
|---|---|
| `read` | `read` |
| `edit`, `write` | `edit` |
| `execute`, `shell`, `bash` | `bash` |
| `search` | `glob`, `grep` |
| `web` | `webfetch`, `websearch` |
| `agent`, `task` | `task` |
| `todo` | `todowrite` |

**Validation rules**:
- `description` is REQUIRED; files missing this field are skipped with a warning
- `normalizedKey` must not collide with OpenCode built-in agent names (`build`, `plan`,
  `general`, `explore`, `compaction`, `title`, `summary`); collisions are suffixed with
  `-copilot` and a warning is logged
- `systemPrompt` length is capped at 30,000 characters (Copilot spec limit; truncation
  logged as warning)

---

### `CopilotSkill`

Represents a parsed `.github/skills/<name>/SKILL.md` file.

| Field | Type | Source | Notes |
|---|---|---|---|
| `filePath` | `string` | File path on disk | Absolute path of `SKILL.md` |
| `dirPath` | `string` | Parent directory | The `<name>` directory |
| `name` | `string` | Frontmatter `name` | Validated per OpenCode naming rules |
| `description` | `string` | Frontmatter `description` | Used in `<available_skills>` listing |
| `license` | `string \| null` | Frontmatter `license` | Passthrough |
| `content` | `string` | Full file body (after frontmatter) | Loaded when skill is invoked |

**Validation rules**:
- `name` MUST match `^[a-z0-9]+(-[a-z0-9]+)*$` (OpenCode naming rule)
- `name` MUST match the directory name; mismatches are warned and the directory name wins
- `description` is REQUIRED; files missing it are skipped with a warning
- Skill names MUST be unique across all sources; `.github/skills/` takes lower precedence
  than `.opencode/skills/` (native OpenCode skills shadow Copilot skills of same name)

---

### `PluginCache`

The in-memory state maintained by the plugin between hook invocations.

| Field | Type | Notes |
|---|---|---|
| `instructions` | `CopilotInstructionFile[]` | Sorted: copilot-instructions.md first, then path-specific files |
| `agents` | `Map<string, CopilotAgentDefinition>` | Keyed by `normalizedKey` |
| `skills` | `Map<string, CopilotSkill>` | Keyed by `name` |
| `watchedPaths` | `Set<string>` | Paths under `.github/` being watched for changes |
| `recentlyEditedFiles` | `Map<string, Set<string>>` | sessionID → Set of recently-modified file paths, used for `applyTo` evaluation |
| `initialized` | `boolean` | True after first scan completes |

---

## Mapping Tables (Copilot → OpenCode)

### Instruction Files → System Prompt

| Copilot concept | OpenCode mechanism | Plugin action |
|---|---|---|
| `.github/copilot-instructions.md` | System prompt | `experimental.chat.system.transform`: push content |
| `.github/instructions/*.instructions.md` (matching `applyTo`) | System prompt | `experimental.chat.system.transform`: push matching content |
| `AGENTS.md` (repo root or subdirs) | Already native | No plugin action needed |
| `CLAUDE.md` (repo root) | Already native via Claude Code compat | No plugin action needed |

### Agent Definitions → OpenCode Agents

| Copilot concept | OpenCode concept | Plugin action |
|---|---|---|
| `.github/agents/*.md` | `config.agent["<key>"]` | `config` hook: inject agent object |
| `description` frontmatter | `agent.description` | Direct mapping |
| `name` frontmatter | agent map key (sanitized) | `normalizedKey` derivation |
| Body (system prompt) | `agent.prompt` | Direct mapping |
| `model` | `agent.model` | Normalized to `provider/model-id` |
| `tools` list | `agent.permission` | Via `derivePermissions()` |
| `user-invocable: false` | `agent.hidden: true` | Direct mapping |

### Skills → OpenCode Skill Tool

| Copilot concept | OpenCode concept | Plugin action |
|---|---|---|
| `.github/skills/*/SKILL.md` | `<available_skills>` in system prompt | `experimental.chat.system.transform`: inject listing |
| Skill invocation (`skill({ name })`) | `tool.execute.before` on `skill` tool | Serve content from cache if name matches |

---

## Error and Warning States

| Condition | Severity | Behavior |
|---|---|---|
| `.github/` directory not found | Info | Plugin initializes with empty cache; logs "No .github/ directory found" |
| Agent file missing `description` | Warning | File skipped; logged |
| Agent name collides with built-in | Warning | Suffixed with `-copilot`; logged |
| Instruction file has empty body | Warning | File skipped |
| Skill `name` mismatches directory | Warning | Directory name wins; logged |
| File parse error (invalid frontmatter) | Warning | File skipped; error logged |
| `experimental.chat.system.transform` not available | Error (non-fatal) | Falls back to `session.prompt` approach; behavior degraded but not broken |
