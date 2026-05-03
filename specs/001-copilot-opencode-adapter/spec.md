# Feature Specification: GitHub Copilot Configuration Adapter for OpenCode

**Feature Branch**: `001-copilot-opencode-adapter`
**Created**: 2026-05-02
**Status**: Draft
**Input**: User description: "We will be building a plugin for the OpenCode coding agent that adapts `.github/copilot/` customizations to work natively in OpenCode. Things like agent definitions, plans, instructions, skills, etc that are set up to work with copilot (like the vscode extension or cli) should also work with OpenCode."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Copilot Instructions Work in OpenCode (Priority: P1)

A developer has an existing project with a `.github/copilot/` directory containing
`instructions.md` files and `copilot-instructions.md` at the repo root. When they start an
OpenCode session in that project, the Copilot instructions are automatically applied to the
OpenCode agent's context — without any manual migration or duplication.

**Why this priority**: Instructions are the most commonly used Copilot customization and
the highest-value, lowest-friction mapping. Without this, the plugin delivers no value.

**Independent Test**: Can be fully tested by placing a `copilot-instructions.md` in a test
project, starting an OpenCode session, and verifying the agent's behavior reflects those
instructions without any manual OpenCode configuration.

**Acceptance Scenarios**:

1. **Given** a project with `.github/copilot/copilot-instructions.md`, **When** an OpenCode
   session starts, **Then** the instructions from that file are included in the agent's
   context automatically.
2. **Given** a project with `.github/copilot/*.md` instruction files, **When** an OpenCode
   session starts, **Then** all matching instruction files are loaded into the agent's context.
3. **Given** a project that has both `.github/copilot/copilot-instructions.md` and an
   `AGENTS.md`, **When** an OpenCode session starts, **Then** both files contribute to the
   agent's context (no conflict, both are loaded).

---

### User Story 2 - Copilot Agent Definitions Work in OpenCode (Priority: P2)

A developer has defined custom Copilot agents (`.github/copilot/agents/*.md` or equivalent
Copilot agent definition files). When they use OpenCode, those agents are available as
OpenCode agents (subagents or primary agents as appropriate), selectable via `@` mention or
Tab cycling — without rewriting them for OpenCode.

**Why this priority**: Agent definitions provide significant workflow value and their
metadata (description, model, permissions) maps directly to OpenCode agent configuration.

**Independent Test**: Can be fully tested by creating a Copilot agent definition file,
starting OpenCode, and verifying the agent appears in the agent list and responds with its
defined persona/prompt.

**Acceptance Scenarios**:

1. **Given** a `.github/copilot/agents/` directory with agent markdown files, **When** an
   OpenCode session starts, **Then** those agents are available as OpenCode subagents
   accessible via `@` mention.
2. **Given** a Copilot agent definition with a custom `description` and system prompt,
   **When** the agent is invoked in OpenCode, **Then** the agent behaves according to its
   defined description and prompt.
3. **Given** a Copilot agent definition that specifies tool restrictions, **When** the agent
   runs in OpenCode, **Then** the corresponding OpenCode permissions are applied.

---

### User Story 3 - Copilot Skills Work in OpenCode (Priority: P3)

A developer has Copilot skill definitions in their project or home directory (following
Copilot's skill convention). When they use OpenCode, those skills are available via the
OpenCode `skill` tool — without re-creating them in OpenCode's format.

**Why this priority**: Skills extend agent capabilities with reusable instructions. The
mapping is well-defined and adds measurable value for users with existing skill libraries.

**Independent Test**: Can be fully tested by creating a Copilot-format skill file, starting
OpenCode, and verifying the skill is discoverable and loadable by the agent.

**Acceptance Scenarios**:

1. **Given** Copilot skill files in a recognized location, **When** an OpenCode session
   starts, **Then** those skills appear in the agent's available skill list.
2. **Given** a Copilot skill with a `name` and `description`, **When** the OpenCode agent
   loads it via the `skill` tool, **Then** the skill's instructions are injected into the
   agent's context.

---

### User Story 4 - Zero-Config Discovery (Priority: P1)

A developer installs the OpenCopilot plugin and starts an OpenCode session. They do not
need to configure anything manually — the plugin automatically discovers all supported
Copilot customization files in the standard locations and applies them.

**Why this priority**: The core value proposition is zero-migration reuse. If the user must
manually configure mappings, the plugin fails its purpose.

**Independent Test**: Can be fully tested by installing the plugin in a project with
existing Copilot files and confirming no `opencode.json` changes are required for the
files to take effect.

**Acceptance Scenarios**:

1. **Given** the OpenCopilot plugin is installed, **When** no additional OpenCode
   configuration is provided, **Then** all supported Copilot files are discovered and
   applied automatically.
2. **Given** a project without any Copilot files, **When** an OpenCode session starts,
   **Then** the plugin loads silently with no errors and no effect on behavior.

---

### Edge Cases

- What happens when a Copilot file contains syntax or fields that have no OpenCode
  equivalent? The plugin MUST skip the unrecognized field gracefully and log a warning
  without failing the session.
- What happens when a Copilot agent name conflicts with a built-in OpenCode agent name?
  The plugin MUST document the conflict and allow the user to resolve it via optional
  configuration (e.g., prefix or rename).
- What happens when the `.github/copilot/` directory exists but is empty? The plugin loads
  silently with no effect.
- What happens if the same customization is defined in both Copilot files and native
  OpenCode config? OpenCode's native configuration takes precedence (plugin is additive only).
- What happens when Copilot files reference other files (e.g., `@some-file.md`)? The
  plugin attempts to resolve relative references within the project; unresolvable references
  are skipped with a warning.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The plugin MUST automatically discover and load `.github/copilot/` instruction
  files (including `copilot-instructions.md` at the repo root and `*.md` files in
  `.github/copilot/`) when an OpenCode session starts.
- **FR-002**: Loaded Copilot instructions MUST be injected into the OpenCode agent's context
  using OpenCode's native `instructions` mechanism, requiring no manual `opencode.json`
  configuration by the user.
- **FR-003**: The plugin MUST discover agent definition files from `.github/copilot/agents/`
  and expose them as OpenCode agents available via `@` mention.
- **FR-004**: Copilot agent definitions MUST be translated to OpenCode agent format,
  preserving description, system prompt, and tool restriction fields where mappings exist.
- **FR-005**: The plugin MUST discover Copilot-format skill files from recognized locations
  and make them available via the OpenCode `skill` tool.
- **FR-006**: The plugin MUST operate in zero-config mode — all discovery and loading MUST
  occur automatically without requiring changes to `opencode.json`.
- **FR-007**: The plugin MUST degrade gracefully: unrecognized fields, missing files, and
  unsupported Copilot features MUST be skipped with a warning rather than causing errors.
- **FR-008**: The plugin MUST be purely additive — it MUST NOT override or replace any
  existing native OpenCode configuration the user has set.
- **FR-009**: The plugin MUST document all supported Copilot-to-OpenCode mappings and all
  known gaps in its README.

### Key Entities

- **Copilot Instruction File**: A Markdown file in `.github/copilot/` (or repo root
  `copilot-instructions.md`) containing natural-language instructions for the AI agent.
- **Copilot Agent Definition**: A Markdown file with YAML frontmatter defining a custom
  agent persona, model, tool restrictions, and system prompt.
- **Copilot Skill**: A directory-based skill definition (`SKILL.md` with frontmatter)
  following OpenCode's skill convention (already largely compatible).
- **OpenCode Plugin**: A JavaScript/TypeScript module loaded from `.opencode/plugins/` that
  hooks into OpenCode events to modify behavior.
- **Mapping Table**: The documented correspondence between Copilot configuration concepts
  and their OpenCode equivalents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with an existing Copilot-configured project can start using
  OpenCode with that project and have their Copilot instructions active within 60 seconds,
  without editing any configuration file.
- **SC-002**: 100% of Copilot instruction files present in a standard project layout are
  discovered and loaded automatically (zero missed files for the supported file patterns).
- **SC-003**: All supported Copilot agent definitions are available as OpenCode agents in
  the same session where they are discovered, with no manual registration step.
- **SC-004**: The plugin produces no errors and no degraded behavior when run in a project
  with no Copilot files at all.
- **SC-005**: Every Copilot field that cannot be mapped to OpenCode is documented in the
  plugin's mapping table as a named known gap.

## Assumptions

- The `.github/copilot/` directory layout follows the conventions documented in GitHub's
  Copilot customization reference (agents in `agents/`, instructions in root-level `.md`
  files or `copilot-instructions.md`).
- Users have OpenCode installed and running; this plugin does not manage OpenCode
  installation.
- The project is a standard file-system project (local disk); remote-only or cloud-only
  repositories are out of scope for v1.
- Copilot skill files already follow a format compatible with OpenCode's `SKILL.md`
  convention (name, description frontmatter) — the primary work is discovery and path
  bridging, not format translation.
- Copilot "plans" referenced in the user description map to OpenCode agent system prompts
  or instruction files, not to a distinct OpenCode concept called "plans."
- The plugin targets the project-level plugin location (`.opencode/plugins/`) for
  installation; global installation is out of scope for v1.
