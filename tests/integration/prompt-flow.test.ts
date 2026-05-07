/**
 * Integration test for prompt file end-to-end flow
 * Tests: T033 (Phase 7) — prompt-flow.test.ts
 *
 * Scenario: Create .github/prompts/test.prompt.md → scanGithubDir → verify content in cache.prompts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { scanGithubDir } from "../../src/scanner.ts"
import { mapPromptToInstruction } from "../../src/mapper.ts"

describe("Prompt file end-to-end flow", () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-prompt-e2e-"))
    const promptsDir = path.join(tmpDir, "prompts")
    await mkdir(promptsDir)

    await writeFile(
      path.join(promptsDir, "coding-standards.prompt.md"),
      [
        "---",
        "mode: instruction",
        "description: Coding standards and best practices",
        "---",
        "",
        "Always use TypeScript strict mode.",
        "Prefer `const` over `let`.",
        "Use meaningful variable names.",
      ].join("\n"),
    )

    await writeFile(
      path.join(promptsDir, "test-helper.prompt.md"),
      [
        "---",
        "mode: assistant",
        "description: Test writing helper",
        "---",
        "",
        "When writing tests, use descriptive test names.",
        "Follow the AAA pattern: Arrange, Act, Assert.",
      ].join("\n"),
    )
  })

  afterAll(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it("scanGithubDir includes prompt files in cache", async () => {
    const cache = await scanGithubDir(tmpDir)
    expect(cache.initialized).toBe(true)
    expect(cache.prompts).toHaveLength(2)
  })

  it("prompt files have correct filePath", async () => {
    const cache = await scanGithubDir(tmpDir)
    const filenames = cache.prompts.map((p) => path.basename(p.filePath))
    expect(filenames).toContain("coding-standards.prompt.md")
    expect(filenames).toContain("test-helper.prompt.md")
  })

  it("prompt content is injected correctly via mapPromptToInstruction", async () => {
    const cache = await scanGithubDir(tmpDir)
    const codingStandards = cache.prompts.find(
      (p) => path.basename(p.filePath) === "coding-standards.prompt.md",
    )
    expect(codingStandards).toBeDefined()

    const injected = mapPromptToInstruction(codingStandards!, tmpDir)
    expect(injected).toContain("Always use TypeScript strict mode.")
    expect(injected).toContain("Prefer `const` over `let`.")
  })

  it("instruction-mode and assistant-mode prompts are both injected globally", async () => {
    const cache = await scanGithubDir(tmpDir)
    const injected = cache.prompts.map((p) => mapPromptToInstruction(p, tmpDir))

    // Both should have content (global injection, no applyTo filtering needed)
    expect(injected.length).toBe(2)
    expect(injected.every((s) => s.length > 0)).toBe(true)
  })

  it("emptyCache has prompts initialized to empty array", () => {
    const { emptyCache } = require("../../src/types.ts")
    const cache = emptyCache()
    expect(Array.isArray(cache.prompts)).toBe(true)
    expect(cache.prompts).toHaveLength(0)
  })
})
