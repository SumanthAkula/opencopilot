# Contract: npm Package Metadata

**Component**: `package.json` published to npm registry  
**Feature**: 002-plugin-distribution

---

## Required package.json Fields

The following fields MUST be present in `package.json` before `npm publish` is run:

```json
{
  "name": "opencopilot",
  "version": "{semver}",
  "description": "OpenCode plugin that adapts .github/copilot/ customizations to work natively in OpenCode",
  "keywords": ["opencode", "copilot", "github-copilot", "plugin", "ai", "opencode-plugin"],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/{owner}/{repo}.git"
  },
  "homepage": "https://github.com/{owner}/{repo}#readme",
  "bugs": {
    "url": "https://github.com/{owner}/{repo}/issues"
  },
  "type": "module",
  "bin": {
    "opencopilot": "bin/install.js"
  },
  "files": [
    "bin/",
    "dist/",
    "README.md",
    "LICENSE"
  ],
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### Field constraints

| Field | Requirement |
|---|---|
| `name` | MUST be `"opencopilot"` (FR-007) |
| `version` | MUST follow semver (no pre-release suffix for stable releases) |
| `description` | MUST be ≤160 chars for npm search display |
| `keywords` | MUST include `"opencode"` and `"copilot"` for discoverability (FR-007/SC-005) |
| `bin.opencopilot` | MUST point to `bin/install.js`; enables `npx opencopilot install` |
| `files` | MUST include `bin/`, `dist/`, `README.md`, `LICENSE`; MUST exclude `src/`, `specs/`, `.specify/`, `tests/` |
| `engines.node` | MUST be `>=18.0.0` (installer uses native `fetch`) |
| `main` / `module` | NOT required (package is a CLI tool + plugin artifact, not a library) |

---

## Published Files

The npm package tarball MUST contain:

```
opencopilot/
├── bin/
│   └── install.js        ← CLI installer script
├── dist/
│   └── opencopilot.ts    ← Bundled, self-contained plugin file
├── README.md             ← Updated with npx install UX
└── LICENSE
```

The npm package tarball MUST NOT contain:
- `src/` — source files (not needed at runtime)
- `specs/` — specification documents
- `.specify/` — speckit workflow files
- `tests/` — test files
- `.opencode/plugins/opencopilot.ts` — the raw (unbundled) plugin entry point

---

## `bin/install.js` File Contract

The file MUST:
1. Start with `#!/usr/bin/env node` shebang
2. Be executable (`chmod +x`)
3. Be valid ES module syntax (`"type": "module"` in `package.json`)
4. Have zero external npm dependencies (only Node.js built-ins)
5. Be compatible with Node.js 18+

---

## `.npmignore` or `files` field

The `files` field in `package.json` is the preferred mechanism (over `.npmignore`) to control what is published. Using `files` is explicit and declarative — it whitelists rather than blacklists.

---

## Pre-publish Checks (enforced by CI)

Before `npm publish`, the workflow MUST verify:

1. `package.json` version matches the git tag (e.g., tag `v1.2.3` → version `1.2.3`)
2. `dist/opencopilot.ts` exists and is non-empty
3. `bun test` passes
4. `tsc --noEmit` passes (type check)
