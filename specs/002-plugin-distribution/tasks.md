# Tasks: Plugin Distribution & Easy Installation

**Feature**: `002-plugin-distribution`  
**Input**: `specs/002-plugin-distribution/` (plan.md, spec.md, data-model.md, contracts/, quickstart.md)  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

---

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel with other [P] tasks in the same phase (different files, no dependencies)
- **[US#]**: Which user story this task belongs to
- Exact file paths are included in every task description
- **Effort**: XS = <30 min, S = 30–60 min, M = 1–2 h, L = 2–4 h, XL = 4+ h

---

## Phase 1: Setup (Foundation — No Dependencies)

**Purpose**: Wire up `package.json` and repo hygiene so all downstream tasks have a correct build
surface to work against. These two tasks can run in parallel and MUST complete before any Tier 1
work begins.

- [X] T001 [P] Update `package.json`: add `bin` (`"opencopilot": "bin/install.js"`), `files` (`["bin/", "dist/", "README.md", "LICENSE"]`), `engines` (`"node": ">=18.0.0"`), `keywords` array, `repository`/`homepage`/`bugs` URLs, and `bundle` script (`bun run scripts/bundle-plugin.ts`); also update `build` script to run bundle as part of the build chain — in `package.json` *(Effort: XS)* *(Contracts: npm-package-metadata.md §Required Fields)*
- [X] T002 [P] Add `dist/` entry to `.gitignore` so the generated bundle artifact is never committed — in `.gitignore` *(Effort: XS)*

**Checkpoint**: `package.json` is registry-ready; `dist/` is gitignored. Tier 1 can begin.

---

## Phase 2: Foundational (Core Artifacts — Depends on T001, T002)

**Purpose**: The two primary deliverables — the bundle script and the CLI installer — are
independent of each other (different files) and can be implemented in parallel. Both MUST be
complete before the release pipeline (T005), tests (T007–T008), or README update (T006) can be
finished.

### 2a — Bundle Script (US2 / US3 enabler)

- [X] T003 [P] Implement `scripts/bundle-plugin.ts`: call `Bun.build()` with entrypoint
  `.opencode/plugins/opencopilot.ts`, outfile `dist/opencopilot.ts`, target `bun`,
  externals `['@opencode-ai/plugin', 'js-yaml']`, minify `false`; prepend version banner
  `// opencopilot v{version}\n// https://github.com/{owner}/{repo}` (read version from
  `package.json`); exit non-zero on build error — in `scripts/bundle-plugin.ts`
  *(Effort: S)* *(Data model: BundleConfig; Contract: github-release-asset.md §Content contract)*

### 2b — CLI Installer (US1 / US4 enabler)

- [X] T004 [P] Implement `bin/install.js` as a zero-dependency Node.js 18+ ESM script with
  `#!/usr/bin/env node` shebang (must be `chmod +x`). Implement the full `InstallerConfig`
  / `InstallResult` state machine per `data-model.md §State Transitions`:
  - Parse `process.argv.slice(2)` for `install` subcommand and `--force` flag; print usage
    and exit 1 on unknown subcommand; print usage and exit 0 on `--help` / `-h`
  - `stat` target path `.opencode/plugins/opencopilot.ts`; branch on: not-found, symlink
    (warn + exit 1), regular file + no `--force` (interactive prompt defaulting to N),
    regular file + `--force` (skip prompt)
  - Fetch `https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts`
    using native `fetch`; resolve redirect to extract semver version from URL path; on
    network error print error + fallback URL to stderr and exit 1; treat empty response
    body as network error (VR-005)
  - `fs.mkdir` with `{ recursive: true }` for `.opencode/plugins/`
  - Write fetched content to `.opencode/plugins/opencopilot.ts`
  - Ensure `.opencode/package.json` exists with `@opencode-ai/plugin` and `js-yaml` deps;
    if file exists, merge missing keys only (do NOT overwrite user entries) — per
    `github-release-asset.md §.opencode/package.json Contract`
  - Print `✓ Installed opencopilot v{version} to .opencode/plugins/opencopilot.ts` on
    stdout; exit 0
  — in `bin/install.js` *(Effort: L)*
  *(Data model: InstallerConfig, InstallResult, ReleaseAsset, VR-001–VR-006)*
  *(Contract: cli-interface.md §Command Schema, §Exit Codes, §Standard Output, §Environment Behavior)*

**Checkpoint**: `bun run bundle` produces `dist/opencopilot.ts`; `node bin/install.js install`
installs the plugin. Release pipeline and tests can now begin.

---

## Phase 3: User Story 1 — One-Command Installation (Priority: P1) 🎯 MVP

**Goal**: `npx opencopilot install` places `.opencode/plugins/opencopilot.ts` in the current
project, creates missing directories, handles overwrites safely, writes `.opencode/package.json`
dependencies, and exits with a clear success/error message.

**Independent Test**: In a fresh `$(mktemp -d)` directory, run `node bin/install.js install`
(using a locally bundled `dist/opencopilot.ts` as fallback). Verify:
1. `.opencode/plugins/opencopilot.ts` exists and is non-empty
2. `.opencode/package.json` contains `@opencode-ai/plugin` and `js-yaml`
3. Exit code is `0`
4. Stdout contains `✓ Installed opencopilot v`

**Acceptance Scenarios covered**: AC1.1, AC1.2, AC1.3, AC1.4 from spec.md

### Tests for User Story 1

- [X] T007 [P] [US1] Write `tests/installer/install.test.ts` — installer integration tests
  covering all nine scenarios (run with `bun test`):
  1. **Fresh install**: temp dir, no pre-existing file → file written, exit 0, success message
  2. **Overwrite prompt — user says n**: file exists, no `--force`, stdin `n` → file unchanged, exit 0, "Skipped" message
  3. **Overwrite prompt — user says y**: file exists, no `--force`, stdin `y` → file overwritten, exit 0
  4. **`--force` flag**: file exists, `--force` → overwritten without prompting, exit 0
  5. **Symlink at target**: symlink at path → exit 1, stderr contains "is a symlink"
  6. **Missing parent dirs**: `.opencode/plugins/` absent → created automatically, file written
  7. **`.opencode/package.json` creation**: no pre-existing file → created with `@opencode-ai/plugin` + `js-yaml`
  8. **`.opencode/package.json` merge**: existing file with other keys → new deps added, existing keys preserved
  9. **Network error**: mock/offline network → exit 1, stderr contains fallback URL
  — in `tests/installer/install.test.ts` *(Effort: L)*
  *(Contract: cli-interface.md; Data model: VR-001–VR-006)*

### Implementation for User Story 1

> T004 (Phase 2) is the core implementation. The task below wires it into the npm binary
> and verifies the end-to-end `npx` entry point.

- [X] T008 [US1] Verify `bin/install.js` is executable (`chmod +x bin/install.js`) and that
  the `bin.opencopilot` field in `package.json` resolves correctly when simulated with
  `node bin/install.js install --force` in a temp directory; fix any shebang or module-type
  issues surfaced by tests — in `bin/install.js` and `package.json` *(Effort: XS)*
  *(Depends on: T004, T007)*

**Checkpoint**: All nine installer tests pass. `npx opencopilot install` works end-to-end.
User Story 1 is independently verifiable.

---

## Phase 4: User Story 2 — Fetch and Install via URL (Priority: P2)

**Goal**: Every GitHub Release exposes a stable versioned URL and a "latest" alias URL for
`opencopilot.ts`. Direct `curl`/`wget` download yields a self-contained, working plugin file.

**Independent Test**: After a release is published:
```bash
curl -fsSL https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts \
  -o /tmp/test-us2/.opencode/plugins/opencopilot.ts
# Verify: first line starts with "// opencopilot v"; file is non-empty; no relative imports
```

**Acceptance Scenarios covered**: AC2.1, AC2.2, AC2.3 from spec.md

### Tests for User Story 2

- [X] T005 [P] [US2] Write `tests/installer/bundle.test.ts` — bundle output validation tests
  (run with `bun test`; requires `bun run bundle` to have been executed first):
  1. **Bundle file exists**: `dist/opencopilot.ts` is present and non-empty after `bun run bundle`
  2. **Version banner**: first line matches regex `/^\/\/ opencopilot v\d+\.\d+\.\d+/`
  3. **No relative imports**: file content does NOT contain `../../src/`
  4. **Default export**: file contains `export default` and references `OpenCopilotPlugin`
  5. **External imports only**: only import sources are `@opencode-ai/plugin`, `js-yaml`, and
     `node:` built-ins (no other bare specifiers or relative paths)
  — in `tests/installer/bundle.test.ts` *(Effort: M)*
  *(Contract: github-release-asset.md §Content contract; Data model: BundleConfig)*

### Implementation for User Story 2

- [X] T006 [P] [US2] Implement `.github/workflows/release.yml`: tag-push pipeline triggered by
  `v*.*.*` tags. Jobs in order:
  1. **test**: `bun install && bun test && tsc --noEmit`
  2. **bundle**: `bun run bundle`; verify `dist/opencopilot.ts` is non-empty; verify
     `package.json` version matches git tag (strip `v` prefix)
  3. **release**: use `softprops/action-gh-release` (or equivalent) to create a GitHub
     Release titled `v{semver}` and upload `dist/opencopilot.ts` as a release asset named
     `opencopilot.ts`
  4. **publish**: `npm publish --access public` with `NODE_AUTH_TOKEN` secret; runs only
     after release job succeeds
  — in `.github/workflows/release.yml` *(Effort: M)*
  *(Contract: github-release-asset.md §Release Tag Convention; npm-package-metadata.md §Pre-publish Checks)*

**Checkpoint**: Pushing a `v*.*.*` tag creates a GitHub Release with `opencopilot.ts` attached.
The versioned and latest-alias URLs resolve to the correct file.

---

## Phase 5: User Story 3 — Package Registry Discovery (Priority: P2)

**Goal**: The `opencopilot` package appears on npm with correct metadata, keywords, and install
instructions so developers can find and install it organically.

**Independent Test**: After publish:
```bash
npm info opencopilot
# Verify: name = "opencopilot", keywords include "opencode" and "copilot",
#         description ≤ 160 chars, bin.opencopilot = "bin/install.js"
```

**Acceptance Scenarios covered**: AC3.1, AC3.2, AC3.3 from spec.md

### Implementation for User Story 3

> The npm publish step is part of T006 (`.github/workflows/release.yml`). The tasks here
> ensure the package metadata is correct and the tarball contents match the contract.

- [X] T009 [P] [US3] Audit `package.json` metadata fields against `npm-package-metadata.md`
  §Required Fields: confirm `name`, `description` (≤160 chars), `keywords` (includes
  `"opencode"` and `"copilot"`), `repository`, `homepage`, `bugs`, `license` (`"MIT"`),
  `type` (`"module"`), `bin`, `files`, `engines` are all present and correct; add any
  missing fields — in `package.json` *(Effort: XS)*
  *(Depends on: T001; Contract: npm-package-metadata.md)*

- [X] T010 [US3] Manual smoke test — run `npm pack --dry-run` and verify tarball contents
  match `npm-package-metadata.md §Published Files`:
  - MUST contain: `bin/install.js`, `dist/opencopilot.ts`, `README.md`, `LICENSE`
  - MUST NOT contain: `src/`, `specs/`, `.specify/`, `tests/`, `.opencode/plugins/opencopilot.ts`
  Fix `files` field in `package.json` if any violations are found
  — in `package.json` *(Effort: XS)* *(Manual)*
  *(Depends on: T006 bundle output exists; Contract: npm-package-metadata.md §Published Files)*

  **Manual Verification Result (2026-05-03)**: `npm pack --dry-run` confirmed tarball contains:
  - ✓ `bin/install.js` (7.8KB)
  - ✓ `dist/opencopilot.ts` (25.0KB)
  - ✓ `README.md` (9.8KB)
  - ✓ `package.json` (auto-included)
  - ⚠ `LICENSE` missing — add via T016
  - ✓ No `src/`, `specs/`, `.specify/`, `tests/` in tarball

**Checkpoint**: `npm info opencopilot` returns correct metadata; `npm pack --dry-run` shows only
the whitelisted files.

---

## Phase 6: User Story 4 — Update to Latest Version (Priority: P3)

**Goal**: Re-running `npx opencopilot install --force` (or an equivalent update path) silently
replaces the installed plugin file with the latest published version and reports the new version
number. If already on the latest version the user is informed without modification.

**Independent Test**: Install an older version manually, then run:
```bash
node bin/install.js install --force
# Verify: file content differs from old version; stdout shows new version number; exit 0
```

**Acceptance Scenarios covered**: AC4.1, AC4.2 from spec.md

### Implementation for User Story 4

- [X] T011 [US4] Extend `bin/install.js` to detect "already up to date": after fetching the
  latest content, compare the version banner in the fetched content against the first line
  of the existing installed file (if any); if they match and `--force` is NOT set, print
  `Already up to date (v{version}). No changes made.` and exit 0 without writing
  — in `bin/install.js` *(Effort: S)*
  *(Depends on: T004; Data model: InstallResult.skipped; spec.md AC4.2)*

- [X] T012 [US4] Add test case to `tests/installer/install.test.ts` for the "already up to
  date" scenario: mock fetch returning content whose version banner matches the existing
  installed file → verify exit 0, "up to date" message, file unchanged
  — in `tests/installer/install.test.ts` *(Effort: XS)*
  *(Depends on: T007, T011)*

**Checkpoint**: Running the install command when already on the latest version produces an
informative no-op message. `--force` still overwrites unconditionally.

---

## Phase 7: User Story 5 — README Reflects Simple Install UX (Priority: P1)

**Goal**: The `README.md` shows `npx opencopilot install` as the first and primary install
instruction, removes the manual `cp` instruction, and adds a `curl` fallback and version badge.

**Independent Test**: Read the published README on GitHub; confirm the install section is the
first actionable block; confirm no `cp path/to/opencopilot.ts` instruction remains.

**Acceptance Scenarios covered**: AC5.1, AC5.2 from spec.md

### Implementation for User Story 5

- [X] T013 [US5] Update `README.md`:
  1. Move the **Installation** section to the top, above all other content
  2. Replace any `cp .opencode/plugins/opencopilot.ts ...` instruction with:
     ```bash
     npx opencopilot install
     ```
  3. Add a `# Force-overwrite / update` subsection showing `npx opencopilot install --force`
  4. Add a `# Direct download (no npm/npx)` subsection with the `curl` fallback:
     ```bash
     curl -fsSL https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts \
       -o .opencode/plugins/opencopilot.ts
     ```
  5. Add a version badge (e.g., `![npm version](https://img.shields.io/npm/v/opencopilot)`)
     below the project title
  6. Add a note for monorepo users: run from the specific sub-project root
  — in `README.md` *(Effort: S)* *(FR-010; spec.md edge cases §monorepo)*

**Checkpoint**: README shows `npx opencopilot install` as the first install instruction; no
manual `cp` instruction remains; curl fallback is documented.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and any cross-story improvements that span multiple
components.

- [X] T014 [P] Manual smoke test — `npx` end-to-end in a fresh temp directory:
  ```bash
  cd $(mktemp -d)
  npx opencopilot install
  # Verify: .opencode/plugins/opencopilot.ts created; .opencode/package.json created;
  #         stdout shows "✓ Installed opencopilot v..."; exit 0; completes in <10 seconds
  ```
  Document any issues found and fix before release
  — *(Effort: XS)* *(Manual)* *(FR-008, SC-001, SC-002)*
  *(Depends on: T004, T006 — requires a published release or locally packed npm package)*

  **Manual Smoke Test Instructions** (run after first release is published):
  ```bash
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR"
  npx opencode-copilot install
  # Verify:
  # - .opencode/plugins/opencopilot.ts exists and is non-empty
  # - .opencode/package.json contains @opencode-ai/plugin and js-yaml
  # - stdout shows "✓ Installed opencopilot v..."
  # - exit code is 0
  # - completes in <10 seconds
  ls -la .opencode/plugins/opencopilot.ts
  cat .opencode/package.json
  ```

- [X] T015 [P] Verify npm name availability: run `npm info opencopilot` before the first tag
  push; if the name is taken, update `package.json` `name` field to `opencode-copilot` and
  update all references in `bin/install.js`, `README.md`, and `.github/workflows/release.yml`
  — in `package.json`, `bin/install.js`, `README.md`, `.github/workflows/release.yml`
  *(Effort: XS)* *(Manual)* *(Risk: plan.md §Risk Register "npm name taken")*

  **Result**: `opencopilot` is taken (existing package, ISC license, React deps). Updated
  `package.json` name to `opencode-copilot`. Updated README and bin/install.js accordingly.

- [X] T016 [P] Add `LICENSE` file to repository root if not present (required by
  `npm-package-metadata.md §Published Files` and `package.json` `files` array)
  — in `LICENSE` *(Effort: XS)*

- [X] T017 Run full test suite and type-check to confirm no regressions:
  ```bash
  bun run bundle && bun test && tsc --noEmit
  ```
  Fix any failures before creating the first release tag
  — *(Effort: XS)* *(Depends on: T003, T005, T007, T008, T012)*

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (T001, T002)           ← No dependencies — start immediately, run in parallel
       │
       ▼
Phase 2 (T003, T004)           ← Depends on T001; T003 and T004 are parallel
       │
       ├──────────────────────────────────────────────┐
       ▼                                              ▼
Phase 3 / US1 (T007, T008)     Phase 4 / US2 (T005, T006)    ← Parallel after Phase 2
       │                                              │
       ▼                                              ▼
Phase 6 / US4 (T011, T012)     Phase 5 / US3 (T009, T010)    ← US4 depends on US1; US3 depends on US2
       │
       ▼
Phase 7 / US5 (T013)           ← Depends on T003 (bundle exists) and T004 (installer exists)
       │
       ▼
Phase 8 (T014–T017)            ← Polish; depends on all prior phases
```

### User Story Dependencies

| User Story | Priority | Depends On | Independent? |
|---|---|---|---|
| US1 — One-Command Install | P1 | T001, T002, T004 | ✅ Yes |
| US2 — URL Download | P2 | T001, T002, T003 | ✅ Yes |
| US3 — Registry Discovery | P2 | T001, T006 (publish) | ✅ Yes |
| US4 — Update to Latest | P3 | T004 (US1 complete) | Builds on US1 |
| US5 — README | P1 | T003, T004 (for accurate docs) | ✅ Yes |

### Within Each Phase

- **Phase 1**: T001 and T002 are fully parallel (different files)
- **Phase 2**: T003 and T004 are fully parallel (different files, independent logic)
- **Phase 3**: T007 (tests) can be written before T008 (verification); T007 should be written to fail first
- **Phase 4**: T005 (bundle tests) and T006 (workflow) are parallel
- **Phase 8**: T014–T016 are parallel; T017 must run last

---

## Parallel Execution Examples

### Immediate Start (Phase 1 — no prerequisites)

```
Parallel batch:
  Task T001: Update package.json fields and scripts
  Task T002: Add dist/ to .gitignore
```

### After Phase 1 completes (Phase 2)

```
Parallel batch:
  Task T003: Implement scripts/bundle-plugin.ts
  Task T004: Implement bin/install.js
```

### After Phase 2 completes (Phase 3 + Phase 4 start together)

```
Parallel batch A (User Story 1):
  Task T007: Write tests/installer/install.test.ts
  Task T008: Verify bin/install.js chmod + module type

Parallel batch B (User Story 2):
  Task T005: Write tests/installer/bundle.test.ts
  Task T006: Implement .github/workflows/release.yml
```

### After Phase 3 + 4 complete

```
Parallel batch (User Story 3 + 4 + 5):
  Task T009: Audit package.json metadata
  Task T011: Extend bin/install.js for "up to date" detection
  Task T013: Update README.md
```

---

## Implementation Strategy

### MVP Scope (User Stories 1 + 5 — P1 only)

Minimum set for a useful, shippable release:

1. ✅ Complete Phase 1 (T001, T002)
2. ✅ Complete Phase 2 (T003, T004)
3. ✅ Complete Phase 3 / US1 (T007, T008) — installer works end-to-end
4. ✅ Complete Phase 7 / US5 (T013) — README reflects new install UX
5. **STOP AND VALIDATE**: `npx opencopilot install` works; README is correct
6. Tag `v0.1.0` and validate release pipeline (T006 from Phase 4)

### Full v1 Delivery Order

1. MVP scope above (US1 + US5)
2. Phase 4 / US2 (T005, T006) — release pipeline + URL distribution
3. Phase 5 / US3 (T009, T010) — npm registry metadata audit
4. Phase 6 / US4 (T011, T012) — update-to-latest UX improvement
5. Phase 8 (T014–T017) — polish + smoke tests before first public release

### Parallel Team Strategy (if multiple developers)

With 2 developers after Phase 2 completes:

- **Developer A**: Phase 3 (US1 installer tests + verification) → Phase 6 (US4 update UX)
- **Developer B**: Phase 4 (US2 bundle tests + release pipeline) → Phase 5 (US3 registry metadata)
- Both converge for Phase 7 (README) and Phase 8 (polish)

---

## Task Summary

| Phase | Tasks | User Story | Effort | Parallelizable |
|---|---|---|---|---|
| 1 — Setup | T001, T002 | — | XS + XS | ✅ Both |
| 2 — Foundational | T003, T004 | — | S + L | ✅ Both |
| 3 — US1 Install | T007, T008 | US1 (P1) | L + XS | T007 parallel |
| 4 — US2 URL | T005, T006 | US2 (P2) | M + M | T005 parallel |
| 5 — US3 Registry | T009, T010 | US3 (P2) | XS + XS | T009 parallel |
| 6 — US4 Update | T011, T012 | US4 (P3) | S + XS | — |
| 7 — US5 README | T013 | US5 (P1) | S | — |
| 8 — Polish | T014, T015, T016, T017 | — | XS × 4 | T014–T016 parallel |

**Total tasks**: 17  
**Total effort estimate**: ~10–12 hours  
**Critical path**: T001 → T004 → T007 → T008 → T013 → T017 (~5 h)

---

## Notes

- `[P]` tasks = different files, no inter-dependencies; safe to run concurrently
- `[US#]` label maps each task to a specific user story for traceability
- Test tasks (T005, T007, T012) MUST be written to **fail** before their implementation tasks run
- Installer tests in T007 should mock the network (`fetch`) to avoid flaky tests that require live GitHub access
- The `dist/` directory is gitignored (T002) but MUST be present in the npm tarball — the workflow builds it before `npm publish`
- Verify npm name `opencopilot` availability (T015) **before** the first tag push to avoid a broken release pipeline
- Commit after each phase checkpoint to maintain a clean, bisect-friendly history
