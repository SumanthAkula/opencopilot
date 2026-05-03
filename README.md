# OpenCopilot

An [OpenCode](https://opencode.ai) plugin that adapts `.github/` GitHub Copilot
customizations to work natively in OpenCode — zero configuration required.

Agents, skills, and instructions that you have set up for GitHub Copilot (VS Code extension,
CLI, or GitHub.com) will work in OpenCode automatically, as if they were configured for
OpenCode from the start.

---

## Installation

Copy (or symlink) the plugin into your project's OpenCode plugins directory:

```bash
mkdir -p .opencode/plugins
cp path/to/opencopilot.ts .opencode/plugins/opencopilot.ts
```

That's it. Start an OpenCode session and the plugin will auto-discover your `.github/` files.

**Verify it loaded** — look for this line in startup output:

```
[opencopilot] Loaded: N instruction files, M agents, K skills from .github/
```

---

## Supported Copilot File Types

### Repository-Wide Instructions

**File**: `.github/copilot-instructions.md`

Injected automatically into every OpenCode agent's system prompt. No frontmatter needed.

```markdown
You are a helpful assistant for a TypeScript project.
Always prefer functional programming patterns.
```

### Path-Specific Instructions

**Pattern**: `.github/instructions/**/*.instructions.md`

Injected when the current session has recently edited files matching the `applyTo` glob.

```markdown
---
applyTo: "**/*.ts,**/*.tsx"
---

Always use `const` over `let`. Prefer `interface` over `type`.
```

| Frontmatter field | Required | Default | Notes |
|---|---|---|---|
| `applyTo` | No | `**/*` (all files) | Comma-separated glob patterns |
| `excludeAgent` | No | null | Parsed but not used in OpenCode |

### Custom Agents

**Pattern**: `.github/agents/*.md` or `.github/agents/*.agent.md`

Registered as OpenCode subagents — available via `@agent-name` in chat.

```markdown
---
description: Performs security audits and identifies vulnerabilities
tools:
  - read
  - search
---

You are a security expert. Focus on identifying potential security issues...
```

| Frontmatter field | Required | Default | Notes |
|---|---|---|---|
| `description` | **Yes** | — | File skipped if missing |
| `name` | No | filename | Display name |
| `model` | No | inherit | See model normalization below |
| `tools` | No | all | Empty list = deny all |
| `user-invocable` | No | `true` | `false` → hidden from `@` menu |
| `target` | No | null | Parsed, not used for filtering |

**Tool aliases** (Copilot → OpenCode):

| Copilot alias | OpenCode permission |
|---|---|
| `read` | `read` |
| `edit`, `write` | `edit` |
| `execute`, `shell`, `bash` | `bash` |
| `search` | `glob`, `grep` |
| `web` | `webfetch`, `websearch` |
| `agent`, `task` | `task` |
| `todo` | `todowrite` |

**Model normalization**: Short model names are mapped to `provider/model-id` format.
Known models include `gpt-4o`, `claude-3.5-sonnet`, `gemini-2.5-pro`, and others.
If a model name is unrecognized, it is omitted and a warning is logged.

### Skills

**Pattern**: `.github/skills/<name>/SKILL.md`

Made available via the OpenCode `skill` tool. The plugin injects an `<available_skills>`
listing into the system prompt so agents can discover them.

```markdown
---
name: git-release
description: Create consistent releases and changelogs
---

## What I do
Draft release notes from merged PRs and propose a version bump.
```

| Frontmatter field | Required | Notes |
|---|---|---|
| `name` | **Yes** | Must match `^[a-z0-9]+(-[a-z0-9]+)*$` and match directory name |
| `description` | **Yes** | Used in skill listing |
| `license` | No | Passthrough |
| `allowed-tools` | No | Parsed but not used (see Known Gaps) |

---

## Copilot → OpenCode Mapping Table

| Copilot concept | OpenCode equivalent | Status |
|---|---|---|
| `.github/copilot-instructions.md` | System prompt injection | ✅ Supported |
| `.github/instructions/*.instructions.md` | System prompt (path-filtered) | ✅ Supported |
| `.github/agents/*.md` | OpenCode subagents via `config` hook | ✅ Supported |
| `.github/skills/*/SKILL.md` | OpenCode `skill` tool listing | ✅ Supported |
| `AGENTS.md` (repo root / subdirs) | Native OpenCode support | ✅ Native (no plugin needed) |
| `CLAUDE.md` (repo root) | Native OpenCode support | ✅ Native (no plugin needed) |
| `.github/prompts/*.prompt.md` | No equivalent | ⚠️ See Known Gaps |
| `.github/hooks/*.json` | OpenCode plugin events | ⚠️ See Known Gaps |
| Agent `mcp-servers` field | OpenCode `mcp` config | ⚠️ See Known Gaps |
| Skill `allowed-tools` field | No equivalent | ⚠️ See Known Gaps |
| Agent `disable-model-invocation` | No equivalent | ⚠️ See Known Gaps |
| Org/enterprise-level instructions | Out of scope | ❌ Not supported |

---

## Known Gaps

| Feature | Status | Recommended Workaround |
|---|---|---|
| `.github/prompts/*.prompt.md` | Not supported in v1 | Convert to `.github/instructions/*.instructions.md` with `applyTo: "**/*"` |
| `.github/hooks/*.json` (lifecycle hooks) | Not bridged | Implement equivalent logic as an OpenCode plugin hook |
| Agent `mcp-servers` field | Ignored | Configure MCP servers in `opencode.json` directly |
| Skill `allowed-tools` | Ignored | No per-skill tool permission in OpenCode skills API |
| Agent `disable-model-invocation` | Ignored | Use `hidden: true` via `user-invocable: false` instead |
| Unknown model names | Omitted with warning | Add the model to the `KNOWN_MODELS` map in `src/mapper.ts` |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No startup log line | Plugin file not found or syntax error | Check `.opencode/plugins/opencopilot.ts` exists |
| "0 instruction files" | `.github/copilot-instructions.md` missing or empty | Verify file exists and has content |
| Agent not in `@` autocomplete | Agent file missing `description` frontmatter | Add `description:` to the agent's frontmatter |
| Agent name collision warning | Agent name matches a built-in OpenCode agent | Plugin auto-suffixes with `-copilot`; use `@agent-name-copilot` |
| Skill not discovered | `name` field doesn't match directory name | Ensure `name: my-skill` in `.github/skills/my-skill/SKILL.md` |
| Instructions not applied | `applyTo` glob too narrow | Try `applyTo: "**/*"` or verify glob syntax |
| Model warning logged | Copilot model name not in mapping table | Update `KNOWN_MODELS` in `src/mapper.ts` |

---

## Architecture

The plugin is structured as follows:

```
src/
├── types.ts         # Data model: CopilotInstructionFile, CopilotAgentDefinition, CopilotSkill, PluginCache
├── parser.ts        # YAML frontmatter parser
├── glob-matcher.ts  # applyTo glob evaluation
├── scanner.ts       # .github/ directory scanner
├── mapper.ts        # Copilot → OpenCode field mapping
└── index.ts         # Public re-exports

.opencode/plugins/
└── opencopilot.ts   # Plugin entry point (hooks wiring)
```

**Key OpenCode hooks used**:
- `config` — register Copilot agent definitions as OpenCode agents
- `experimental.chat.system.transform` — inject instructions and skill listings
- `tool.execute.before` — intercept skill tool calls for `.github/skills/`
- `event` — cache invalidation on file changes, recent-file tracking

---

## License

MIT
