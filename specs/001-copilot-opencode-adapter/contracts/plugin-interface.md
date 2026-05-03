# Contract: OpenCopilot Plugin Interface

**Feature**: `001-copilot-opencode-adapter`
**Date**: 2026-05-02
**Type**: OpenCode Plugin API Contract

This document defines the contract between the OpenCopilot plugin and the OpenCode plugin
API. It specifies which hooks are used, what inputs they receive, and what mutations they
perform.

---

## Plugin Entry Point

**File**: `.opencode/plugins/opencopilot.ts`

```typescript
import type { Plugin } from "@opencode-ai/plugin"

export const OpenCopilotPlugin: Plugin = async (ctx) => {
  // Initialization: scan .github/ and populate cache
  // Returns: hooks object
}
```

The exported name MUST be a named export of type `Plugin`. The plugin is loaded
automatically by OpenCode from `.opencode/plugins/`.

---

## Hook: `config`

**Purpose**: Register parsed Copilot agent definitions as OpenCode agents.

**Fires**: Once at plugin startup, before any session starts.

**Input**: The resolved `Config` object (full `opencode.json` structure).

**Contract**:
- For each `CopilotAgentDefinition` in the plugin cache:
  - If `config.agent[normalizedKey]` already exists → skip (native config wins).
  - Otherwise → set `config.agent[normalizedKey]` to the derived OpenCode agent object.
- MUST NOT remove or modify any existing entries in `config.agent`.
- MUST NOT modify any other field of `config`.

**Example output** (addition to `config.agent`):
```json
{
  "security-auditor-copilot": {
    "description": "Performs security audits and identifies vulnerabilities",
    "mode": "subagent",
    "prompt": "You are a security expert...",
    "permission": { "edit": "deny" }
  }
}
```

---

## Hook: `experimental.chat.system.transform`

**Purpose**: Inject Copilot instruction file contents and skill listings into the
system prompt before every LLM call.

**Fires**: Before every LLM call in any session.

**Input**:
- `input.sessionID` — the current session ID (may be undefined for system calls)
- `input.model` — the model being used
- `output.system` — array of system prompt strings (already assembled by OpenCode)

**Contract**:
- Evaluate `CopilotInstructionFile.applyTo` globs against the set of recently-edited
  files for `input.sessionID` (from `PluginCache.recentlyEditedFiles`).
- For each matching instruction file (including `.github/copilot-instructions.md`):
  - Push a formatted section to `output.system`:
    ```
    ## Instructions from {relative_file_path}
    {content}
    ```
- For `.github/copilot-instructions.md`: always inject (no `applyTo` filtering).
- After instructions, push the skill listing XML block if any skills are in cache:
  ```xml
  <available_skills>
    <skill><name>skill-name</name><description>...</description></skill>
  </available_skills>
  ```
- MUST NOT inject duplicate content if called multiple times for the same session.
- MUST NOT throw; errors are caught and logged, returning without mutation.

---

## Hook: `tool.execute.before` (skill tool)

**Purpose**: Intercept `skill` tool calls to serve `.github/skills/` content.

**Fires**: Before any tool execution. Only acts when `input.tool === "skill"`.

**Input**:
- `input.tool` — tool name
- `input.sessionID`, `input.callID`
- `output.args` — `{ name: string }` for the skill tool

**Contract**:
- If `input.tool !== "skill"` → no-op.
- If `output.args.name` matches a key in `PluginCache.skills`:
  - Mutate `output.args` to inject the skill content via a mechanism that causes the
    skill tool to return the cached content. (Exact mechanism: set a special field or
    use a side-channel that the skill tool handler reads — to be confirmed during
    implementation against the actual `skill` tool source.)
  - If the interception mechanism is not possible, fall back to injecting the content
    via a follow-up system transform instead.
- If `output.args.name` is NOT in `PluginCache.skills` → no-op (let native skill
  resolution proceed).

---

## Hook: `event` (file.watcher.updated)

**Purpose**: Maintain `PluginCache.recentlyEditedFiles` for `applyTo` evaluation,
and invalidate cached instruction/agent/skill data when `.github/` files change.

**Fires**: On every SSE event.

**Contract**:
- If `event.type === "file.watcher.updated"`:
  - Extract the file path from event properties.
  - If path is under `.github/`:
    - Re-read the affected file and update the corresponding cache entry.
    - If the file was deleted, remove it from cache.
  - If path is any file:
    - Add to `PluginCache.recentlyEditedFiles[sessionID]` (if sessionID is available
      from event context; otherwise use a global recent-files set).
    - Evict entries older than the session's last 100 file changes (memory bound).

---

## Configuration Contract (No User Config Required)

The plugin operates in zero-config mode. There is no required `opencode.json`
configuration for the plugin to function.

**Optional user override** (documented in README, not required):
```json
{
  "opencopilot": {
    "github_dir": ".github",
    "agent_prefix": "",
    "inject_instructions": true,
    "inject_skills": true,
    "inject_agents": true
  }
}
```

These options are read from `config` (if present) during the `config` hook. All default
to the values shown above. This is a v1+ concern; not required for the initial implementation.

---

## Error Handling Contract

- All hook functions MUST catch their own errors and log via `console.warn`/`console.error`.
- Errors in any hook MUST NOT propagate to OpenCode (would break the session).
- Each hook returns normally (resolves without throwing) even in error cases.
- The plugin MUST log a startup summary to stderr:
  ```
  [opencopilot] Loaded: N instruction files, M agents, K skills from .github/
  ```
