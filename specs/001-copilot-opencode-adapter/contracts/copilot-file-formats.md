# Contract: Supported Copilot File Formats

**Feature**: `001-copilot-opencode-adapter`
**Date**: 2026-05-02
**Type**: Input Format Contract

This document defines the Copilot file formats the plugin MUST accept. Files not conforming
to these contracts are skipped with a warning.

---

## `copilot-instructions.md`

**Path**: `.github/copilot-instructions.md`

**Frontmatter**: None recognized. The entire file content is treated as the body.

**Body**: Free-form Markdown. Injected verbatim into the system prompt.

**Constraints**: None enforced by the plugin. Files over 30,000 characters are accepted
but a warning is logged.

---

## Path-Specific Instruction Files

**Pattern**: `.github/instructions/**/*.instructions.md`

**Frontmatter** (YAML, optional):
```yaml
---
applyTo: "glob-or-comma-separated-globs"  # optional; default: "**/*" (all files)
excludeAgent: "code-review"               # optional; not meaningful for OpenCode
---
```

| Field | Required | Default | Notes |
|---|---|---|---|
| `applyTo` | No | `**/*` | Single glob string or comma-separated list |
| `excludeAgent` | No | null | Parsed but not used by OpenCode adapter |

**Body**: Free-form Markdown. Injected into system prompt when `applyTo` matches.

---

## Agent Definition Files

**Pattern**: `.github/agents/*.md` OR `.github/agents/*.agent.md`

**Frontmatter** (YAML):
```yaml
---
description: "Required: what this agent does"
name: "optional-display-name"
model: "optional-model-id"
tools:
  - read
  - search
user-invocable: true
target: "vscode"
---
```

| Field | Required | Type | Default | Notes |
|---|---|---|---|---|
| `description` | **Yes** | string | — | File skipped if missing |
| `name` | No | string | filename without extension | |
| `model` | No | string | null | |
| `tools` | No | string[] | null (all) | Empty array = deny all |
| `user-invocable` | No | boolean | true | |
| `target` | No | string | null | Not used for filtering |

**Ignored fields** (parsed but not mapped): `disable-model-invocation`, `mcp-servers`,
`metadata`, `argument-hint`, `handoffs`.

**Body**: Markdown system prompt for the agent. Max 30,000 characters (truncated with warning).

---

## Skill Files

**Pattern**: `.github/skills/<name>/SKILL.md`

**Frontmatter** (YAML):
```yaml
---
name: "required-skill-name"
description: "required description"
license: "MIT"
allowed-tools: shell
---
```

| Field | Required | Notes |
|---|---|---|
| `name` | **Yes** | Must match `^[a-z0-9]+(-[a-z0-9]+)*$`; file skipped if invalid |
| `description` | **Yes** | File skipped if missing |
| `license` | No | Passthrough, not used by plugin logic |
| `allowed-tools` | No | Parsed but not mapped (documented gap) |

**Body**: Markdown skill instructions. Served verbatim when the skill is invoked.
