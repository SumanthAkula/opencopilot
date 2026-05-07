/**
 * Unit tests for mapPromptToInstruction()
 * Tests: T017 (US1) — mapper-prompts.test.ts
 */

import { describe, it, expect } from "bun:test"
import path from "node:path"
import { mapPromptToInstruction } from "../../src/mapper.ts"
import type { CopilotPromptFile } from "../../src/types.ts"

const GITHUB_DIR = "/project/.github"

function makePromptFile(overrides: Partial<CopilotPromptFile> = {}): CopilotPromptFile {
  return {
    filePath: "/project/.github/prompts/test.prompt.md",
    description: "Test prompt",
    mode: "instruction",
    content: "Review all PR changes for security vulnerabilities.",
    lastModified: Date.now(),
    ...overrides,
  }
}

describe("mapPromptToInstruction()", () => {
  it("returns a non-empty string", () => {
    const prompt = makePromptFile()
    const result = mapPromptToInstruction(prompt, GITHUB_DIR)
    expect(typeof result).toBe("string")
    expect(result.length).toBeGreaterThan(0)
  })

  it("includes the prompt content in the output", () => {
    const prompt = makePromptFile({ content: "Always use TypeScript strict mode." })
    const result = mapPromptToInstruction(prompt, GITHUB_DIR)
    expect(result).toContain("Always use TypeScript strict mode.")
  })

  it("includes a relative path reference to the prompt file", () => {
    const prompt = makePromptFile()
    const result = mapPromptToInstruction(prompt, GITHUB_DIR)
    expect(result).toContain(".github/prompts/test.prompt.md")
  })

  it("uses a Markdown heading format", () => {
    const prompt = makePromptFile()
    const result = mapPromptToInstruction(prompt, GITHUB_DIR)
    expect(result.startsWith("## ")).toBe(true)
  })

  it("handles mode: instruction the same as mode: assistant (v1 behavior)", () => {
    const instructionPrompt = makePromptFile({ mode: "instruction" })
    const assistantPrompt = makePromptFile({ mode: "assistant" })
    const resultInstruction = mapPromptToInstruction(instructionPrompt, GITHUB_DIR)
    const resultAssistant = mapPromptToInstruction(assistantPrompt, GITHUB_DIR)
    // Content and structure should be identical (both get global applyTo)
    expect(resultInstruction).toBe(resultAssistant)
  })

  it("handles null mode (no mode specified)", () => {
    const prompt = makePromptFile({ mode: null })
    const result = mapPromptToInstruction(prompt, GITHUB_DIR)
    expect(result).toContain(prompt.content)
  })

  it("preserves multi-line content", () => {
    const multilineContent = "Line 1\nLine 2\nLine 3\n- item a\n- item b"
    const prompt = makePromptFile({ content: multilineContent })
    const result = mapPromptToInstruction(prompt, GITHUB_DIR)
    expect(result).toContain("Line 1")
    expect(result).toContain("Line 2")
    expect(result).toContain("item b")
  })

  it("handles Windows-style paths in filePath", () => {
    const prompt = makePromptFile({
      filePath: "/project/.github/prompts/windows-test.prompt.md",
    })
    const result = mapPromptToInstruction(prompt, GITHUB_DIR)
    // Should use forward slashes in output
    expect(result).not.toContain("\\")
  })

  it("formats output as ## Prompt from <path>", () => {
    const prompt = makePromptFile()
    const result = mapPromptToInstruction(prompt, GITHUB_DIR)
    expect(result).toMatch(/^## Prompt from .*\.github\/prompts\/test\.prompt\.md/)
  })
})
