/**
 * Unit tests for KNOWN_MODELS and normalizeModel()
 * Tests: T031/T032 (US4) — mapper-models.test.ts
 */

import { describe, it, expect } from "bun:test"
import { KNOWN_MODELS, normalizeModel } from "../../src/mapper.ts"

describe("KNOWN_MODELS map", () => {
  it("contains all required OpenAI models (T028)", () => {
    expect(KNOWN_MODELS["gpt-4o"]).toBe("openai/gpt-4o")
    expect(KNOWN_MODELS["gpt-4o-mini"]).toBe("openai/gpt-4o-mini")
    expect(KNOWN_MODELS["gpt-4"]).toBe("openai/gpt-4")
    expect(KNOWN_MODELS["gpt-4-turbo"]).toBe("openai/gpt-4-turbo")
    expect(KNOWN_MODELS["gpt-4.1"]).toBe("openai/gpt-4.1")
    expect(KNOWN_MODELS["gpt-4.1-mini"]).toBe("openai/gpt-4.1-mini")
    expect(KNOWN_MODELS["gpt-4.1-nano"]).toBe("openai/gpt-4.1-nano")
    expect(KNOWN_MODELS["o1"]).toBe("openai/o1")
    expect(KNOWN_MODELS["o1-mini"]).toBe("openai/o1-mini")
    expect(KNOWN_MODELS["o1-pro"]).toBe("openai/o1-pro")
    expect(KNOWN_MODELS["o3"]).toBe("openai/o3")
    expect(KNOWN_MODELS["o3-mini"]).toBe("openai/o3-mini")
  })

  it("contains all required Anthropic models (T028)", () => {
    expect(KNOWN_MODELS["claude-3.5-sonnet"]).toBe("anthropic/claude-3-5-sonnet-20241022")
    expect(KNOWN_MODELS["claude-3-5-sonnet"]).toBe("anthropic/claude-3-5-sonnet-20241022")
    expect(KNOWN_MODELS["claude-3.5-haiku"]).toBe("anthropic/claude-3-5-haiku-20241022")
    expect(KNOWN_MODELS["claude-3-5-haiku"]).toBe("anthropic/claude-3-5-haiku-20241022")
    expect(KNOWN_MODELS["claude-sonnet-4"]).toBe("anthropic/claude-sonnet-4-20250514")
    expect(KNOWN_MODELS["claude-opus-4"]).toBe("anthropic/claude-opus-4-20250514")
  })

  it("contains all required Google models (T028)", () => {
    expect(KNOWN_MODELS["gemini-1.5-flash"]).toBe("google/gemini-1.5-flash")
    expect(KNOWN_MODELS["gemini-1.5-pro"]).toBe("google/gemini-1.5-pro")
    expect(KNOWN_MODELS["gemini-2.0-flash"]).toBe("google/gemini-2.0-flash")
    expect(KNOWN_MODELS["gemini-2.5-pro"]).toBe("google/gemini-2.5-pro")
  })

  it("contains llama and mistral models (T028)", () => {
    expect(KNOWN_MODELS["llama-3.1-405b"]).toBe("groq/llama-3.1-405b-versatile")
    expect(KNOWN_MODELS["mistral-large"]).toBe("mistral/mistral-large-latest")
  })

  it("has more than 20 entries", () => {
    expect(Object.keys(KNOWN_MODELS).length).toBeGreaterThanOrEqual(20)
  })
})

describe("normalizeModel() - exact matches", () => {
  it("normalizes gpt-4o to openai/gpt-4o", () => {
    expect(normalizeModel("gpt-4o")).toBe("openai/gpt-4o")
  })

  it("normalizes gpt-4.1 to openai/gpt-4.1", () => {
    expect(normalizeModel("gpt-4.1")).toBe("openai/gpt-4.1")
  })

  it("normalizes gpt-4.1-mini to openai/gpt-4.1-mini", () => {
    expect(normalizeModel("gpt-4.1-mini")).toBe("openai/gpt-4.1-mini")
  })

  it("normalizes gpt-4.1-nano to openai/gpt-4.1-nano", () => {
    expect(normalizeModel("gpt-4.1-nano")).toBe("openai/gpt-4.1-nano")
  })

  it("normalizes o1 to openai/o1", () => {
    expect(normalizeModel("o1")).toBe("openai/o1")
  })

  it("normalizes o1-pro to openai/o1-pro", () => {
    expect(normalizeModel("o1-pro")).toBe("openai/o1-pro")
  })

  it("normalizes o3 to openai/o3", () => {
    expect(normalizeModel("o3")).toBe("openai/o3")
  })

  it("normalizes o3-mini to openai/o3-mini", () => {
    expect(normalizeModel("o3-mini")).toBe("openai/o3-mini")
  })

  it("normalizes claude-sonnet-4 to anthropic/claude-sonnet-4-20250514", () => {
    expect(normalizeModel("claude-sonnet-4")).toBe("anthropic/claude-sonnet-4-20250514")
  })

  it("normalizes claude-opus-4 to anthropic/claude-opus-4-20250514", () => {
    expect(normalizeModel("claude-opus-4")).toBe("anthropic/claude-opus-4-20250514")
  })

  it("normalizes gemini-1.5-flash to google/gemini-1.5-flash", () => {
    expect(normalizeModel("gemini-1.5-flash")).toBe("google/gemini-1.5-flash")
  })

  it("normalizes gemini-2.5-pro to google/gemini-2.5-pro", () => {
    expect(normalizeModel("gemini-2.5-pro")).toBe("google/gemini-2.5-pro")
  })

  it("normalizes llama-3.1-405b to groq/llama-3.1-405b-versatile", () => {
    expect(normalizeModel("llama-3.1-405b")).toBe("groq/llama-3.1-405b-versatile")
  })

  it("normalizes mistral-large to mistral/mistral-large-latest", () => {
    expect(normalizeModel("mistral-large")).toBe("mistral/mistral-large-latest")
  })
})

describe("normalizeModel() - already has provider prefix", () => {
  it("returns models that already contain '/' as-is", () => {
    expect(normalizeModel("openai/gpt-4")).toBe("openai/gpt-4")
    expect(normalizeModel("anthropic/claude-sonnet-4-20250514")).toBe("anthropic/claude-sonnet-4-20250514")
    expect(normalizeModel("custom-provider/custom-model")).toBe("custom-provider/custom-model")
  })
})

describe("normalizeModel() - dot/hyphen normalization", () => {
  it("resolves claude-3.5-sonnet (dot form) to correct mapping", () => {
    expect(normalizeModel("claude-3.5-sonnet")).toBe("anthropic/claude-3-5-sonnet-20241022")
  })

  it("resolves claude-3-5-sonnet (hyphen form) to correct mapping", () => {
    expect(normalizeModel("claude-3-5-sonnet")).toBe("anthropic/claude-3-5-sonnet-20241022")
  })

  it("resolves claude-3.5-haiku (dot form) to correct mapping", () => {
    expect(normalizeModel("claude-3.5-haiku")).toBe("anthropic/claude-3-5-haiku-20241022")
  })

  it("resolves claude-3-5-haiku (hyphen form) to correct mapping", () => {
    expect(normalizeModel("claude-3-5-haiku")).toBe("anthropic/claude-3-5-haiku-20241022")
  })
})

describe("normalizeModel() - case insensitive", () => {
  it("handles uppercase model names", () => {
    expect(normalizeModel("GPT-4O")).toBe("openai/gpt-4o")
  })

  it("handles mixed case model names", () => {
    expect(normalizeModel("Claude-Sonnet-4")).toBe("anthropic/claude-sonnet-4-20250514")
  })
})

describe("normalizeModel() - regex-based fallback for known provider prefixes", () => {
  it("infers openai prefix for unknown gpt- models", () => {
    const result = normalizeModel("gpt-5")
    expect(result).toBe("openai/gpt-5")
  })

  it("infers anthropic prefix for unknown claude- models", () => {
    const result = normalizeModel("claude-future-model")
    expect(result).toBe("anthropic/claude-future-model")
  })

  it("infers google prefix for unknown gemini- models", () => {
    const result = normalizeModel("gemini-3.0-ultra")
    expect(result).toBe("google/gemini-3.0-ultra")
  })

  it("infers groq prefix for unknown llama- models", () => {
    const result = normalizeModel("llama-4-405b")
    expect(result).toBe("groq/llama-4-405b")
  })

  it("infers mistral prefix for unknown mistral- models", () => {
    const result = normalizeModel("mistral-medium")
    expect(result).toBe("mistral/mistral-medium")
  })
})

describe("normalizeModel() - completely unknown models", () => {
  it("returns undefined for completely unknown model names", () => {
    const result = normalizeModel("unknown-model-xyz")
    expect(result).toBeUndefined()
  })

  it("returns undefined for empty-ish model names that match no pattern", () => {
    const result = normalizeModel("some-random-ai")
    expect(result).toBeUndefined()
  })
})
