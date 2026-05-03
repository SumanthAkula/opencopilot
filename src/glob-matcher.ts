/**
 * OpenCopilot - Glob matcher
 *
 * Evaluates applyTo glob patterns from Copilot instruction files against
 * a set of file paths. Implements a minimal but correct subset of glob
 * syntax sufficient for the patterns Copilot supports:
 *
 *   **\/*       - all files recursively
 *   **\/*.ts    - all .ts files recursively
 *   src/**      - all files under src/
 *   *.ts        - .ts files in root only
 *   comma-separated lists are split by the caller (parseFrontmatter)
 *
 * No external glob library is used — Bun/Node's built-in minimatch is not
 * bundled; we implement the subset manually to avoid a runtime dep.
 */

/**
 * Convert a glob pattern to a RegExp.
 *
 * Supported syntax:
 * - `**` matches any sequence of path segments (zero or more)
 * - `*` matches any sequence of characters within a single segment
 * - `?` matches any single character (not /)
 * - `.`, `+`, `^`, `$`, `{`, `}`, `(`, `)`, `[`, `]`, `|` are escaped
 *
 * Patterns are matched against the full normalized path with forward slashes.
 */
function globToRegex(pattern: string): RegExp {
  // Normalize separators
  const normalized = pattern.replace(/\\/g, "/").replace(/^\//, "")

  let regexStr = ""
  let i = 0
  while (i < normalized.length) {
    const ch = normalized[i]

    if (ch === "*") {
      if (normalized[i + 1] === "*") {
        // "**" — matches zero or more path segments
        // Consume optional trailing slash after **
        if (normalized[i + 2] === "/") {
          regexStr += "(?:.+/)?"
          i += 3
        } else {
          regexStr += ".*"
          i += 2
        }
      } else {
        // Single "*" — matches anything except /
        regexStr += "[^/]*"
        i++
      }
    } else if (ch === "?") {
      regexStr += "[^/]"
      i++
    } else if (".+^${}()|[]\\".includes(ch)) {
      regexStr += "\\" + ch
      i++
    } else {
      regexStr += ch
      i++
    }
  }

  return new RegExp("^" + regexStr + "$", "i")
}

/**
 * Parse a comma-separated applyTo string into individual patterns.
 * Trims whitespace from each segment.
 */
export function parseApplyTo(applyTo: string | null | undefined): string[] {
  if (!applyTo || applyTo.trim() === "") return ["**/*"]
  return applyTo
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Return true if filePath matches any of the given glob patterns.
 *
 * @param filePath - A file path, absolute or relative (normalized to forward slashes)
 * @param patterns - Array of glob patterns (e.g. ["**\/*.ts", "src/**"])
 */
export function matchesAny(filePath: string, patterns: string[]): boolean {
  // Normalize to forward slashes, strip leading ./
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\//, "")

  for (const pattern of patterns) {
    if (pattern === "**/*" || pattern === "**") {
      return true
    }
    try {
      const re = globToRegex(pattern)
      if (re.test(normalized)) return true
    } catch {
      // Malformed pattern — skip
    }
  }
  return false
}
