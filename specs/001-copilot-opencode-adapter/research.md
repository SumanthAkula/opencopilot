# Research: GitHub Copilot → OpenCode Adapter

**Feature**: `001-copilot-opencode-adapter`
**Date**: 2026-05-02

---

## Decision 1: Plugin Language and Runtime

**Decision**: TypeScript, compiled to JavaScript, loaded as an OpenCode project-level plugin
from `.opencode/plugins/opencopilot.ts` (or `.js` for the distributed artifact).

**Rationale**: The OpenCode plugin API is TypeScript-native (`@opencode-ai/plugin` package).
TypeScript provides full type safety against the plugin hook signatures, which are
non-trivial (e.g., `experimental.chat.system.transform`, `config`). Bun is the runtime
(OpenCode uses Bun internally), so no separate build step is needed for `.ts` files in
`.opencode/plugins/`.

**Alternatives considered**:
- Plain JavaScript — rejected because the complex hook types (`Hooks`, `Plugin`,
  `PluginInput`) are only documented via TypeScript; JS would require manual type juggling.
- Separate npm package — rejected for v1 (YAGNI); local plugin file is simpler and does
  not require a publish step.

---

## Decision 2: Instruction Injection Mechanism

**Decision**: Use the `experimental.chat.system.transform` hook to inject Copilot
instruction file contents into the system prompt before every LLM call.

**Rationale**: This is the only mechanism that:
1. Modifies the actual system prompt (not a user-turn message).
2. Fires before every LLM call (including compacted sessions).
3. Does not require writing files to disk or modifying `opencode.json`.

The alternative (`session.prompt` with `noReply: true` on `session.created`) injects a
user-turn message, which is lower priority than system instructions and pollutes session
history.

The `config` hook's `instructions` field expects file paths (relative to config location),
not inline text. Since Copilot instruction files live in `.github/` (not `.opencode/`), we
would have to either symlink or copy files — both violate Principle I (no modification of
existing files) and Principle V (thin adapter).

**Alternatives considered**:
- `config.instructions` with file paths — rejected because paths must be relative to
  `opencode.json`, creating a fragile coupling between config location and `.github/`
  directory.
- `session.prompt({ noReply: true })` — viable secondary option; used as fallback if
  `experimental.chat.system.transform` is not available.

**Caveat**: `experimental.chat.system.transform` is prefixed `experimental.` — it may
change between OpenCode versions. This risk is documented and the plugin will include a
version compatibility check.

---

## Decision 3: Agent Registration Mechanism

**Decision**: Use the `config` hook to dynamically register parsed Copilot agent
definitions into `config.agent` at plugin startup (before any session starts).

**Rationale**: The `config` hook is the only runtime mechanism that can inject agent
definitions in a way that makes them available for `@` mention and Tab cycling. Writing
`.md` files to `.opencode/agents/` is not viable because:
1. Files written during plugin init may not be picked up until next startup.
2. It pollutes the user's project directory with generated files.
3. It violates Principle I (no modification to user's workspace beyond `.opencode/plugins/`).

The `config` hook fires before sessions start and its mutations to `config.agent` are
effective immediately.

**Alternatives considered**:
- Writing agent `.md` files to `.opencode/agents/` at startup — rejected (see above).
- Injecting agent personas via `experimental.chat.system.transform` — rejected because
  it would make all agents always active, not selectable individually.

**Field mapping: Copilot agent → OpenCode agent config**:

| Copilot field | OpenCode field | Notes |
|---|---|---|
| `description` (frontmatter) | `description` | Required in both |
| `name` (frontmatter) | agent key (map key) | Sanitized: lowercase, hyphens |
| Body (Markdown prompt) | `prompt` | Inline string |
| `model` | `model` | Format differs — needs normalization |
| `tools: []` | `permission: { "*": "deny" }` | Deny-all when tools empty |
| `tools: ["read"]` | `permission: { read: "allow" }` | Per-tool allow |
| `user-invocable: false` | `hidden: true` | Maps directly |
| `disable-model-invocation` | No equivalent | Documented as gap |
| `mcp-servers` | No equivalent | Documented as gap |
| `metadata` | No equivalent | Ignored |
| `target: "vscode"` | Ignored (already in OpenCode context) | No filter needed |

---

## Decision 4: Skill Bridging Mechanism

**Decision**: For `.github/skills/` skill files, use `experimental.chat.system.transform`
to inject skill content directly into the system prompt as a skills listing. This avoids
file writes and works immediately.

Separately, the plugin will also support `.opencode/skills/` and `.claude/skills/` paths
natively (those are already discovered by OpenCode without any plugin work).

**The key bridging task**: Make `.github/skills/<name>/SKILL.md` files visible to OpenCode,
which does not natively scan `.github/skills/`.

**Approach**:
1. At plugin startup, scan `.github/skills/*/SKILL.md` for all skill definitions.
2. In `experimental.chat.system.transform`, inject a synthetic skills listing section
   that mirrors what OpenCode would add from natively discovered skills:
   ```
   <available_skills>
     <skill><name>my-skill</name><description>...</description></skill>
   </available_skills>
   ```
3. When an agent calls `skill({ name: "..." })`, intercept via the `tool.execute.before`
   hook for the `skill` tool: if the requested skill name matches a `.github/skills/` skill,
   serve its content; otherwise pass through.

**Alternatives considered**:
- Symlinking `.github/skills/` → `.opencode/skills/` at startup — rejected (modifies
  project, violates Principle I).
- Writing files to `.opencode/skills/` at startup — same rejection reasoning as agents.

**Field mapping: Copilot skill → OpenCode skill**:

| Copilot SKILL.md field | OpenCode SKILL.md field | Notes |
|---|---|---|
| `name` | `name` | Identical format |
| `description` | `description` | Identical |
| `license` | `license` | Identical |
| `allowed-tools` | `compatibility` | Semantics differ; document as gap |
| Body content | Body content | Direct passthrough |

---

## Decision 5: Path-Specific Instructions (`*.instructions.md`) Handling

**Decision**: In `experimental.chat.system.transform`, evaluate each
`.github/instructions/*.instructions.md` file's `applyTo` glob against the active session's
recently-touched files (obtained via `file.watcher.updated` events). Inject matching
instruction files' content into the system prompt.

**Rationale**: The `applyTo` frontmatter glob is a native Copilot feature that filters
instructions to files in context. Naively injecting all instruction files regardless of
`applyTo` would pollute the system prompt unnecessarily (Principle V: Simplicity).

**Active files detection strategy**: Subscribe to `file.watcher.updated` events and
maintain a per-session set of recently-edited file paths. Use this set to evaluate `applyTo`
globs at system-transform time.

**Alternatives considered**:
- Inject all instruction files unconditionally (ignore `applyTo`) — viable fallback for v1
  if glob matching proves complex. Will be documented as a known simplification.
- Use `tool.execute.after` on file-read/write tools to track context — more targeted but
  misses files the agent opens for reading.

---

## Decision 6: Copilot "Plans" — No Distinct Artifact

**Decision**: There is no "plans" file type in the official Copilot spec. The user's mention
of "plans" maps to one of: (a) `.github/prompts/*.prompt.md` (VS Code-only, currently in
public preview), or (b) `AGENTS.md`-style agentic instructions.

**Approach for v1**: Ignore `.github/prompts/` (preview/VS-Code-only, not widely adopted).
Document as a known gap with a recommended workaround: add prompts as instruction files
with appropriate `applyTo` scope. This will be revisited in a future spec.

---

## Decision 7: File Scanning — When and How

**Decision**: All file scanning (`.github/` directory traversal) MUST occur in the plugin's
async init function (the outer `async (ctx) => { ... }` wrapper), NOT inside hook
callbacks. Scanned content is cached in plugin-local variables.

**Rationale**: Scanning the filesystem on every LLM call (inside
`experimental.chat.system.transform`) would add latency to every request. Scanning once at
startup (when the plugin is loaded) is O(1) per LLM call.

**Re-scan trigger**: Subscribe to `file.watcher.updated` events; if a file in `.github/`
changes, re-scan that file and update the cache. This keeps the plugin responsive to
changes without full rescans.

---

## Decision 8: Conflict Resolution Strategy

**Decision**: The plugin is additive only. If a user has a native `opencode.json` agent
named the same as a `.github/agents/` Copilot agent, the native definition takes precedence
(OpenCode merges config, and later entries from the `config` hook may be ignored for
existing keys).

**Implementation**: In the `config` hook, check if the agent key already exists before
setting it:
```typescript
if (!config.agent[normalizedName]) {
  config.agent[normalizedName] = { /* from Copilot def */ }
}
```

This ensures native OpenCode config always wins, consistent with FR-008.

---

## Known Gaps (Documented per Principle III)

| Copilot Feature | OpenCode Equivalent | Status |
|---|---|---|
| `.github/prompts/*.prompt.md` | No equivalent | Gap — deferred to future spec |
| `.github/hooks/*.json` | OpenCode plugin events | Partial — hooks are JS/TS events, not shell scripts; v1 does not bridge these |
| `mcp-servers` in agent profiles | OpenCode `mcp` config | Gap — different config mechanism; not bridged in v1 |
| `allowed-tools` in skills | No OpenCode equivalent | Gap — documented, ignored |
| Per-agent `model` normalization | Requires provider ID prefix | Addressed by normalization logic |
| `disable-model-invocation` | No equivalent | Gap — documented, ignored |
| `AGENTS.md` subdirectory walk | Already native in OpenCode | No plugin work needed |
| `CLAUDE.md` / `GEMINI.md` compatibility | Already native in OpenCode | No plugin work needed |
| Org/enterprise-level instructions | Not applicable for local plugin | Out of scope |
| Code-review 4,000-char limit | Not applicable (OpenCode has no code-review mode) | N/A |

---

## Technical Summary

**Plugin entry**: `.opencode/plugins/opencopilot.ts`
**Language**: TypeScript (Bun runtime, no separate build step)
**Key hooks used**:
- `config` — register Copilot agents into OpenCode agent config
- `experimental.chat.system.transform` — inject instructions + skills into system prompt
- `tool.execute.before` — intercept `skill` tool calls for `.github/skills/` bridging
- `event` — react to `file.watcher.updated` for cache invalidation

**Files scanned at startup**:
- `.github/copilot-instructions.md`
- `.github/instructions/**/*.instructions.md`
- `.github/agents/*.md` and `.github/agents/*.agent.md`
- `.github/skills/*/SKILL.md`

**No files written to the user's project directory by the plugin**.
