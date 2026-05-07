/**
 * Tests for dist/opencopilot.ts bundle output.
 *
 * These tests require `bun run bundle` to have been executed first.
 * Run: bun run bundle && bun test tests/installer/bundle.test.ts
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const BUNDLE_PATH = join(import.meta.dir, "..", "..", "dist", "opencopilot.ts")

let bundleContent: string = ""

describe("Bundle output: dist/opencopilot.ts", () => {
  beforeAll(() => {
    if (existsSync(BUNDLE_PATH)) {
      bundleContent = readFileSync(BUNDLE_PATH, "utf8")
    }
  })

  it("1. Bundle file exists and is non-empty", () => {
    expect(existsSync(BUNDLE_PATH)).toBe(true)
    expect(bundleContent.length).toBeGreaterThan(0)
  })

  it("2. First line matches version banner", () => {
    const firstLine = bundleContent.split("\n")[0]
    expect(firstLine).toMatch(/^\/\/ opencopilot v\d+\.\d+\.\d+/)
  })

  it("3. Does NOT contain relative imports (../../src/)", () => {
    expect(bundleContent).not.toContain("../../src/")
  })

  it("4. Contains OpenCopilotPlugin export", () => {
    // The bundle may use 'export default' directly or via named re-export
    const hasExportDefault = bundleContent.includes("export {") || bundleContent.includes("export default")
    const hasOpenCopilotPlugin = bundleContent.includes("OpenCopilotPlugin")
    expect(hasExportDefault).toBe(true)
    expect(hasOpenCopilotPlugin).toBe(true)
  })

  it("5. Only allowed import sources (no unexpected bare specifiers or relative paths)", () => {
    // Extract all import sources from the bundle
    const importMatches = bundleContent.matchAll(/^import\s+.*?\s+from\s+["']([^"']+)["']/gm)
    const allowedPrefixes = ["@opencode-ai/plugin", "js-yaml", "node:"]
    // Also allow Node.js built-ins without node: prefix (path, fs, etc.) since Bun may omit it
    const allowedBuiltins = new Set([
      "path", "fs", "fs/promises", "node:fs", "node:fs/promises", "node:path",
      "os", "url", "http", "https", "crypto", "stream", "events", "util", "buffer",
      "node:os", "node:url", "node:http", "node:https", "node:crypto",
      "node:stream", "node:events", "node:util", "node:buffer",
    ])

    const unexpectedImports: string[] = []

    for (const match of importMatches) {
      const source = match[1]
      const isAllowed =
        allowedBuiltins.has(source) ||
        allowedPrefixes.some((prefix) => source.startsWith(prefix))

      if (!isAllowed) {
        unexpectedImports.push(source)
      }
    }

    expect(unexpectedImports).toEqual([])
  })
})
