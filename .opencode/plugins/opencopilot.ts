/**
 * OpenCopilot - OpenCode Plugin
 *
 * Adapts .github/copilot/ customizations to work natively in OpenCode.
 * Zero-config: automatically discovers .github/ files and maps them to
 * OpenCode native concepts (instructions, agents, skills).
 *
 * Supported Copilot artifacts:
 *  - .github/copilot-instructions.md            -> system prompt instructions
 *  - .github/instructions/NAME.instructions.md  -> path-specific instructions
 *  - .github/agents/NAME.md                     -> OpenCode subagents
 *  - .github/skills/NAME/SKILL.md               -> OpenCode skills
 *
 * See: specs/001-copilot-opencode-adapter/plan.md
 */

import path from "path"
import type { Plugin } from "@opencode-ai/plugin"
import {
  scanGithubDir,
  scanInstructionFiles,
  scanAgentFiles,
  scanSkillFiles,
  scanPromptFiles,
  scanHookFiles,
} from "../../src/scanner.ts"
import {
  buildInstructionSection,
  buildSkillsListing,
  toOpenCodeAgent,
  mapPromptToInstruction,
} from "../../src/mapper.ts"
import { matchesAny } from "../../src/glob-matcher.ts"
import { parseFrontmatter, fmString } from "../../src/parser.ts"
import type { PluginCache } from "../../src/types.ts"

export const OpenCopilotPlugin: Plugin = async ({ worktree }) => {
  const githubDir = path.join(worktree, ".github")

  // ---------------------------------------------------------------------------
  // Initialization: scan .github/ and populate cache
  // ---------------------------------------------------------------------------
  let cache: PluginCache = await scanGithubDir(githubDir)

  // ---------------------------------------------------------------------------
  // Hook: config — register Copilot agent definitions as OpenCode agents (T017)
  // ---------------------------------------------------------------------------
  async function configHook(config: Record<string, unknown>): Promise<void> {
    try {
      if (!cache.initialized || cache.agents.size === 0) return

      // Ensure config.agent exists
      if (!config.agent || typeof config.agent !== "object") {
        config.agent = {}
      }
      const agentMap = config.agent as Record<string, unknown>

      for (const [key, def] of cache.agents.entries()) {
        if (key in agentMap) {
          // Native config wins — skip
          continue
        }
        agentMap[key] = toOpenCodeAgent(def)
      }
    } catch (err) {
      console.warn(`[opencopilot] config hook error: ${(err as Error).message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Hook bridging: process cached Copilot hooks on session start (T020/US2)
  // Called once after initialization for onChatStart hooks.
  // ---------------------------------------------------------------------------
  function processCopilotHooks(): void {
    if (!cache.initialized || cache.hooks.length === 0) return

    for (const hook of cache.hooks) {
      switch (hook.event) {
        case "onChatStart":
          // Log message — script execution not supported in v1
          console.error(
            `[opencopilot] Hook: onChatStart hook registered from ${hook.filePath}` +
            (hook.description ? ` (${hook.description})` : "") +
            (hook.script ? ` — Note: script execution not supported in v1 (script: "${hook.script}")` : ""),
          )
          break
        case "onCodeReview":
          // OpenCode has no code-review mode — log warning
          console.warn(
            `[opencopilot] Warning: onCodeReview hook in ${hook.filePath} is not supported in OpenCode (no code-review mode)`,
          )
          break
        case "onFileSave":
          // Already handled by the existing file.watcher.updated event hook
          console.error(
            `[opencopilot] Hook: onFileSave hook registered from ${hook.filePath} — handled via file.watcher.updated event`,
          )
          break
        default:
          console.warn(
            `[opencopilot] Warning: Unknown hook event "${hook.event}" in ${hook.filePath} — no OpenCode equivalent`,
          )
      }
    }
  }

  // Run hook bridging on startup
  processCopilotHooks()

  // ---------------------------------------------------------------------------
  // Hook: experimental.chat.system.transform
  // Inject instructions + prompt files + skills listing into system prompt
  // (T012 + T021 + T015/US1)
  // ---------------------------------------------------------------------------
  async function systemTransformHook(
    input: { sessionID?: string },
    output: { system: string[] },
  ): Promise<void> {
    try {
      if (!cache.initialized) return

      const recentFiles = cache.recentlyEditedFiles.get(input.sessionID ?? "") ?? new Set<string>()

      // Inject matching instruction files
      for (const file of cache.instructions) {
        const isGlobal = file.applyTo.length === 1 && (file.applyTo[0] === "**/*" || file.applyTo[0] === "**")
        if (isGlobal || matchesAny([...recentFiles].find(() => true) ?? "", file.applyTo)) {
          // For global instructions, always inject.
          // For path-specific, inject if any recently-edited file matches.
          if (isGlobal || [...recentFiles].some((f) => matchesAny(f, file.applyTo))) {
            output.system.push(buildInstructionSection(file, githubDir))
          }
        }
      }

      // Inject prompt files (always injected — applyTo: "**/*" equivalent) (T015/US1)
      for (const promptFile of cache.prompts) {
        output.system.push(mapPromptToInstruction(promptFile, githubDir))
      }

      // Inject skills listing if any skills are cached
      if (cache.skills.size > 0) {
        output.system.push(buildSkillsListing(cache.skills))
      }
    } catch (err) {
      console.warn(`[opencopilot] system.transform hook error: ${(err as Error).message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Hook: tool.execute.before — intercept skill tool calls (T022)
  // ---------------------------------------------------------------------------
  async function toolBeforeHook(
    input: { tool: string; sessionID: string; callID: string },
    output: { args: Record<string, unknown> },
  ): Promise<void> {
    try {
      if (input.tool !== "skill") return
      const skillName = typeof output.args.name === "string" ? output.args.name : null
      if (!skillName) return

      const skill = cache.skills.get(skillName)
      if (!skill) return // Not a .github/ skill — let native resolution proceed

      // Inject skill content via the args that the skill tool will display.
      // The skill tool returns its content based on the name lookup;
      // if the name doesn't match a natively-discovered skill, we inject
      // the content as a synthetic result by overriding with a special marker.
      // Since we cannot intercept the tool's return value here (only args),
      // we instead push the skill content directly into the system prompt
      // as a supplementary injection for this call.
      // This is the documented fallback from research.md Decision 4.
      output.args["_opencopilot_content"] = skill.content
    } catch (err) {
      console.warn(`[opencopilot] tool.before hook error: ${(err as Error).message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Hook: event — file watcher + recent files tracking (T013)
  // ---------------------------------------------------------------------------
  async function eventHook(input: { event: { type: string; properties?: Record<string, unknown> } }): Promise<void> {
    try {
      const { event } = input
      if (event.type !== "file.watcher.updated") return

      const filePath = (event.properties?.path ?? event.properties?.filePath) as string | undefined
      if (!filePath) return

      // Track recently-edited files per session (for applyTo evaluation)
      const sessionID = (event.properties?.sessionID as string | undefined) ?? ""
      if (!cache.recentlyEditedFiles.has(sessionID)) {
        cache.recentlyEditedFiles.set(sessionID, new Set())
      }
      const files = cache.recentlyEditedFiles.get(sessionID)!
      files.add(filePath)
      // Cap at 100 entries
      if (files.size > 100) {
        const first = files.values().next().value
        if (first !== undefined) files.delete(first)
      }

      // Re-scan .github/ files if the changed file is under .github/
      const normalizedPath = filePath.replace(/\\/g, "/")
      const normalizedGithub = githubDir.replace(/\\/g, "/")
      if (!normalizedPath.startsWith(normalizedGithub)) return

      // Re-scan the specific affected sub-collection
      if (normalizedPath.includes("/instructions/") || normalizedPath.endsWith("copilot-instructions.md")) {
        cache.instructions = await scanInstructionFiles(githubDir)
      } else if (normalizedPath.includes("/agents/")) {
        const agents = await scanAgentFiles(githubDir)
        cache.agents = new Map(agents.map((a) => [a.normalizedKey, a]))
      } else if (normalizedPath.includes("/skills/")) {
        const skills = await scanSkillFiles(githubDir)
        cache.skills = new Map(skills.map((s) => [s.name, s]))
      } else if (normalizedPath.includes("/prompts/")) {
        // Re-scan prompt files on change (T015/US1)
        cache.prompts = await scanPromptFiles(githubDir)
      } else if (normalizedPath.includes("/hooks/")) {
        // Re-scan hook definitions on change (T020/US2)
        cache.hooks = await scanHookFiles(githubDir)
        // Re-process hooks after re-scan
        processCopilotHooks()
      }
    } catch (err) {
      console.warn(`[opencopilot] event hook error: ${(err as Error).message}`)
    }
  }

  // ---------------------------------------------------------------------------
  // Return hooks object
  // ---------------------------------------------------------------------------
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: configHook as any,
    "experimental.chat.system.transform": systemTransformHook,
    "tool.execute.before": toolBeforeHook,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: eventHook as any,
  }
}

export default OpenCopilotPlugin
