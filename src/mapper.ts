/**
 * OpenCopilot - Copilot → OpenCode field mapping
 *
 * Functions that convert parsed Copilot entities to their OpenCode equivalents.
 * Implements the mapping tables defined in specs/001-copilot-opencode-adapter/data-model.md
 */

import path from "node:path"
import type { CopilotInstructionFile, CopilotAgentDefinition, CopilotSkill } from "./types.ts"

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
 */
export function toOpenCodeAgent(def: CopilotAgentDefinition): AgentConfig {
  const config: AgentConfig = {
    description: def.description,
    mode: "subagent",
    prompt: def.systemPrompt || undefined,
    hidden: !def.userInvocable,
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

/**
 * Normalize a model identifier from Copilot format to OpenCode format.
 * OpenCode expects "provider/model-id" (e.g., "anthropic/claude-sonnet-4-20250514").
 * Copilot uses short names like "gpt-4o" or "claude-3.5-sonnet".
 *
 * If the model string already contains a slash, return it as-is.
 * Otherwise, apply known mapping; if unknown, return null (will be omitted).
 */
function normalizeModel(model: string): string | undefined {
  if (model.includes("/")) return model

  const KNOWN_MODELS: Record<string, string> = {
    "gpt-4o": "openai/gpt-4o",
    "gpt-4o-mini": "openai/gpt-4o-mini",
    "gpt-4": "openai/gpt-4",
    "gpt-4-turbo": "openai/gpt-4-turbo",
    "o1": "openai/o1",
    "o1-mini": "openai/o1-mini",
    "o3": "openai/o3",
    "o3-mini": "openai/o3-mini",
    "claude-3-5-sonnet": "anthropic/claude-3-5-sonnet-20241022",
    "claude-3.5-sonnet": "anthropic/claude-3-5-sonnet-20241022",
    "claude-3-5-haiku": "anthropic/claude-3-5-haiku-20241022",
    "claude-3.5-haiku": "anthropic/claude-3-5-haiku-20241022",
    "claude-sonnet-4": "anthropic/claude-sonnet-4-20250514",
    "claude-opus-4": "anthropic/claude-opus-4-20250514",
    "gemini-1.5-pro": "google/gemini-1.5-pro",
    "gemini-2.0-flash": "google/gemini-2.0-flash",
    "gemini-2.5-pro": "google/gemini-2.5-pro",
  }

  const normalized = KNOWN_MODELS[model.toLowerCase()]
  if (!normalized) {
    console.warn(
      `[opencopilot] Warning: Unknown model "${model}" — omitting model field for agent; update the KNOWN_MODELS map if needed`,
    )
    return undefined
  }
  return normalized
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
