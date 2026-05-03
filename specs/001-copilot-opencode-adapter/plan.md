# Implementation Plan: GitHub Copilot Configuration Adapter for OpenCode

**Branch**: `001-copilot-opencode-adapter` | **Date**: 2026-05-02 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/001-copilot-opencode-adapter/spec.md`

## Summary

Build an OpenCode plugin (`.opencode/plugins/opencopilot.ts`) that discovers GitHub Copilot
customization files in `.github/` and maps them to OpenCode native concepts at runtime,
requiring zero configuration changes from the user. The plugin uses three key OpenCode hooks:
`config` (agent registration), `experimental.chat.system.transform` (instruction + skill
injection), and `tool.execute.before` (skill tool interception).

## Technical Context

**Language/Version**: TypeScript (Bun runtime, no separate build step; Bun handles `.ts`
directly from `.opencode/plugins/`)
**Primary Dependencies**: `@opencode-ai/plugin` (types + `tool` helper); Node/Bun built-in
`fs`, `path`; `js-yaml` or Bun's built-in YAML for frontmatter parsing
**Storage**: File system only — read `.github/` on startup, cache in plugin-local variables;
no database, no written files
**Testing**: Bun test (`bun test`); unit tests for parser, mapper, and glob-matching logic;
integration test against a fixture `.github/` directory
**Target Platform**: Any OS where OpenCode runs (Linux, macOS, Windows via WSL); POSIX paths
used internally with `path.join` for portability
**Project Type**: OpenCode plugin (TypeScript library loaded as a Bun module)
**Performance Goals**: Plugin startup < 50ms for a typical project (< 20 instruction files,
< 10 agents, < 10 skills); `experimental.chat.system.transform` hook overhead < 5ms per call
**Constraints**: No writes to user's project directory; no network calls; must degrade
gracefully if `.github/` is absent; must not break OpenCode if any hook throws
**Scale/Scope**: Single project at a time; no multi-repo or monorepo traversal in v1

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| I. Compatibility-First | Copilot files used without modification | ✅ PASS — plugin reads `.github/` files as-is |
| II. Plugin Architecture | All functionality via OpenCode plugin API | ✅ PASS — uses `config`, `experimental.chat.system.transform`, `tool.execute.before` hooks only |
| III. Transparent Mapping | All Copilot → OpenCode mappings documented | ✅ PASS — data-model.md and contracts/ document every field mapping and known gap |
| IV. Workflow Integrity | SDD cycle followed | ✅ PASS — spec → plan → tasks → implement |
| V. Simplicity & YAGNI | Thin adapter only | ✅ PASS — no business logic; all complexity is in parsing + mapping; file writes explicitly excluded |

**Post-design re-check**: All gates still pass. The `experimental.chat.system.transform`
hook is prefixed `experimental.` — this is a known risk; documented in research.md Decision 2.
No complexity tracking violations.

## Project Structure

### Documentation (this feature)

```text
specs/001-copilot-opencode-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── plugin-interface.md       # OpenCode plugin hook contracts
│   └── copilot-file-formats.md   # Supported Copilot file format contracts
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
.opencode/
└── plugins/
    └── opencopilot.ts        # Plugin entry point (exported: OpenCopilotPlugin)

src/
├── scanner.ts                # .github/ directory scanner; returns PluginCache
├── parser.ts                 # Frontmatter + body parser for each file type
├── mapper.ts                 # Copilot → OpenCode field mapping logic
├── glob-matcher.ts           # applyTo glob evaluation against file sets
└── types.ts                  # CopilotInstructionFile, CopilotAgentDefinition, CopilotSkill, PluginCache

tests/
├── unit/
│   ├── parser.test.ts
│   ├── mapper.test.ts
│   └── glob-matcher.test.ts
├── integration/
│   └── plugin.test.ts        # Full plugin init against fixture .github/ directory
└── fixtures/
    └── sample-github/        # Sample .github/ directory for tests
        ├── copilot-instructions.md
        ├── instructions/
        │   └── ts-rules.instructions.md
        ├── agents/
        │   └── security-auditor.md
        └── skills/
            └── git-release/
                └── SKILL.md
```

**Structure Decision**: Single project (Option 1 from template). The plugin is a TypeScript
library with a thin entry point in `.opencode/plugins/` and source modules in `src/`. Test
fixtures mirror a real-world `.github/` directory to enable integration testing.

## Complexity Tracking

> No constitution violations to justify.
