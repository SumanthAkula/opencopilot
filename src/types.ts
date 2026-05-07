/**
 * OpenCopilot - Data model types
 * Mirrors the entities defined in specs/001-copilot-opencode-adapter/data-model.md
 */

// ---------------------------------------------------------------------------
// CopilotInstructionFile
// Represents a loaded .github/copilot-instructions.md or
// .github/instructions/**\/*.instructions.md file.
// ---------------------------------------------------------------------------
export interface CopilotInstructionFile {
  /** Absolute path to the file on disk */
  filePath: string
  /**
   * Glob patterns controlling which files trigger injection of this instruction.
   * copilot-instructions.md always uses ["**\/*"] (applies to everything).
   */
  applyTo: string[]
  /**
   * Optional exclusion filter from frontmatter. Parsed but not used for
   * OpenCode filtering (no code-review/cloud-agent distinction).
   */
  excludeAgent: string | null
  /** Raw Markdown content (after frontmatter, if any) */
  content: string
  /** mtime in ms — used for cache invalidation */
  lastModified: number
}

// ---------------------------------------------------------------------------
// CopilotAgentDefinition
// Represents a parsed .github/agents/*.md or .github/agents/*.agent.md file.
// ---------------------------------------------------------------------------
export interface CopilotAgentDefinition {
  /** Absolute path to the file on disk */
  filePath: string
  /** Filename without extension, e.g. "security-auditor" */
  rawName: string
  /**
   * Display name from frontmatter `name`, or rawName if not specified.
   */
  name: string
  /**
   * Sanitized key used as the OpenCode agent map key.
   * Lowercase, hyphens only, collision-safe (may have "-copilot" suffix).
   */
  normalizedKey: string
  /** Required: description of what the agent does */
  description: string
  /** Markdown body used as the system prompt (agent.prompt) */
  systemPrompt: string
  /**
   * Model identifier, normalized to provider/model-id format if recognizable.
   * null = inherit default.
   */
  model: string | null
  /**
   * Tool list from frontmatter.
   * null  = all tools allowed (no restriction)
   * []    = no tools (deny all)
   * [...] = explicit allow list (using Copilot tool alias names)
   */
  tools: string[] | null
  /** Whether the agent is visible in the @ autocomplete menu. Default: true */
  userInvocable: boolean
  /**
   * If true, the agent cannot be invoked by the user (disable-model-invocation).
   * Maps to hidden: true in OpenCode agent config.
   */
  disableModelInvocation: boolean
  /** frontmatter `target` field — parsed, not used for filtering */
  target: string | null
}

// ---------------------------------------------------------------------------
// CopilotPromptFile
// Represents a parsed .github/prompts/*.prompt.md file.
// ---------------------------------------------------------------------------
export interface CopilotPromptFile {
  /** Absolute path to the file on disk */
  filePath: string
  /** Optional description from frontmatter */
  description: string | null
  /**
   * Mode from frontmatter: "instruction" or "assistant".
   * Defaults to "instruction" if not specified.
   */
  mode: "instruction" | "assistant" | null
  /** Raw Markdown content (after frontmatter) */
  content: string
  /** mtime in ms — used for cache invalidation */
  lastModified: number
}

// ---------------------------------------------------------------------------
// CopilotHookDefinition
// Represents a parsed .github/hooks/*.json file.
// ---------------------------------------------------------------------------
export interface CopilotHookDefinition {
  /** Absolute path to the file on disk */
  filePath: string
  /** Copilot hook event name (e.g., "onChatStart", "onCodeReview", "onFileSave") */
  event: string
  /** Shell command to execute (not executed in v1; logged only) */
  script: string | null
  /** Informational description */
  description: string | null
}

// ---------------------------------------------------------------------------
// CopilotSkill
// Represents a parsed .github/skills/<name>/SKILL.md file.
// ---------------------------------------------------------------------------
export interface CopilotSkill {
  /** Absolute path to SKILL.md */
  filePath: string
  /** Absolute path to the parent <name> directory */
  dirPath: string
  /** Validated skill name (lowercase, hyphens) */
  name: string
  /** Description used in <available_skills> listing */
  description: string
  /** Optional license field — passthrough */
  license: string | null
  /** Full file body after frontmatter — served on skill invocation */
  content: string
}

// ---------------------------------------------------------------------------
// PluginCache
// In-memory state maintained by the plugin between hook invocations.
// ---------------------------------------------------------------------------
export interface PluginCache {
  /** Sorted: copilot-instructions.md first, then path-specific files */
  instructions: CopilotInstructionFile[]
  /** Keyed by normalizedKey */
  agents: Map<string, CopilotAgentDefinition>
  /** Keyed by skill name */
  skills: Map<string, CopilotSkill>
  /** Parsed .github/prompts/*.prompt.md files */
  prompts: CopilotPromptFile[]
  /** Parsed .github/hooks/*.json hook definitions */
  hooks: CopilotHookDefinition[]
  /** Paths under .github/ currently tracked */
  watchedPaths: Set<string>
  /**
   * sessionID → Set of recently-modified file paths.
   * Used for applyTo glob evaluation. Capped at 100 entries per session.
   */
  recentlyEditedFiles: Map<string, Set<string>>
  /** True after the first scan completes successfully */
  initialized: boolean
}

/** Returns an empty PluginCache */
export function emptyCache(): PluginCache {
  return {
    instructions: [],
    agents: new Map(),
    skills: new Map(),
    prompts: [],
    hooks: [],
    watchedPaths: new Set(),
    recentlyEditedFiles: new Map(),
    initialized: false,
  }
}
