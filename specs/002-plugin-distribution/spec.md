# Feature Specification: Plugin Distribution & Easy Installation

**Feature Branch**: `002-plugin-distribution`
**Created**: 2026-05-03
**Status**: Draft
**Input**: User description: "Packaging and distributing the opencopilot plugin so it is easy for end-users to install. Consider: npm/JSR publish, single-file bundle, npx/bunx installer script, and GitHub Releases as distribution mechanisms."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-Command Installation (Priority: P1)

A developer discovers the OpenCopilot plugin (via README, npm search, or a colleague's
recommendation) and wants to add it to their project. They run a single command in their
project root and the plugin file is placed in the correct location — ready to use with
OpenCode immediately, without navigating directories, downloading files manually, or
knowing anything about the project's internal structure.

**Why this priority**: The primary motivation for this entire feature is eliminating
friction at install time. If the one-command experience does not work, the feature has
failed its purpose regardless of how well other distribution channels work.

**Independent Test**: Can be fully tested in a fresh project directory by running the
install command without any prior knowledge of the plugin's internals, then verifying
that OpenCode loads the plugin successfully on next start.

**Acceptance Scenarios**:

1. **Given** a developer is in any project directory with OpenCode available, **When**
   they run the install command (e.g., `npx opencopilot install`), **Then** the file
   `.opencode/plugins/opencopilot.ts` is created in the current directory and the
   command exits with a success message in under 10 seconds.
2. **Given** the plugin is already installed in a project, **When** the install command
   is run again, **Then** the user is warned that the file already exists and is prompted
   to confirm before overwriting (no silent data loss).
3. **Given** the install command is run and the `.opencode/plugins/` directory does not
   yet exist, **When** installation runs, **Then** the directory is created automatically
   and the plugin file is placed correctly.
4. **Given** the install command is run with a `--force` flag, **When** the plugin file
   already exists, **Then** it is silently overwritten without prompting.

---

### User Story 2 - Fetch and Install via URL (Priority: P2)

A developer prefers not to install global tools or run commands that require network
access to a package registry. They want to fetch the plugin file directly with `curl`
or `wget` and place it themselves. A stable, versioned URL exists for every published
release so they can pin to an exact version or always fetch the latest.

**Why this priority**: Some environments restrict package registry access (corporate
firewalls, air-gapped systems). A direct-download URL provides a zero-dependency
fallback for any environment.

**Independent Test**: Can be fully tested by running `curl <latest-url> -o .opencode/plugins/opencopilot.ts`
in a fresh project and verifying OpenCode loads the plugin on next start.

**Acceptance Scenarios**:

1. **Given** a publicly accessible URL for the latest plugin release, **When** a
   developer fetches it with `curl` or `wget`, **Then** the downloaded file is a
   complete, self-contained plugin that works without any additional dependencies.
2. **Given** a versioned URL (e.g., for v1.2.0), **When** it is fetched, **Then** it
   always returns exactly that version — the URL is stable and does not change content
   after the version is published.
3. **Given** a "latest" alias URL, **When** it is fetched, **Then** it resolves to the
   most recently published stable release.

---

### User Story 3 - Package Registry Discovery (Priority: P2)

A developer searches npm (or JSR) for "opencode copilot" or "opencopilot" and finds the
package immediately. The package page shows the current version, a brief description, and
clear install instructions. This allows the plugin to be discovered organically by
developers already browsing registries for OpenCode tooling.

**Why this priority**: Registry presence enables organic discovery and legitimizes the
project alongside other npm/JSR packages. It also provides a canonical version history
and a stable reference for documentation authors and blog posts.

**Independent Test**: Can be tested by searching npm and JSR for the package name and
confirming the listing appears with correct metadata and install instructions.

**Acceptance Scenarios**:

1. **Given** a search for "opencopilot" on npm, **When** results appear, **Then** the
   official package appears in the top results with an accurate description and current
   version number.
2. **Given** a developer views the package page, **When** they read the install section,
   **Then** they see a one-command install instruction that matches the documented UX.
3. **Given** a new version of the plugin is released, **When** it is published to the
   registry, **Then** the package page reflects the new version within 5 minutes.

---

### User Story 4 - Update to Latest Version (Priority: P3)

A developer installed the plugin previously and wants to upgrade to the latest version
because a new Copilot file type is now supported. They run a single command (or re-run
the original install command with a flag) and the plugin file in their project is
replaced with the latest version.

**Why this priority**: Plugins evolve as OpenCode and GitHub Copilot APIs change.
Providing a frictionless update path maintains long-term user trust and encourages
adoption of new features.

**Independent Test**: Can be tested by installing an older version, then running the
update command and verifying the updated file differs from the original and matches the
latest published version.

**Acceptance Scenarios**:

1. **Given** an older version of the plugin is installed, **When** the developer runs
   the update command (or `npx opencopilot install --force`), **Then** the installed
   file is replaced with the latest published version.
2. **Given** the developer is already on the latest version, **When** they run the
   update command, **Then** they are informed that no update is available and no file
   is modified.

---

### User Story 5 - README Reflects Simple Install UX (Priority: P1)

A developer lands on the GitHub repository or package registry page for OpenCopilot.
The README prominently shows a single install command at the top, above all other
content, with no required prerequisite steps beyond having a terminal. The current
manual `cp path/to/opencopilot.ts ...` instruction is replaced.

**Why this priority**: The README is the primary entry point for new users. The current
manual copy instruction is a friction point that the distribution feature must eliminate
from all user-facing documentation.

**Independent Test**: Can be tested by reading the published README and confirming the
install command is the first actionable step a user sees.

**Acceptance Scenarios**:

1. **Given** the published README on GitHub and on any registry page, **When** a
   developer reads the installation section, **Then** the first instruction is a
   single-command install (e.g., `npx opencopilot install`) requiring no prior setup.
2. **Given** the README, **When** a developer reads it, **Then** the manual file-copy
   instruction is absent (removed or deprecated in favor of the new command).

---

### Edge Cases

- What if the user's package manager blocks `npx` execution? The direct-URL download
  method serves as a documented fallback and must always be available.
- What if a user installs into a monorepo with multiple sub-projects? The install
  command targets the current working directory; users must run it from the specific
  sub-project root where they want the plugin. Documentation must make this explicit.
- What if two different versions of the plugin are installed in different sub-projects
  of a monorepo? Each is self-contained and independent — no conflict occurs.
- What if the plugin file at the target path is a symlink (the old manual install UX)?
  The install command MUST detect the symlink and warn the user rather than silently
  replacing it with a regular file.
- What if the distribution channel (npm registry, GitHub) is temporarily unavailable?
  The installer MUST surface a clear error message with a link to the fallback download
  URL. It MUST NOT fail silently.
- What if a new version of the plugin is incompatible with an older version of OpenCode?
  Version compatibility requirements are documented per release. The installer surfaces
  a warning if a minimum OpenCode version is not met (detected by checking for a known
  OpenCode marker, e.g., a config file).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A single install command MUST place a complete, working plugin file at
  `.opencode/plugins/opencopilot.ts` in the current project directory, creating
  intermediate directories if needed.
- **FR-002**: The install command MUST warn and prompt the user before overwriting an
  existing plugin file, unless a `--force` flag is supplied.
- **FR-003**: The install command MUST detect and warn when the target path is a symlink
  rather than a regular file.
- **FR-004**: The plugin MUST be distributed as a self-contained single file that
  requires no additional installation steps after being placed in `.opencode/plugins/`.
- **FR-005**: A stable, versioned URL MUST exist for every published release, pointing
  to the exact plugin file for that version.
- **FR-006**: A "latest" alias URL MUST exist that always resolves to the most recently
  published stable release file.
- **FR-007**: The package MUST be published to at least one public registry (npm and/or
  JSR) under the name `opencopilot` (or an equivalent unambiguous name) with accurate
  metadata (description, keywords, repository link).
- **FR-008**: The install command MUST complete within 10 seconds under normal network
  conditions.
- **FR-009**: An update mechanism MUST exist that replaces the installed plugin file
  with the latest published version.
- **FR-010**: The README MUST be updated to show the single-command install as the
  primary (and first) installation instruction, replacing the manual file-copy method.
- **FR-011**: The installer MUST output a clear success message upon completion,
  confirming the file path where the plugin was installed and the version installed.
- **FR-012**: The installer MUST output a clear, actionable error message when
  distribution channels are unavailable, including a fallback download URL.

### Key Entities

- **Plugin File**: The single self-contained file (`opencopilot.ts` or equivalent) that
  users place in `.opencode/plugins/`. This is the primary distributable artifact.
- **Installer Command**: The CLI entry point users invoke to install the plugin (e.g.,
  `npx opencopilot install`). Must work without global installation of any tool.
- **Published Package**: The entry in a public package registry (npm, JSR) that makes
  the plugin discoverable and installable. Contains metadata and the plugin file.
- **Release Asset**: The plugin file attached to a versioned GitHub Release, providing
  a stable direct-download URL for each version.
- **Latest URL**: A permanent URL alias that always redirects to or serves the most
  recent stable release asset.
- **Version**: A semantic version identifier (e.g., `1.0.0`) used to label each release
  and construct stable versioned URLs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with no prior knowledge of the plugin's internals can go from
  discovery to a working installation in under 60 seconds using a single command in their
  terminal.
- **SC-002**: The install command succeeds (places the correct file, exits 0) in 100% of
  runs on supported platforms (macOS, Linux, Windows with WSL) under normal network
  conditions.
- **SC-003**: The installed plugin file is byte-for-byte identical to the published
  release artifact for the version selected — no modification or corruption occurs during
  distribution.
- **SC-004**: The versioned download URL for any published release remains accessible
  and returns the correct file for a minimum of 2 years after the release date.
- **SC-005**: The package appears in npm search results for "opencopilot" within 24 hours
  of first publish.
- **SC-006**: Updating from any prior version to the latest requires no more steps than
  the initial install (one command).
- **SC-007**: Zero manual file-editing or directory-creation steps are required of the
  user during a standard install — the installer handles all setup automatically.
- **SC-008**: The installer produces a non-zero exit code and a human-readable error
  message in 100% of failure scenarios (network error, permission denied, etc.),
  enabling scripted automation to detect failures reliably.

## Assumptions

- Users have either `npx` (bundled with npm ≥ 5.2) or `bunx` available in their PATH;
  the install command targets at least one of these runners as the zero-install entry point.
- The plugin file itself remains a single TypeScript (or JavaScript) file; the
  distribution mechanism does not require splitting it into multiple files.
- GitHub is used as the primary source-of-truth for versioned release assets; other
  registries (npm, JSR) point to or mirror these assets.
- Semantic versioning (semver) is used for all releases; pre-release versions (alpha,
  beta) are out of scope for the stable distribution channel in v1.
- The "latest" URL alias is maintained by GitHub Releases' built-in "latest" redirect
  mechanism, not a custom redirect service.
- Windows users without WSL are out of scope for v1; the install command targets
  Unix-like environments. Native Windows support may be addressed in a future iteration.
- The plugin does not require any build step at install time — the distributed file
  is already in its final usable form.
- JSR publication is a stretch goal for v1; npm is the minimum viable registry target.
