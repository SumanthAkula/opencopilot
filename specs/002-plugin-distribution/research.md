# Research: Plugin Distribution

**Feature**: 002-plugin-distribution  
**Date**: 2026-05-03  
**Status**: Complete — all NEEDS CLARIFICATION items resolved

---

## Decision 1: Plugin File Format — What does OpenCode load?

**Decision**: The distributable artifact MUST be a `.ts` (TypeScript) file. OpenCode loads plugin files via **Bun's runtime** directly from `.opencode/plugins/`. Bun natively executes TypeScript with zero compilation step at install time.

**Rationale**: From the OpenCode plugin documentation (confirmed from upstream source):
> "Place JavaScript or TypeScript files in the plugin directory. Files in these directories are automatically loaded at startup."

OpenCode uses `await import(plugin)` after `bun install`. Bun resolves `.ts` imports natively. The plugin API (`@opencode-ai/plugin`) is TypeScript-first. Users expect a `.ts` file at `.opencode/plugins/opencopilot.ts` — FR-001 explicitly names this path.

**Alternatives considered**:
- `.js` file: Technically supported, but contradicts the established convention (the plugin lives at `opencopilot.ts`) and forces users to see a `.js` file in a TypeScript-centric toolchain.
- Compiled JS bundle: Would require stripping the `.ts` extension from the install path, breaking FR-001 which requires exactly `.opencode/plugins/opencopilot.ts`.

---

## Decision 2: Bundle Strategy — How to produce a self-contained single file?

**Decision**: Use `bun build --bundle` to produce a **single self-contained JavaScript file** named `opencopilot.ts` (with TypeScript extension, `.ts`). The output file is placed as the release artifact. Concretely:

```bash
bun build .opencode/plugins/opencopilot.ts \
  --outfile dist/opencopilot.ts \
  --target bun \
  --external @opencode-ai/plugin
```

Wait — Bun's bundler outputs `.js` by default. The output file extension is determined by the `--outfile` flag, which can be `.ts`. However, there is a cleaner alternative:

**Revised Decision**: Use a **copy-then-inline strategy** instead of Bun bundler, because:

1. The current `opencopilot.ts` imports from `../../src/scanner.ts`, `../../src/mapper.ts`, etc. via **relative paths**. These resolve correctly when running from the repo directory.
2. For distribution, the file must be self-contained — all `src/` module code must be inlined.
3. Bun can bundle the plugin entry point: `bun build .opencode/plugins/opencopilot.ts --outfile dist/opencopilot.ts --target bun --external @opencode-ai/plugin --external js-yaml`
4. Bun's bundler produces a `.js` ESM file; renaming it to `.ts` works for Bun loading (Bun treats the extension as advisory when `type: "module"` is present).

**BUT**: The cleanest approach is a **dedicated build script** (`scripts/bundle-plugin.ts`) that uses Bun's API to:
- Bundle `opencopilot.ts` + all `src/` deps into a single ESM output
- Mark `@opencode-ai/plugin` and `js-yaml` as external (OpenCode provides these via `bun install` in `.opencode/`)
- Output as `dist/opencopilot.ts` (Bun can load it; `.ts` extension on a bundled `.js` output is acceptable to Bun)

**Alternatives considered**:
- Copy as-is (no bundle): Breaks when the file is placed in another project's `.opencode/plugins/` because `../../src/` no longer exists. **Rejected** — violates FR-004 (self-contained single file).
- Include `src/` in the package and use a `package.json` in `.opencode/`: Over-complex for users; requires additional setup. **Rejected** — violates FR-001/FR-007 simplicity requirement.
- Full inline (manual concatenation): Error-prone, hard to maintain. **Rejected** in favor of Bun bundler.

---

## Decision 3: CLI Entry Point — How does `npx opencopilot install` work?

**Decision**: Add a dedicated **`bin/install.js`** file (JavaScript, not TypeScript, for `npx` compatibility) to the package, with a `#!/usr/bin/env node` shebang. Reference it in `package.json`'s `bin` field as `opencopilot`. This enables `npx opencopilot install`.

**Why JavaScript (`bin/install.js`) not TypeScript (`bin/install.ts`)**:
- `npx` runs scripts via **Node.js** by default (not Bun). Node.js 22+ supports TypeScript via `--experimental-strip-types`, but this flag is not guaranteed in all environments.
- Using a `.js` file with `#!/usr/bin/env node` shebang ensures the installer works with `npx` (Node) universally.
- The installer logic is simple file I/O + HTTP fetch — no TypeScript-specific syntax needed.
- Alternatively, a `.ts` file with `#!/usr/bin/env -S npx tsx` shebang works but adds a dependency on `tsx`.

**package.json bin field**:
```json
{
  "bin": {
    "opencopilot": "bin/install.js"
  }
}
```

**Command signature** (`npx opencopilot install [--force]`):
- Subcommand `install` is required (future-proofs for other subcommands like `update`)
- `--force` flag skips the overwrite prompt (FR-002/FR-004)
- The script fetches the bundled `dist/opencopilot.ts` from GitHub Releases and writes it to `.opencode/plugins/opencopilot.ts`

**Alternatives considered**:
- `bin/install.ts` with bun shebang: Works for `bunx opencopilot install` but NOT for standard `npx`. Since FR-001 targets `npx`, this was rejected.
- Single `index.ts` as both library export and CLI: Conflates concerns; harder to test. Rejected per Principle V (Simplicity & YAGNI).

---

## Decision 4: Installer Source of Truth — Where does the installer fetch from?

**Decision**: The installer fetches from **GitHub Releases raw asset URL**, not the npm tarball. Specifically:

- **Versioned URL pattern**: `https://github.com/{owner}/{repo}/releases/download/v{version}/opencopilot.ts`
- **Latest URL pattern**: `https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts`

GitHub Releases' `/releases/latest/download/{asset}` redirect is a stable, built-in mechanism that always resolves to the latest non-prerelease release — exactly what FR-006 requires.

**Installer flow**:
1. Fetch `https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts`
2. Follow redirects (GitHub returns 302 to the versioned asset URL)
3. Extract the resolved version from the redirect URL
4. Write content to `.opencode/plugins/opencopilot.ts`
5. Report success with version number (FR-011)

**Alternatives considered**:
- Fetch from npm tarball: Requires parsing `npm pack` output or using npm registry API. More complex, slower. Rejected — GitHub Releases is specified as the canonical source in the spec's Assumptions section.
- Embed the plugin file in the npm package itself and copy from `node_modules`: Works for `npx` since npm downloads the package first, but creates a coupling between the npm package contents and the installed file. Also means the installed file is the version from the npm tarball, not necessarily the "latest" if the user runs from a cached package. Viable as a secondary strategy (see Decision 4b).

**Decision 4b (optimization)**: The installer SHOULD first attempt to use the **locally available copy** from the npm package itself (i.e., the bundled `dist/opencopilot.ts` in the installed package), falling back to the GitHub Releases URL. This makes `npx opencopilot install` work offline (from cache) and faster, satisfying FR-008 (<10 seconds). If the local copy strategy is used, the version is read from `package.json`.

---

## Decision 5: GitHub Actions Release Workflow

**Decision**: Implement a single workflow file `.github/workflows/release.yml` triggered by **tag push** `v*.*.*`. The workflow:

1. **Trigger**: `on: push: tags: ['v*.*.*']`
2. **CI gate**: Run `bun test` before publishing (quality gate)
3. **Build**: Run bundle script to produce `dist/opencopilot.ts`
4. **GitHub Release**: Create a GitHub Release with the tag, attach `dist/opencopilot.ts` as a release asset
5. **npm publish**: Run `npm publish` with `--access public` using `NPM_TOKEN` secret

**Why tag-triggered (not `release: [published]`)**:
- Tag push is the standard CI/CD trigger for libraries: create the tag → CI produces the artifacts and creates the release
- The `release: [published]` event requires manually creating the GitHub Release first, then re-running CI — adds friction
- Tag push workflow is idempotent and scriptable

**Tag creation flow** (developer steps):
```bash
npm version patch   # bumps version in package.json, creates git tag
git push --follow-tags
```

**Required secrets**: `NPM_TOKEN` (npm automation token with publish permissions)

**Alternatives considered**:
- `release: [published]` trigger: Requires manual GitHub Release creation before CI runs. Rejected — more steps than tag push.
- `workflow_dispatch` only: Manual trigger — no automation. Rejected as primary trigger (can be added as supplementary).

---

## Decision 6: `npx` Compatibility and Node.js Version

**Decision**: The installer script (`bin/install.js`) MUST be compatible with **Node.js 18+** (LTS). It MUST NOT use Node.js-specific APIs that are unavailable in Node 18, and MUST NOT use TypeScript syntax. 

The installer uses:
- `node:fs/promises` — `mkdir`, `writeFile`, `readFile`, `lstat`
- `node:path` — `join`, `dirname`
- `node:process` — `process.cwd()`, `process.argv`, `process.exit()`
- `node:readline` — for the overwrite prompt (FR-002)
- Global `fetch` — available in Node 18+ (no `node-fetch` dependency needed)

**No external dependencies** for the installer. The installer is a zero-dependency Node.js script.

---

## Decision 7: Version Tracking in Installed File

**Decision**: The bundled `dist/opencopilot.ts` MUST include the version as a comment banner at the top of the file:

```typescript
// opencopilot v1.0.0
// https://github.com/{owner}/{repo}
```

This enables the installer to report the installed version (FR-011) by reading the version from the fetched content's header comment. The banner is injected at bundle time via Bun's `banner` option or a post-processing step.

**Alternatives considered**:
- Separate version manifest file: Extra HTTP request. Rejected — the redirect URL already encodes the version (e.g., `/releases/download/v1.0.0/opencopilot.ts`).
- Read version from redirect URL: Requires inspecting the redirect chain from `fetch`. Cleaner — this is the primary mechanism. The banner is supplementary.

---

## Decision 8: OpenCode Plugin Dependency Handling

**Decision**: The bundled `opencopilot.ts` marks `@opencode-ai/plugin` and `js-yaml` as **external** in the bundle. OpenCode's plugin loader runs `bun install` in the plugin directory's `package.json` context, so these dependencies are available. However, to ensure the self-contained requirement (FR-004), the installer also creates a minimal `.opencode/plugins/package.json` if one does not exist, listing these dependencies.

**Wait — check actual OpenCode behavior**: From the docs: "Local plugins and custom tools can use external npm packages. Add a `package.json` to your config directory with the dependencies you need. OpenCode runs `bun install` at startup to install these."

The `package.json` is in `.opencode/` (the config directory), NOT in `.opencode/plugins/`. The current repo has `.opencode/plugins/opencopilot.ts` that imports from `../../src/` — these are dev-time imports, not what's distributed.

**Revised Decision**: The bundled artifact should inline all `src/` code (scanner, mapper, parser, glob-matcher, types) but keep `@opencode-ai/plugin` and `js-yaml` as externals. The user must have a `.opencode/package.json` listing these deps. The installer SHOULD create/update `.opencode/package.json` to add the required dependencies, then OpenCode's startup `bun install` handles the rest.

This is FR-004 compliant: no build steps required after the file is placed, but a one-time `bun install` (handled automatically by OpenCode) is expected for external deps.
