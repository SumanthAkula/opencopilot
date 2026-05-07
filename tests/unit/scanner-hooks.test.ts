/**
 * Unit tests for scanHookFiles()
 * Tests: T021 (US2) — scanner-hooks.test.ts
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { scanHookFiles } from "../../src/scanner.ts"
import type { CopilotHookDefinition } from "../../src/types.ts"

const FIXTURE_GITHUB = path.resolve(import.meta.dir, "../fixtures/sample-github")

describe("scanHookFiles()", () => {
  let hooks: CopilotHookDefinition[]

  beforeAll(async () => {
    hooks = await scanHookFiles(FIXTURE_GITHUB)
  })

  it("returns an array", () => {
    expect(Array.isArray(hooks)).toBe(true)
  })

  it("finds .json files in .github/hooks/", () => {
    const filenames = hooks.map((h) => path.basename(h.filePath))
    expect(filenames).toContain("onChatStart.json")
    expect(filenames).toContain("onFileSave.json")
    expect(filenames).toContain("onCodeReview.json")
  })

  it("skips invalid JSON files", () => {
    const filenames = hooks.map((h) => path.basename(h.filePath))
    expect(filenames).not.toContain("invalid.json")
  })

  it("skips files with missing event field", () => {
    const filenames = hooks.map((h) => path.basename(h.filePath))
    expect(filenames).not.toContain("missing-event.json")
  })

  it("parses event field correctly", () => {
    const chatStart = hooks.find((h) => path.basename(h.filePath) === "onChatStart.json")
    expect(chatStart).toBeDefined()
    expect(chatStart!.event).toBe("onChatStart")
  })

  it("parses script field when present", () => {
    const chatStart = hooks.find((h) => path.basename(h.filePath) === "onChatStart.json")
    expect(chatStart!.script).toBe("echo 'Chat started'")
  })

  it("returns null for script when not present", () => {
    const fileSave = hooks.find((h) => path.basename(h.filePath) === "onFileSave.json")
    expect(fileSave!.script).toBeNull()
  })

  it("parses description field", () => {
    const chatStart = hooks.find((h) => path.basename(h.filePath) === "onChatStart.json")
    expect(chatStart!.description).toBe("Runs when chat starts")
  })

  it("includes absolute filePath for all results", () => {
    for (const hook of hooks) {
      expect(path.isAbsolute(hook.filePath)).toBe(true)
    }
  })

  it("handles onCodeReview event (logs warning but still returns it)", () => {
    const codeReview = hooks.find((h) => path.basename(h.filePath) === "onCodeReview.json")
    expect(codeReview).toBeDefined()
    expect(codeReview!.event).toBe("onCodeReview")
  })
})

describe("scanHookFiles() - edge cases", () => {
  it("returns empty array when .github/hooks directory does not exist", async () => {
    const result = await scanHookFiles("/nonexistent/path/.github")
    expect(result).toEqual([])
  })

  it("returns empty array when hooks subdir is missing", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    try {
      const result = await scanHookFiles(tmpDir)
      expect(result).toEqual([])
    } finally {
      await rm(tmpDir, { recursive: true })
    }
  })

  it("handles invalid JSON gracefully without throwing", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    const hooksDir = path.join(tmpDir, "hooks")
    await mkdir(hooksDir)
    await writeFile(path.join(hooksDir, "bad.json"), "{ not valid json }")

    let threw = false
    try {
      await scanHookFiles(tmpDir)
    } catch {
      threw = true
    }
    await rm(tmpDir, { recursive: true })
    expect(threw).toBe(false)
  })

  it("skips files with missing event field and does not throw", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    const hooksDir = path.join(tmpDir, "hooks")
    await mkdir(hooksDir)
    await writeFile(path.join(hooksDir, "no-event.json"), JSON.stringify({ script: "echo hello" }))

    const result = await scanHookFiles(tmpDir)
    await rm(tmpDir, { recursive: true })
    expect(result).toEqual([])
  })

  it("handles unknown event names with a warning but still returns the hook", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    const hooksDir = path.join(tmpDir, "hooks")
    await mkdir(hooksDir)
    await writeFile(
      path.join(hooksDir, "unknown.json"),
      JSON.stringify({ event: "onUnknownEvent", description: "Unknown event hook" }),
    )

    const result = await scanHookFiles(tmpDir)
    await rm(tmpDir, { recursive: true })
    expect(result).toHaveLength(1)
    expect(result[0].event).toBe("onUnknownEvent")
  })

  it("ignores non-.json files", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    const hooksDir = path.join(tmpDir, "hooks")
    await mkdir(hooksDir)
    await writeFile(path.join(hooksDir, "onChatStart.md"), "# not a hook")
    await writeFile(path.join(hooksDir, "README.txt"), "readme")
    await writeFile(
      path.join(hooksDir, "valid.json"),
      JSON.stringify({ event: "onChatStart" }),
    )

    const result = await scanHookFiles(tmpDir)
    await rm(tmpDir, { recursive: true })
    expect(result).toHaveLength(1)
    expect(result[0].event).toBe("onChatStart")
  })

  it("handles null script field gracefully", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    const hooksDir = path.join(tmpDir, "hooks")
    await mkdir(hooksDir)
    await writeFile(
      path.join(hooksDir, "no-script.json"),
      JSON.stringify({ event: "onChatStart", script: null }),
    )

    const result = await scanHookFiles(tmpDir)
    await rm(tmpDir, { recursive: true })
    expect(result).toHaveLength(1)
    expect(result[0].script).toBeNull()
  })
})
