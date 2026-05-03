<!--
SYNC IMPACT REPORT
==================
Version change: (none / initial template) → 1.0.0
Bump rationale: First ratification — all fields filled from scratch (MINOR+ initial).

Principles (all new, no prior values):
  - I.   Compatibility-First         [NEW]
  - II.  Plugin Architecture         [NEW]
  - III. Transparent Mapping         [NEW]
  - IV.  Workflow Integrity          [NEW]
  - V.   Simplicity & YAGNI          [NEW]

Added sections:
  - Technology Stack
  - Development Workflow
  - Governance

Removed sections: none

Templates status:
  ✅ .specify/templates/plan-template.md  — Constitution Check section reviewed; gates align with principles
  ✅ .specify/templates/spec-template.md  — Scope/requirements alignment verified; no changes required
  ✅ .specify/templates/tasks-template.md — Task categorization verified; no principle-driven gaps found
  ✅ README.md                            — Reviewed; no stale principle references

Deferred TODOs: none
-->

# OpenCopilot Constitution

## Core Principles

### I. Compatibility-First

GitHub Copilot configuration files (stored under `.github/copilot/`) MUST work in OpenCode
without modification. The plugin MUST NOT require users to duplicate, reformat, or migrate
existing Copilot configuration. Any Copilot concept that cannot yet be mapped MUST be
documented as an explicit known gap rather than silently ignored.

**Rationale**: The sole value proposition of this plugin is seamless reuse of existing
Copilot investment. Requiring manual adaptation defeats that purpose.

### II. Plugin Architecture

All OpenCopilot functionality MUST be delivered as a self-contained OpenCode plugin. No
changes to OpenCode core code are permitted. All integration points MUST use the published
OpenCode plugin API. The plugin MUST be independently installable and removable without
side-effects on the host OpenCode installation.

**Rationale**: A clean plugin boundary ensures OpenCopilot can be versioned, distributed,
and maintained independently of OpenCode itself.

### III. Transparent Mapping

Every GitHub Copilot concept (agent, skill, hook, instruction, rule) MUST have an explicit,
documented mapping to its OpenCode equivalent. Mappings MUST be maintained in the project
documentation. Undocumented or implicit behavioral mappings MUST NOT be relied upon.
Where a 1:1 mapping does not exist, the gap MUST be noted and a recommended workaround
provided.

**Rationale**: Transparency lets users reason about and trust the plugin's behavior without
reverse-engineering it.

### IV. Workflow Integrity

All feature work MUST follow the speckit SDD cycle: `specify → plan → tasks → implement`.
Each phase gate (review-spec, review-plan) MUST be respected before proceeding to the next
phase. No phase may be skipped. The workflow is defined in
`.specify/workflows/speckit/workflow.yml` and is the authoritative source of truth for
execution order.

**Rationale**: Skipping phases leads to unreviewed specs, unplanned implementations, and
rework. The gate model enforces deliberate, reviewable increments.

### V. Simplicity & YAGNI

Features MUST only be added when explicitly required by a specification. Complexity MUST
be justified by documenting the simpler alternative that was considered and rejected.
OpenCopilot MUST remain a thin adapter layer; business logic that belongs in OpenCode core
or in the user's own configuration MUST NOT be absorbed into this plugin.

**Rationale**: A small, focused plugin is easier to audit, maintain, and understand. Feature
creep erodes the compatibility-first mission.

## Technology Stack

- **AI integration**: OpenCode (`integration: opencode`)
- **Script runtime**: `sh` (POSIX-compatible shell scripts only)
- **Speckit version**: `0.8.5.dev0` (minimum required: `>=0.7.2`)
- **Branch numbering**: sequential (managed by `speckit.git.feature`)
- **Context/agent file**: `AGENTS.md` at repository root
- **Plugin config**: `.specify/` directory at repository root

## Development Workflow

- Feature branches MUST be created via `speckit.git.feature` before any spec work begins.
- Each speckit lifecycle phase (specify, plan, tasks, implement, checklist, analyze) has an
  associated optional auto-commit hook defined in `.specify/extensions.yml`.
- The SDD workflow file (`.specify/workflows/speckit/workflow.yml`) governs phase ordering
  and gate approval requirements.
- All commits relating to the constitution MUST reference the constitution version in the
  commit message (e.g., `docs: amend constitution to v1.0.0`).

## Governance

This constitution supersedes all other practices, guidelines, and informal conventions for
the OpenCopilot project. Any conflict between this document and another artifact is resolved
in favor of this document.

**Amendment procedure**:
1. Propose the amendment with a rationale and impact assessment.
2. Increment `CONSTITUTION_VERSION` per the semantic versioning policy below.
3. Update `LAST_AMENDED_DATE` to the amendment date (ISO 8601: `YYYY-MM-DD`).
4. Propagate changes to all dependent templates and documentation.
5. Commit with message: `docs: amend constitution to vX.Y.Z (<summary>)`.

**Versioning policy**:
- **MAJOR**: Backward-incompatible governance changes; principle removals or redefinitions.
- **MINOR**: New principle or section added; materially expanded guidance.
- **PATCH**: Clarifications, wording fixes, typo corrections, non-semantic refinements.

**Compliance review**: All pull requests MUST include a Constitution Check (see
`.specify/templates/plan-template.md`) verifying that the implementation does not violate
any principle. Violations MUST be justified in the Complexity Tracking table of the plan.

**Runtime guidance**: See `AGENTS.md` for agent-specific runtime development guidance.

**Version**: 1.0.0 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-05-02
