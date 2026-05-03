/**
 * OpenCopilot - Frontmatter parser
 *
 * Parses YAML frontmatter delimited by `---` from Markdown file content.
 * Uses js-yaml for YAML parsing. Falls back to empty frontmatter if none present.
 */

import yaml from "js-yaml"

export interface ParseResult {
  frontmatter: Record<string, unknown>
  body: string
}

/**
 * Parse YAML frontmatter from a Markdown string.
 *
 * Frontmatter is a YAML block delimited by `---` at the very start of the file.
 * If no frontmatter is present, returns `{ frontmatter: {}, body: content }`.
 * If the YAML is invalid, logs a warning and returns an empty frontmatter with
 * the full content as the body.
 *
 * @param content - Raw file content
 * @param filePath - Path to the file (used only for warning messages)
 */
export function parseFrontmatter(content: string, filePath = "<unknown>"): ParseResult {
  // Frontmatter must start at position 0 with "---"
  if (!content.startsWith("---")) {
    return { frontmatter: {}, body: content }
  }

  // Find the closing "---" delimiter (must be on its own line)
  const afterOpenDelim = content.slice(3)
  // Accept both \r\n and \n line endings
  const closeIndex = afterOpenDelim.search(/\r?\n---(\r?\n|$)/)
  if (closeIndex === -1) {
    // Opening delimiter found but no closing delimiter — treat as no frontmatter
    return { frontmatter: {}, body: content }
  }

  const yamlText = afterOpenDelim.slice(0, closeIndex)
  // Body starts after the closing "---\n" (or "---\r\n")
  const bodyStart = closeIndex + afterOpenDelim.slice(closeIndex).search(/\r?\n/) + 1
  const body = afterOpenDelim.slice(bodyStart + 3) // +3 for "---"

  let frontmatter: Record<string, unknown> = {}
  try {
    const parsed = yaml.load(yamlText)
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>
    }
  } catch (err) {
    console.warn(
      `[opencopilot] Warning: Could not parse frontmatter in ${filePath}: ${(err as Error).message}`,
    )
  }

  // Trim leading newline from body
  const trimmedBody = body.startsWith("\n") ? body.slice(1) : body.startsWith("\r\n") ? body.slice(2) : body

  return { frontmatter, body: trimmedBody }
}

/** Safely read a string field from a frontmatter object */
export function fmString(fm: Record<string, unknown>, key: string): string | null {
  const val = fm[key]
  return typeof val === "string" && val.trim() !== "" ? val.trim() : null
}

/** Safely read a boolean field from a frontmatter object (default: defaultValue) */
export function fmBool(fm: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const val = fm[key]
  return typeof val === "boolean" ? val : defaultValue
}

/** Safely read a string array field from a frontmatter object */
export function fmStringArray(fm: Record<string, unknown>, key: string): string[] | null {
  const val = fm[key]
  if (!Array.isArray(val)) return null
  return val.filter((v): v is string => typeof v === "string")
}
