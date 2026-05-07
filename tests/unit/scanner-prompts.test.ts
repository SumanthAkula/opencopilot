/**
 * Unit tests for scanPromptFiles()
 * Tests: T016 (US1) — scanner-prompts.test.ts
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { scanPromptFiles } from "../../src/scanner.ts"
import type { CopilotPromptFile } from "../../src/types.ts"

const FIXTURE_GITHUB = path.resolve(import.meta.dir, "../fixtures/sample-github")

describe("scanPromptFiles()", () => {
  let prompts: CopilotPromptFile[]

  beforeAll(async () => {
    prompts = await scanPromptFiles(FIXTURE_GITHUB)
  })

  it("returns an array", () => {
    expect(Array.isArray(prompts)).toBe(true)
  })

  it("finds .prompt.md files in .github/prompts/", () => {
    // Should find code-review, assistant-mode, no-frontmatter (not empty)
    const filenames = prompts.map((p) => path.basename(p.filePath))
    expect(filenames).toContain("code-review.prompt.md")
    expect(filenames).toContain("assistant-mode.prompt.md")
    expect(filenames).toContain("no-frontmatter.prompt.md")
  })

  it("skips empty prompt files", () => {
    const filenames = prompts.map((p) => path.basename(p.filePath))
    expect(filenames).not.toContain("empty.prompt.md")
  })

  it("parses frontmatter mode: instruction correctly", () => {
    const reviewPrompt = prompts.find((p) => path.basename(p.filePath) === "code-review.prompt.md")
    expect(reviewPrompt).toBeDefined()
    expect(reviewPrompt!.mode).toBe("instruction")
  })

  it("parses frontmatter mode: assistant correctly", () => {
    const assistantPrompt = prompts.find((p) => path.basename(p.filePath) === "assistant-mode.prompt.md")
    expect(assistantPrompt).toBeDefined()
    expect(assistantPrompt!.mode).toBe("assistant")
  })

  it("parses description from frontmatter", () => {
    const reviewPrompt = prompts.find((p) => path.basename(p.filePath) === "code-review.prompt.md")
    expect(reviewPrompt!.description).toBe("Code review checklist for security vulnerabilities")
  })

  it("handles missing mode field (returns null when not in frontmatter)", () => {
    const noFrontmatter = prompts.find((p) => path.basename(p.filePath) === "no-frontmatter.prompt.md")
    expect(noFrontmatter).toBeDefined()
    expect(noFrontmatter!.mode).toBeNull()
  })

  it("preserves content body", () => {
    const reviewPrompt = prompts.find((p) => path.basename(p.filePath) === "code-review.prompt.md")
    expect(reviewPrompt!.content).toContain("Review all PR changes")
    expect(reviewPrompt!.content).toContain("SQL injection")
  })

  it("includes lastModified timestamp", () => {
    const reviewPrompt = prompts.find((p) => path.basename(p.filePath) === "code-review.prompt.md")
    expect(typeof reviewPrompt!.lastModified).toBe("number")
    expect(reviewPrompt!.lastModified).toBeGreaterThan(0)
  })

  it("includes absolute filePath for all results", () => {
    for (const prompt of prompts) {
      expect(path.isAbsolute(prompt.filePath)).toBe(true)
    }
  })
})

describe("scanPromptFiles() - edge cases", () => {
  it("returns empty array when .github/prompts directory does not exist", async () => {
    const result = await scanPromptFiles("/nonexistent/path/.github")
    expect(result).toEqual([])
  })

  it("returns empty array when prompts subdir is missing", async () => {
    // Use a temp dir with no prompts subdir
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    try {
      const result = await scanPromptFiles(tmpDir)
      expect(result).toEqual([])
    } finally {
      await rm(tmpDir, { recursive: true })
    }
  })

  it("handles invalid frontmatter gracefully without throwing", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    const promptsDir = path.join(tmpDir, "prompts")
    await mkdir(promptsDir)
    await writeFile(
      path.join(promptsDir, "invalid.prompt.md"),
      "---\ninvalid: yaml: [\n---\nSome content here",
    )

    let threw = false
    try {
      await scanPromptFiles(tmpDir)
    } catch {
      threw = true
    }
    await rm(tmpDir, { recursive: true })
    expect(threw).toBe(false)
  })

  it("skips empty prompt files (only whitespace after frontmatter)", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    const promptsDir = path.join(tmpDir, "prompts")
    await mkdir(promptsDir)
    await writeFile(
      path.join(promptsDir, "whitespace.prompt.md"),
      "---\nmode: instruction\n---\n\n   \n",
    )

    const result = await scanPromptFiles(tmpDir)
    await rm(tmpDir, { recursive: true })
    expect(result).toEqual([])
  })

  it("defaults mode to instruction (not null) for known-but-wrong mode", async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-test-"))
    const promptsDir = path.join(tmpDir, "prompts")
    await mkdir(promptsDir)
    await writeFile(
      path.join(promptsDir, "unknown-mode.prompt.md"),
      "---\nmode: unknown-mode\n---\nContent here",
    )

    const result = await scanPromptFiles(tmpDir)
    await rm(tmpDir, { recursive: true })
    expect(result).toHaveLength(1)
    // Unknown mode should default to "instruction"
    expect(result[0].mode).toBe("instruction")
  })
})
