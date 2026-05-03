/**
 * OpenCopilot - .github/ directory scanner
 *
 * Scans the .github/ directory tree for all supported Copilot customization
 * files and returns a populated PluginCache. Designed to be called once at
 * plugin startup and re-invoked selectively on file-watcher updates.
 */

import { readdir, readFile, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { parseFrontmatter, fmString, fmBool, fmStringArray } from "./parser.ts"
import { parseApplyTo } from "./glob-matcher.ts"
import {
  type CopilotInstructionFile,
  type CopilotAgentDefinition,
  type CopilotSkill,
  type PluginCache,
  emptyCache,
} from "./types.ts"

// Built-in OpenCode agent names that must not be overwritten
const BUILTIN_AGENT_NAMES = new Set([
  "build",
  "plan",
  "general",
  "explore",
  "compaction",
  "title",
  "summary",
])

// ---------------------------------------------------------------------------
// Instruction file scanning (T009)
// ---------------------------------------------------------------------------

/**
 * Scan .github/ for Copilot instruction files:
 *  - .github/copilot-instructions.md  (no frontmatter, applies to all files)
 *  - .github/instructions/**\/*.instructions.md  (frontmatter with applyTo)
 */
export async function scanInstructionFiles(githubDir: string): Promise<CopilotInstructionFile[]> {
  const results: CopilotInstructionFile[] = []

  // 1. Repo-wide instructions file
  const rootInstructions = path.join(githubDir, "copilot-instructions.md")
  if (existsSync(rootInstructions)) {
    const file = await loadInstructionFile(rootInstructions, ["**/*"], null)
    if (file) results.push(file)
  }

  // 2. Path-specific instruction files
  const instructionsDir = path.join(githubDir, "instructions")
  if (existsSync(instructionsDir)) {
    const found = await globInstructionFiles(instructionsDir)
    results.push(...found)
  }

  return results
}

/** Recursively find all *.instructions.md files under a directory */
async function globInstructionFiles(dir: string): Promise<CopilotInstructionFile[]> {
  const results: CopilotInstructionFile[]  = []
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry)
    const stats = await stat(fullPath).catch(() => null)
    if (!stats) continue

    if (stats.isDirectory()) {
      const nested = await globInstructionFiles(fullPath)
      results.push(...nested)
    } else if (entry.endsWith(".instructions.md")) {
      const content = await readFile(fullPath, "utf8").catch(() => null)
      if (!content) continue
      const { frontmatter, body } = parseFrontmatter(content, fullPath)
      const rawApplyTo = fmString(frontmatter, "applyTo")
      const applyTo = parseApplyTo(rawApplyTo)
      const excludeAgent = fmString(frontmatter, "excludeAgent")
      const mtime = stats.mtimeMs
      if (!body.trim()) {
        console.warn(`[opencopilot] Warning: Empty instruction file skipped: ${fullPath}`)
        continue
      }
      results.push({ filePath: fullPath, applyTo, excludeAgent, content: body, lastModified: mtime })
    }
  }
  return results
}

/** Load a single instruction file given known applyTo and excludeAgent values */
async function loadInstructionFile(
  filePath: string,
  applyTo: string[],
  excludeAgent: string | null,
): Promise<CopilotInstructionFile | null> {
  try {
    const stats = await stat(filePath)
    const content = await readFile(filePath, "utf8")
    if (!content.trim()) {
      console.warn(`[opencopilot] Warning: Empty instruction file skipped: ${filePath}`)
      return null
    }
    // copilot-instructions.md has no frontmatter — use content as-is
    return {
      filePath,
      applyTo,
      excludeAgent,
      content: content.trim(),
      lastModified: stats.mtimeMs,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Agent file scanning (T014)
// ---------------------------------------------------------------------------

/**
 * Scan .github/agents/ for Copilot agent definition files.
 * Accepts both *.md and *.agent.md patterns.
 */
export async function scanAgentFiles(githubDir: string): Promise<CopilotAgentDefinition[]> {
  const agentsDir = path.join(githubDir, "agents")
  if (!existsSync(agentsDir)) return []

  let entries: string[]
  try {
    entries = await readdir(agentsDir)
  } catch {
    return []
  }

  const results: CopilotAgentDefinition[] = []

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue
    const fullPath = path.join(agentsDir, entry)
    const stats = await stat(fullPath).catch(() => null)
    if (!stats || !stats.isFile()) continue

    const content = await readFile(fullPath, "utf8").catch(() => null)
    if (!content) continue

    const { frontmatter, body } = parseFrontmatter(content, fullPath)

    const description = fmString(frontmatter, "description")
    if (!description) {
      console.warn(`[opencopilot] Warning: Agent file missing 'description', skipping: ${fullPath}`)
      continue
    }

    // Derive rawName: strip .agent.md or .md extension
    const rawName = entry.replace(/\.agent\.md$/, "").replace(/\.md$/, "")
    const displayName = fmString(frontmatter, "name") ?? rawName
    const normalizedKey = deriveNormalizedKey(rawName)
    const model = fmString(frontmatter, "model")
    const tools = fmStringArray(frontmatter, "tools")
    const userInvocable = fmBool(frontmatter, "user-invocable", true)
    const target = fmString(frontmatter, "target")

    const systemPrompt = body.length > 30_000 ? (() => {
      console.warn(`[opencopilot] Warning: Agent prompt truncated at 30,000 chars: ${fullPath}`)
      return body.slice(0, 30_000)
    })() : body

    results.push({
      filePath: fullPath,
      rawName,
      name: displayName,
      normalizedKey,
      description,
      systemPrompt,
      model,
      tools,
      userInvocable,
      target,
    })
  }

  return results
}

/** Derive a safe OpenCode agent map key from a raw filename */
function deriveNormalizedKey(rawName: string): string {
  let key = rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (BUILTIN_AGENT_NAMES.has(key)) {
    console.warn(
      `[opencopilot] Warning: Agent name "${key}" collides with built-in; using "${key}-copilot"`,
    )
    key = key + "-copilot"
  }

  return key
}

// ---------------------------------------------------------------------------
// Skill file scanning (T018)
// ---------------------------------------------------------------------------

/** Skill name validation regex per OpenCode spec */
const SKILL_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Scan .github/skills/ for Copilot skill definitions.
 * Expects: .github/skills/<name>/SKILL.md
 */
export async function scanSkillFiles(githubDir: string): Promise<CopilotSkill[]> {
  const skillsDir = path.join(githubDir, "skills")
  if (!existsSync(skillsDir)) return []

  let skillDirs: string[]
  try {
    skillDirs = await readdir(skillsDir)
  } catch {
    return []
  }

  const results: CopilotSkill[] = []

  for (const dirName of skillDirs) {
    const dirPath = path.join(skillsDir, dirName)
    const dirStats = await stat(dirPath).catch(() => null)
    if (!dirStats?.isDirectory()) continue

    const skillFile = path.join(dirPath, "SKILL.md")
    if (!existsSync(skillFile)) continue

    const content = await readFile(skillFile, "utf8").catch(() => null)
    if (!content) continue

    const { frontmatter, body } = parseFrontmatter(content, skillFile)

    const name = fmString(frontmatter, "name")
    const description = fmString(frontmatter, "description")

    if (!name) {
      console.warn(`[opencopilot] Warning: Skill missing 'name' field, skipping: ${skillFile}`)
      continue
    }
    if (!description) {
      console.warn(`[opencopilot] Warning: Skill missing 'description' field, skipping: ${skillFile}`)
      continue
    }
    if (!SKILL_NAME_RE.test(name)) {
      console.warn(
        `[opencopilot] Warning: Skill 'name' "${name}" is not valid (must match ${SKILL_NAME_RE}), skipping: ${skillFile}`,
      )
      continue
    }
    if (name !== dirName) {
      console.warn(
        `[opencopilot] Warning: Skill 'name' "${name}" does not match directory "${dirName}"; using directory name`,
      )
    }

    const license = fmString(frontmatter, "license")

    results.push({ filePath: skillFile, dirPath, name: dirName, description, license, content: body })
  }

  return results
}

// ---------------------------------------------------------------------------
// Top-level scanner (T008 + T016 + T020)
// ---------------------------------------------------------------------------

/**
 * Scan the .github/ directory and return a fully populated PluginCache.
 *
 * Returns an empty cache (with initialized=false) if .github/ does not exist.
 * Wraps all I/O in a top-level try/catch so it never throws — see T024.
 */
export async function scanGithubDir(githubDir: string): Promise<PluginCache> {
  const cache = emptyCache()

  if (!existsSync(githubDir)) {
    console.warn(`[opencopilot] No .github/ directory found at ${githubDir}; plugin inactive`)
    return cache
  }

  try {
    const [instructions, agents, skills] = await Promise.all([
      scanInstructionFiles(githubDir),
      scanAgentFiles(githubDir),
      scanSkillFiles(githubDir),
    ])

    cache.instructions = instructions

    for (const agent of agents) {
      cache.agents.set(agent.normalizedKey, agent)
    }

    for (const skill of skills) {
      cache.skills.set(skill.name, skill)
    }

    cache.initialized = true
    console.error(
      `[opencopilot] Loaded: ${instructions.length} instruction files, ${agents.length} agents, ${cache.skills.size} skills from .github/`,
    )
  } catch (err) {
    console.warn(`[opencopilot] Warning: scan failed: ${(err as Error).message}`)
    return emptyCache()
  }

  return cache
}
