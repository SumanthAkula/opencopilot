# Data Model: Plugin Distribution

**Feature**: 002-plugin-distribution  
**Date**: 2026-05-03

---

## Entities

### InstallerConfig

Runtime configuration assembled from CLI arguments. Not persisted; exists only during installer execution.

| Field | Type | Required | Notes |
|---|---|---|---|
| `force` | `boolean` | Yes | `true` when `--force` flag is present |
| `targetDir` | `string` | Yes | Resolved absolute path to the project root (defaults to `process.cwd()`) |
| `pluginDir` | `string` | Yes | Derived: `path.join(targetDir, '.opencode', 'plugins')` |
| `pluginPath` | `string` | Yes | Derived: `path.join(pluginDir, 'opencopilot.ts')` |
| `sourceUrl` | `string` | Yes | GitHub Releases latest asset URL |
| `subcommand` | `'install'` | Yes | Parsed from `process.argv`; only `'install'` is valid in v1 |

---

### InstallResult

The outcome of an install attempt. Determines the exit code and success/error message.

| Field | Type | Notes |
|---|---|---|
| `success` | `boolean` | Whether the file was written successfully |
| `filePath` | `string \| null` | Absolute path written, or null on failure |
| `version` | `string \| null` | Semver string extracted from release URL (e.g. `"1.0.0"`) |
| `skipped` | `boolean` | `true` if user declined overwrite prompt |
| `errorMessage` | `string \| null` | Human-readable error; null on success |
| `fallbackUrl` | `string \| null` | Direct download URL shown when distribution channel fails |

---

### ReleaseAsset

Shape of the GitHub Releases asset metadata inferred from the redirect URL. Not fetched explicitly — extracted from the redirect chain resolved by `fetch`.

| Field | Type | Notes |
|---|---|---|
| `version` | `string` | Semver string parsed from redirect URL path segment `v{version}` |
| `downloadUrl` | `string` | Final resolved URL after redirect (e.g., `https://github.com/.../download/v1.0.0/opencopilot.ts`) |
| `content` | `string` | Raw text content of the `.ts` file fetched from the asset URL |

---

### BundleConfig

Configuration for the build script (`scripts/bundle-plugin.ts`). Defines how `dist/opencopilot.ts` is produced.

| Field | Type | Notes |
|---|---|---|
| `entrypoint` | `string` | `'.opencode/plugins/opencopilot.ts'` |
| `outfile` | `string` | `'dist/opencopilot.ts'` |
| `target` | `'bun'` | Bun runtime target |
| `external` | `string[]` | `['@opencode-ai/plugin', 'js-yaml']` — kept as runtime deps |
| `banner` | `string` | Version comment: `// opencopilot v{version}\n// https://github.com/{owner}/{repo}` |
| `minify` | `boolean` | `false` in v1 (readable output preferred for inspectability) |

---

## State Transitions

### Installer Flow

```
START
  │
  ▼
Parse argv → InstallerConfig
  │
  ▼
Validate subcommand == 'install'
  │  (error → print usage, exit 1)
  ▼
Stat target path (.opencode/plugins/opencopilot.ts)
  │
  ├─── Does NOT exist ──────────────────────────────────────▶ Fetch from GitHub Releases
  │                                                                  │
  ├─── EXISTS as symlink ────── Warn user ──── exit 1               │
  │                                                                  │
  ├─── EXISTS as regular file                                        │
  │       │                                                          │
  │       ├── --force ─────────────────────────────────────────────▶│
  │       │                                                          │
  │       └── no --force ── Prompt user ──┬── 'yes' ───────────────▶│
  │                                       │                          │
  │                                       └── 'no' ── skip, exit 0  │
  │                                                                  ▼
  │                                                        Fetch content + resolve version
  │                                                                  │
  │                                                         (network error → print error
  │                                                          + fallback URL, exit 1)
  │                                                                  │
  │                                                                  ▼
  │                                                        mkdir -p .opencode/plugins/
  │                                                                  │
  │                                                                  ▼
  │                                                        Write opencopilot.ts
  │                                                                  │
  │                                                                  ▼
  │                                                        Ensure .opencode/package.json
  │                                                        has @opencode-ai/plugin + js-yaml
  │                                                                  │
  │                                                                  ▼
  └──────────────────────────────────────────────────── Print success + version, exit 0
```

---

## Validation Rules

| Rule | Description |
|---|---|
| VR-001 | `subcommand` must be `'install'`; any other value triggers usage help + exit 1 |
| VR-002 | If target path is a symlink, installer MUST warn and exit 1 (never overwrite a symlink silently) |
| VR-003 | If target path exists and is a regular file and `--force` is absent, prompt required |
| VR-004 | Version parsed from release URL must match semver pattern `v?(\d+\.\d+\.\d+)` |
| VR-005 | Fetched content must be non-empty; empty response treated as network error |
| VR-006 | Exit code MUST be `0` on success/skip and `1` on all error conditions |
