#!/usr/bin/env node
/**
 * opencopilot installer
 *
 * Fetches the latest opencopilot.ts from GitHub Releases and installs it
 * into the current project's .opencode/plugins/ directory.
 *
 * Usage:
 *   npx opencode-copilot install [--force]
 *   node bin/install.js install [--force]
 */

import { lstat, mkdir, writeFile, readFile } from "node:fs/promises"
import { createInterface } from "node:readline"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// --- Constants ---

const GITHUB_OWNER = "anomalyco"
const GITHUB_REPO = "opencode-plugins"
const ASSET_NAME = "opencopilot.ts"
const FALLBACK_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest/download/${ASSET_NAME}`

// Allow override for testing
const SOURCE_URL = process.env.INSTALL_SOURCE_URL || FALLBACK_URL

const TARGET_DIR = process.cwd()
const PLUGIN_DIR = join(TARGET_DIR, ".opencode", "plugins")
const PLUGIN_PATH = join(PLUGIN_DIR, ASSET_NAME)
const OPENCODE_PKG_PATH = join(TARGET_DIR, ".opencode", "package.json")

// --- Usage ---

function printUsage() {
  console.log(`
Usage:
  npx opencode-copilot install [--force]    Install the plugin into .opencode/plugins/

Options:
  --force    Skip overwrite prompt; silently replace existing file
  --help, -h Print this help message
`)
}

// --- Argument Parsing ---

const args = process.argv.slice(2)
const hasHelp = args.includes("--help") || args.includes("-h")
const hasForce = args.includes("--force")
const subcommandArgs = args.filter((a) => !a.startsWith("-"))
const subcommand = subcommandArgs[0]

if (hasHelp) {
  printUsage()
  process.exit(0)
}

// VR-001: unknown subcommand → usage + exit 1
if (subcommand !== "install") {
  if (subcommand) {
    process.stderr.write(`Error: Unknown subcommand '${subcommand}'.\n`)
  } else {
    process.stderr.write(`Error: Missing subcommand.\n`)
  }
  printUsage()
  process.exit(1)
}

// --- Interactive Prompt ---

async function promptOverwrite(filePath) {
  // Non-interactive / piped stdin defaults to "N"
  if (!process.stdin.isTTY) {
    return false
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(
      `opencopilot.ts already exists at ${filePath}\nOverwrite? [y/N]: `,
      (answer) => {
        rl.close()
        const normalised = answer.trim().toLowerCase()
        resolve(normalised === "y" || normalised === "yes")
      },
    )
  })
}

// --- Fetch Helper (supports file:// for testing) ---

async function fetchContent(url) {
  // Support file:// URLs for testing without a live network
  if (url.startsWith("file://")) {
    const filePath = fileURLToPath(url)
    const content = await readFile(filePath, "utf8")
    const resolvedVersion = extractVersionFromBanner(content)
    return { content, resolvedVersion, finalUrl: url }
  }

  const response = await fetch(url, { redirect: "follow" })
  const finalUrl = response.url || url
  const resolvedVersion = extractVersion(finalUrl)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const content = await response.text()

  if (!content || content.trim() === "") {
    throw new Error("Empty response body (VR-005)")
  }

  return { content, resolvedVersion: resolvedVersion || extractVersionFromBanner(content), finalUrl }
}

// --- Version Extraction ---

function extractVersion(url) {
  const match = url.match(/\/download\/v?(\d+\.\d+\.\d+)\//)
  return match ? match[1] : null
}

function extractVersionFromBanner(content) {
  const firstLine = content.split("\n")[0]
  const match = firstLine.match(/\/\/ opencopilot v(\d+\.\d+\.\d+)/)
  return match ? match[1] : null
}

// --- Ensure .opencode/package.json ---

async function ensureOpencodePackageJson() {
  const requiredDeps = {
    "@opencode-ai/plugin": "latest",
    "js-yaml": "^4.1.0",
  }

  let existing = {}

  try {
    const raw = await readFile(OPENCODE_PKG_PATH, "utf8")
    existing = JSON.parse(raw)
  } catch {
    // File doesn't exist or is invalid — start fresh
    existing = {}
  }

  // Merge: add missing dep keys without overwriting user entries
  const existingDeps = existing.dependencies || {}
  let changed = false

  for (const [pkg, version] of Object.entries(requiredDeps)) {
    if (!existingDeps[pkg]) {
      existingDeps[pkg] = version
      changed = true
    }
  }

  if (changed || !existing.dependencies) {
    existing.dependencies = existingDeps
    const dir = join(TARGET_DIR, ".opencode")
    await mkdir(dir, { recursive: true })
    await writeFile(OPENCODE_PKG_PATH, JSON.stringify(existing, null, 2) + "\n", "utf8")
  }
}

// --- Main ---

async function main() {
  // Check existing target file state
  let fileExists = false
  let isSymlink = false

  try {
    const lstats = await lstat(PLUGIN_PATH)
    fileExists = true
    isSymlink = lstats.isSymbolicLink()
  } catch {
    // File doesn't exist
    fileExists = false
    isSymlink = false
  }

  // VR-002: symlink → warn + exit 1
  if (isSymlink) {
    process.stderr.write(
      `Error: ${PLUGIN_PATH} is a symlink. Remove or replace it manually before installing.\n`,
    )
    process.stderr.write(`Fallback: ${FALLBACK_URL}\n`)
    process.exit(1)
  }

  // VR-003: file exists + no --force → prompt
  if (fileExists && !hasForce) {
    // Check for "up to date" (US4 / T011): compare version banners
    let existingVersion = null
    try {
      const existingContent = await readFile(PLUGIN_PATH, "utf8")
      existingVersion = extractVersionFromBanner(existingContent)
    } catch {
      // ignore read errors
    }

    // Fetch first to compare versions
    let fetchedContent = null
    let resolvedVersion = null

    try {
      const result = await fetchContent(SOURCE_URL)
      fetchedContent = result.content
      resolvedVersion = result.resolvedVersion
    } catch (err) {
      process.stderr.write(
        `Error: Failed to fetch opencopilot from GitHub Releases: ${err.message}\n`,
      )
      process.stderr.write(`Fallback: ${FALLBACK_URL}\n`)
      process.exit(1)
    }

    // T011: already up to date check
    if (existingVersion && resolvedVersion && existingVersion === resolvedVersion) {
      console.log(`Already up to date (v${resolvedVersion}). No changes made.`)
      process.exit(0)
    }

    const shouldOverwrite = await promptOverwrite(PLUGIN_PATH)
    if (!shouldOverwrite) {
      console.log("Skipped. No changes made.")
      process.exit(0)
    }

    // Write the already-fetched content
    await mkdir(PLUGIN_DIR, { recursive: true })
    await writeFile(PLUGIN_PATH, fetchedContent, "utf8")
    await ensureOpencodePackageJson()

    const displayVersion = resolvedVersion || "unknown"
    console.log(`✓ Installed opencopilot v${displayVersion} to .opencode/plugins/opencopilot.ts`)
    process.exit(0)
  }

  // Fetch from GitHub Releases
  let fetchedContent = null
  let resolvedVersion = null

  try {
    const result = await fetchContent(SOURCE_URL)
    fetchedContent = result.content
    resolvedVersion = result.resolvedVersion
  } catch (err) {
    process.stderr.write(
      `Error: Failed to fetch opencopilot from GitHub Releases: ${err.message}\n`,
    )
    process.stderr.write(`Fallback: ${FALLBACK_URL}\n`)
    process.exit(1)
  }

  // Create plugin directory and write file
  await mkdir(PLUGIN_DIR, { recursive: true })
  await writeFile(PLUGIN_PATH, fetchedContent, "utf8")
  await ensureOpencodePackageJson()

  const displayVersion = resolvedVersion || "unknown"
  console.log(`✓ Installed opencopilot v${displayVersion} to .opencode/plugins/opencopilot.ts`)
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`Error: Unexpected error: ${err.message}\n`)
  process.exit(1)
})
