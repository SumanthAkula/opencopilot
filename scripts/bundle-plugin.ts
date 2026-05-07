#!/usr/bin/env bun
/**
 * Bundle script for opencopilot plugin distribution.
 *
 * Produces dist/opencopilot.ts — a self-contained, single-file TypeScript
 * artifact with all src/ code inlined and @opencode-ai/plugin + js-yaml
 * kept as externals (provided at runtime by OpenCode's bun install).
 *
 * Usage: bun run scripts/bundle-plugin.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

// Read version from package.json
const pkgPath = join(import.meta.dir, "..", "package.json")
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string; name: string }
const version = pkg.version

const REPO_URL = "https://github.com/anomalyco/opencode-plugins"
const ENTRYPOINT = join(import.meta.dir, "..", ".opencode", "plugins", "opencopilot.ts")
const OUTFILE = join(import.meta.dir, "..", "dist", "opencopilot.ts")
const OUTDIR = join(import.meta.dir, "..", "dist")

// Ensure dist/ directory exists
mkdirSync(OUTDIR, { recursive: true })

console.log(`Bundling opencopilot v${version}...`)
console.log(`  Entrypoint: ${ENTRYPOINT}`)
console.log(`  Output:     ${OUTFILE}`)

const result = await Bun.build({
  entrypoints: [ENTRYPOINT],
  outdir: OUTDIR,
  target: "bun",
  external: ["@opencode-ai/plugin", "js-yaml"],
  minify: false,
  naming: "opencopilot.ts",
})

if (!result.success) {
  console.error("Bundle failed:")
  for (const log of result.logs) {
    console.error(" ", log)
  }
  process.exit(1)
}

// Read the generated output and prepend the version banner
const bundledContent = readFileSync(OUTFILE, "utf8")

const banner = `// opencopilot v${version}\n// ${REPO_URL}\n`

// Only prepend banner if it's not already there (idempotent)
const finalContent = bundledContent.startsWith("// opencopilot v")
  ? bundledContent
  : banner + bundledContent

writeFileSync(OUTFILE, finalContent, "utf8")

console.log(`✓ Bundle complete: dist/opencopilot.ts (${Math.round(finalContent.length / 1024)}KB)`)
