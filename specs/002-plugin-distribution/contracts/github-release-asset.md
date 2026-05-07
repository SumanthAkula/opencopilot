# Contract: GitHub Release Asset

**Component**: Release artifact served via GitHub Releases  
**Feature**: 002-plugin-distribution

---

## Asset Specification

### File name

```
opencopilot.ts
```

The release asset is named `opencopilot.ts`. This name is permanent for all v1 releases.

### URL patterns

| Type | Pattern | Example |
|---|---|---|
| Versioned | `https://github.com/{owner}/{repo}/releases/download/v{semver}/opencopilot.ts` | `.../download/v1.2.3/opencopilot.ts` |
| Latest alias | `https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts` | Redirects to latest versioned URL |

The "latest" URL uses GitHub Releases' built-in `/releases/latest/download/{asset}` redirect mechanism. No custom redirect service is required.

### Content contract

The file MUST:

1. Begin with a version banner comment:
   ```typescript
   // opencopilot v{semver}
   // https://github.com/{owner}/{repo}
   ```

2. Be a valid JavaScript/TypeScript ESM module that Bun can execute directly.

3. Export a `default` named `OpenCopilotPlugin` of type `Plugin` from `@opencode-ai/plugin`.

4. Have all `src/` module code inlined (no relative imports to `../../src/`).

5. Import only from packages that are available as external dependencies:
   - `@opencode-ai/plugin`
   - `js-yaml`
   - Node.js built-in modules (`node:fs/promises`, `node:path`, etc.)

6. Be a single file. No companion files or multi-part archives.

### Size constraints

- Expected file size: **50–300 KB** (minification off in v1; TypeScript source with inlined deps)
- MUST complete download in under 10 seconds on a 1 Mbps connection (FR-008)

### Stability guarantee

- A versioned URL (e.g., `v1.2.3`) MUST return the exact same file content for the lifetime of the release (minimum 2 years, per SC-004)
- The "latest" alias MUST redirect to the most recently published non-prerelease release

---

## Release Tag Convention

| Field | Format | Example |
|---|---|---|
| Git tag | `v{semver}` | `v1.0.0`, `v1.2.3` |
| npm version | `{semver}` (no `v` prefix) | `1.0.0`, `1.2.3` |
| Release title | `v{semver}` | `v1.0.0` |

---

## `.opencode/package.json` Contract

The installer MUST ensure `.opencode/package.json` declares the plugin's runtime dependencies. If the file does not exist, it is created with:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "js-yaml": "^4.1.0"
  }
}
```

If the file already exists, the installer MUST merge in missing dependency keys without removing existing entries. The installer MUST NOT overwrite user-added entries.
