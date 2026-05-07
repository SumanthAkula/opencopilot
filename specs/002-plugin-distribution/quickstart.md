# Quickstart: Plugin Distribution

**Feature**: 002-plugin-distribution  
**Date**: 2026-05-03

---

## What This Feature Delivers

After this feature is implemented:

1. **Users install the plugin with one command**: `npx opencopilot install`
2. **A bundled, self-contained `opencopilot.ts`** is placed at `.opencode/plugins/opencopilot.ts`
3. **The plugin is published on npm** under the name `opencopilot`
4. **Every GitHub Release** includes `opencopilot.ts` as a downloadable asset
5. **The README** shows `npx opencopilot install` as the primary install instruction

---

## New Files Created by This Feature

```
bin/
└── install.js               ← CLI installer; entry point for `npx opencopilot install`

dist/
└── opencopilot.ts           ← Bundled self-contained plugin (generated at release time)

scripts/
└── bundle-plugin.ts         ← Build script: bundles .opencode/plugins/opencopilot.ts → dist/

.github/workflows/
└── release.yml              ← GitHub Actions: tag push → bundle → GitHub Release + npm publish
```

---

## Developer Workflow (Releasing a New Version)

```bash
# 1. Ensure tests pass
bun test

# 2. Bump version (updates package.json, creates git tag)
npm version patch   # or: minor, major

# 3. Push the tag — triggers the release workflow
git push --follow-tags
```

The GitHub Actions workflow then:
- Runs `bun test` (quality gate)
- Runs `bun run bundle` to produce `dist/opencopilot.ts`
- Creates a GitHub Release with `dist/opencopilot.ts` attached
- Publishes to npm with `npm publish --access public`

---

## End-User Install Experience (After Feature)

```bash
# Install into current project
npx opencopilot install

# Force-overwrite an existing installation
npx opencopilot install --force

# Direct URL download (no npm/npx needed)
curl -fsSL https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts \
  -o .opencode/plugins/opencopilot.ts
```

---

## Testing the Bundle Locally

```bash
# Build the self-contained plugin file
bun run bundle

# Verify the output
ls -la dist/opencopilot.ts
head -3 dist/opencopilot.ts   # Should show the version banner

# Test the installer locally
node bin/install.js install --force
```

---

## Key Architecture Decisions

| Question | Answer |
|---|---|
| What does OpenCode load? | `.ts` files via Bun runtime — no compilation needed at install time |
| How is the plugin bundled? | `bun build` inlines all `src/` code; `@opencode-ai/plugin` and `js-yaml` stay external |
| How does `npx opencopilot install` work? | `bin/install.js` (Node.js, shebang) fetches from GitHub Releases latest URL |
| Where does the installer fetch from? | `https://github.com/{owner}/{repo}/releases/latest/download/opencopilot.ts` |
| What triggers a new release? | Pushing a `v*.*.*` git tag |
| Does the installer work offline? | Yes — `npx` caches the npm package; the installer copies `dist/opencopilot.ts` from the cached package |
