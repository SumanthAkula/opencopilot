/**
 * OpenCopilot - Copilot → OpenCode field mapping
 *
 * Functions that convert parsed Copilot entities to their OpenCode equivalents.
 * Implements the mapping tables defined in specs/001-copilot-opencode-adapter/data-model.md
 */

import path from "node:path"
import type { CopilotInstructionFile, CopilotAgentDefinition, CopilotSkill, CopilotPromptFile } from "./types.ts"

/**
 * Local representation of the OpenCode AgentConfig shape.
 * Mirrors the type from @opencode-ai/sdk without importing internal gen files.
 */
export interface AgentConfig {
  description?: string
  mode?: "subagent" | "primary" | "all"
  prompt?: string
  model?: string
  hidden?: boolean
  tools?: Record<string, boolean>
  permission?: Record<string, "allow" | "ask" | "deny" | Record<string, "allow" | "ask" | "deny">>
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Instructions → system prompt section (T010)
// ---------------------------------------------------------------------------

/**
 * Format a CopilotInstructionFile as a Markdown section for injection
 * into the OpenCode system prompt.
 *
 * @param file - The instruction file to format
 * @param githubDir - The .github/ directory path, used to compute relative path
 */
export function buildInstructionSection(
  file: CopilotInstructionFile,
  githubDir: string,
): string {
  const relativePath = path.relative(path.dirname(githubDir), file.filePath)
    .replace(/\\/g, "/")
  return `## Instructions from ${relativePath}\n\n${file.content}`
}

// ---------------------------------------------------------------------------
// Agent definitions → OpenCode AgentConfig (T015)
// ---------------------------------------------------------------------------

/**
 * Copilot tool alias → OpenCode permission key(s)
 * Per the mapping table in data-model.md
 */
const TOOL_ALIAS_MAP: Record<string, string[]> = {
  read: ["read"],
  write: ["edit"],
  edit: ["edit"],
  execute: ["bash"],
  shell: ["bash"],
  bash: ["bash"],
  powershell: ["bash"],
  search: ["glob", "grep"],
  grep: ["grep"],
  glob: ["glob"],
  agent: ["task"],
  task: ["task"],
  web: ["webfetch", "websearch"],
  webfetch: ["webfetch"],
  websearch: ["websearch"],
  todo: ["todowrite"],
}

/**
 * Convert a Copilot tools list to an OpenCode permission object.
 *
 * null  → {} (no restrictions; all tools allowed)
 * []    → { "*": "deny" } via tools map (deny all)
 * [..] → explicit allow for mapped keys, deny rest
 */
export function derivePermissions(
  tools: string[] | null,
): AgentConfig["permission"] {
  if (tools === null) {
    // No restriction specified — let OpenCode defaults apply
    return {}
  }

  if (tools.length === 0) {
    // Empty tools list = deny all
    // OpenCode uses tools: { "*": false } for deny-all in legacy API,
    // but permission doesn't have a wildcard deny. Use tools field instead.
    // We return an empty permission and the caller sets tools.
    return {}
  }

  // Build explicit allow set from Copilot aliases
  const allowed = new Set<string>()
  for (const alias of tools) {
    const mapped = TOOL_ALIAS_MAP[alias.toLowerCase()]
    if (mapped) {
      mapped.forEach((k) => allowed.add(k))
    }
  }

  // Build permission object: allow mapped keys, deny common tools not in list
  const permission: Record<string, "allow" | "deny"> = {}
  const ALL_PERMISSION_KEYS = ["read", "edit", "glob", "grep", "bash", "task", "webfetch", "websearch", "todowrite"]
  for (const key of ALL_PERMISSION_KEYS) {
    permission[key] = allowed.has(key) ? "allow" : "deny"
  }

  // Cast — AgentConfig permission is flexible (index signature allows unknown keys)
  return permission as AgentConfig["permission"]
}

/**
 * Convert a CopilotAgentDefinition to an OpenCode AgentConfig object.
 * Implements the field mapping table in data-model.md.
 *
 * If disableModelInvocation is true, hidden is forced to true regardless
 * of the userInvocable setting (T024).
 */
export function toOpenCodeAgent(def: CopilotAgentDefinition): AgentConfig {
  // disable-model-invocation takes precedence over user-invocable
  const hidden = def.disableModelInvocation ? true : !def.userInvocable

  const config: AgentConfig = {
    description: def.description,
    mode: "subagent",
    prompt: def.systemPrompt || undefined,
    hidden,
  }

  if (def.model) {
    config.model = normalizeModel(def.model)
  }

  if (def.tools === null) {
    // No restriction — no tools or permission field needed
  } else if (def.tools.length === 0) {
    // Deny all tools
    config.tools = { "*": false }
  } else {
    config.permission = derivePermissions(def.tools)
  }

  return config
}

// ---------------------------------------------------------------------------
// Expanded KNOWN_MODELS map (T028)
// ---------------------------------------------------------------------------

/**
 * Known Copilot model names mapped to OpenCode "provider/model-id" format.
 * Exported for testing (T031/T032).
 */
export const KNOWN_MODELS: Record<string, string> = {
  // OpenAI — existing
  "gpt-4o": "openai/gpt-4o",
  "gpt-4o-mini": "openai/gpt-4o-mini",
  "gpt-4": "openai/gpt-4",
  "gpt-4-turbo": "openai/gpt-4-turbo",
  "o1-mini": "openai/o1-mini",
  // OpenAI — new (T028)
  "gpt-4.1": "openai/gpt-4.1",
  "gpt-4.1-mini": "openai/gpt-4.1-mini",
  "gpt-4.1-nano": "openai/gpt-4.1-nano",
  "o1": "openai/o1",
  "o1-pro": "openai/o1-pro",
  "o3": "openai/o3",
  "o3-mini": "openai/o3-mini",
  // Anthropic — existing
  "claude-3-5-sonnet": "anthropic/claude-3-5-sonnet-20241022",
  "claude-3.5-sonnet": "anthropic/claude-3-5-sonnet-20241022",
  "claude-3-5-haiku": "anthropic/claude-3-5-haiku-20241022",
  "claude-3.5-haiku": "anthropic/claude-3-5-haiku-20241022",
  "claude-sonnet-4": "anthropic/claude-sonnet-4-20250514",
  "claude-opus-4": "anthropic/claude-opus-4-20250514",
  // Anthropic — new (T028)
  "claude-3.5-sonnet-20241022": "anthropic/claude-3-5-sonnet-20241022",
  "claude-3.5-haiku-20241022": "anthropic/claude-3-5-haiku-20241022",
  "claude-sonnet-4-20250514": "anthropic/claude-sonnet-4-20250514",
  "claude-opus-4-20250514": "anthropic/claude-opus-4-20250514",
  // Google — existing
  "gemini-1.5-pro": "google/gemini-1.5-pro",
  "gemini-2.0-flash": "google/gemini-2.0-flash",
  "gemini-2.5-pro": "google/gemini-2.5-pro",
  // Google — new (T028)
  "gemini-1.5-flash": "google/gemini-1.5-flash",
  // Others — new (T028)
  "llama-3.1-405b": "groq/llama-3.1-405b-versatile",
  "mistral-large": "mistral/mistral-large-latest",
}

/**
 * Normalize a model identifier from Copilot format to OpenCode format.
 * OpenCode expects "provider/model-id" (e.g., "anthropic/claude-sonnet-4-20250514").
 * Copilot uses short names like "gpt-4o" or "claude-3.5-sonnet".
 *
 * Resolution order:
 * 1. If already contains "/", return as-is (already in provider/model format)
 * 2. Exact match in KNOWN_MODELS
 * 3. Dot-to-hyphen normalization (e.g., "claude-3.5-sonnet" → "claude-3-5-sonnet")
 * 4. Regex-based prefix inference for common providers
 * 5. Return undefined and log a warning for completely unknown models
 *
 * Exported for testing (T031/T032).
 */
export function normalizeModel(model: string): string | undefined {
  if (model.includes("/")) return model

  const lower = model.toLowerCase()

  // 1. Exact match
  if (KNOWN_MODELS[lower]) return KNOWN_MODELS[lower]

  // 2. Dot → hyphen normalization (e.g., "claude-3.5-sonnet" → "claude-3-5-sonnet")
  const dotNormalized = lower.replace(/\./g, "-")
  if (dotNormalized !== lower && KNOWN_MODELS[dotNormalized]) return KNOWN_MODELS[dotNormalized]

  // 3. Hyphen → dot normalization (e.g., "gpt-4-1" → "gpt-4.1" — less common but handle it)
  // Only for known dot-containing models in map
  for (const [key, value] of Object.entries(KNOWN_MODELS)) {
    if (key.includes(".") && key.replace(/\./g, "-") === lower) return value
  }

  // 4. Regex-based provider inference for unknown models
  if (/^gpt-|^o\d(-|$)/.test(lower)) {
    // OpenAI pattern: gpt-*, o1, o1-*, o3, o3-*
    console.warn(
      `[opencopilot] Warning: Unknown OpenAI model "${model}" — using "openai/${model}" (unverified); update KNOWN_MODELS for reliable mapping`,
    )
    return `openai/${model}`
  }
  if (/^claude-/.test(lower)) {
    console.warn(
      `[opencopilot] Warning: Unknown Anthropic model "${model}" — using "anthropic/${model}" (unverified); update KNOWN_MODELS for reliable mapping`,
    )
    return `anthropic/${model}`
  }
  if (/^gemini-/.test(lower)) {
    console.warn(
      `[opencopilot] Warning: Unknown Google model "${model}" — using "google/${model}" (unverified); update KNOWN_MODELS for reliable mapping`,
    )
    return `google/${model}`
  }
  if (/^llama-/.test(lower)) {
    console.warn(
      `[opencopilot] Warning: Unknown Llama model "${model}" — using "groq/${model}" (unverified); update KNOWN_MODELS for reliable mapping`,
    )
    return `groq/${model}`
  }
  if (/^mistral-/.test(lower)) {
    console.warn(
      `[opencopilot] Warning: Unknown Mistral model "${model}" — using "mistral/${model}" (unverified); update KNOWN_MODELS for reliable mapping`,
    )
    return `mistral/${model}`
  }

  // 5. Completely unknown — log warning and return undefined
  console.warn(
    `[opencopilot] Warning: Unknown model "${model}" — omitting model field for agent; update the KNOWN_MODELS map if needed`,
  )
  return undefined
}

// ---------------------------------------------------------------------------
// Prompt files → instruction sections (T014 / US1)
// ---------------------------------------------------------------------------

/**
 * Format a CopilotPromptFile as a Markdown section for injection
 * into the OpenCode system prompt.
 *
 * Prompt files are always injected with applyTo: ["**\/*"] (global scope).
 * Both "instruction" and "assistant" modes are treated the same in v1.
 *
 * @param file - The prompt file to format
 * @param githubDir - The .github/ directory path, used to compute relative path
 */
export function mapPromptToInstruction(file: CopilotPromptFile, githubDir: string): string {
  const relativePath = path.relative(path.dirname(githubDir), file.filePath)
    .replace(/\\/g, "/")
  return `## Prompt from ${relativePath}\n\n${file.content}`
}

// ---------------------------------------------------------------------------
// Skills → <available_skills> listing (T019)
// ---------------------------------------------------------------------------

/**
 * Build an OpenCode-compatible <available_skills> XML block listing all
 * Copilot skills from .github/skills/.
 */
export function buildSkillsListing(skills: Map<string, CopilotSkill>): string {
  if (skills.size === 0) return ""

  const items = Array.from(skills.values())
    .map(
      (s) =>
        `  <skill>\n    <name>${escapeXml(s.name)}</name>\n    <description>${escapeXml(s.description)}</description>\n  </skill>`,
    )
    .join("\n")

  return `<available_skills>\n${items}\n</available_skills>`
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
