# Contract: CLI Interface

**Component**: `bin/install.js` — the `npx opencopilot` installer binary  
**Feature**: 002-plugin-distribution

---

## Command Schema

### Primary command

```
npx opencopilot install [--force]
```

| Token | Type | Required | Description |
|---|---|---|---|
| `install` | subcommand | Yes | Install the plugin file into the current project |
| `--force` | flag | No | Skip overwrite prompt; silently replace existing file |

### Future subcommands (not in v1 scope)

| Subcommand | Description |
|---|---|
| `update` | Alias for `install --force` (US4) |

---

## Exit Codes

| Code | Condition |
|---|---|
| `0` | Success: file installed, OR user chose not to overwrite (skip) |
| `1` | Error: network failure, permission denied, symlink detected, unknown subcommand |

---

## Standard Output

All output goes to **stdout** (informational) or **stderr** (errors). Structured text only — no JSON output in v1.

### Success

```
✓ Installed opencopilot v1.2.3 to .opencode/plugins/opencopilot.ts
```

### Skip (user declined overwrite)

```
Skipped. No changes made.
```

### Overwrite prompt (interactive — only when file exists and --force is absent)

```
opencopilot.ts already exists at .opencode/plugins/opencopilot.ts
Overwrite? [y/N]: _
```

Default answer is **N** (no overwrite). User must explicitly type `y` or `yes` (case-insensitive) to confirm.

### Symlink warning (stderr + exit 1)

```
Error: .opencode/plugins/opencopilot.ts is a symlink. Remove or replace it manually before installing.
Fallback: https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts
```

### Network error (stderr + exit 1)

```
Error: Failed to fetch opencopilot from GitHub Releases: <reason>
Fallback: https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts
```

### Unknown subcommand (stderr + exit 1)

```
Error: Unknown subcommand '<subcommand>'.

Usage:
  npx opencopilot install [--force]    Install the plugin into .opencode/plugins/

```

---

## Environment Behavior

| Scenario | Behavior |
|---|---|
| Non-interactive TTY (piped/scripted) | Overwrite prompt defaults to "N" (no overwrite); `--force` required for automation |
| No network access | Network error with fallback URL |
| `.opencode/plugins/` does not exist | Directory created automatically (`mkdir -p`) |
| `.opencode/package.json` does not exist | Created with minimal content including required dependencies |
| `.opencode/package.json` exists | Dependencies merged in (existing keys preserved) |
| Target file is read-only | Permission error with actionable message (chmod suggestion) |

---

## Argument Parsing Rules

- Arguments are parsed from `process.argv.slice(2)`
- `--force` flag may appear before or after the subcommand
- Unknown flags are ignored (no hard error) to allow future extension without breaking old scripts
- `--help` and `-h` print usage and exit 0

---

## Fallback URL Contract

The fallback URL printed on error MUST be the GitHub Releases "latest" direct download URL:

```
https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts
```

This URL MUST be stable and functional independently of the installer, satisfying FR-005/FR-006.
