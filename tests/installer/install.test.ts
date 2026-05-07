/**
 * Integration tests for bin/install.js
 *
 * Tests use INSTALL_SOURCE_URL env var to mock network access,
 * pointing to a local fixture file instead of live GitHub Releases.
 *
 * Run: bun test tests/installer/install.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  rmSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

// Path to the installer script
const INSTALLER = join(import.meta.dir, "..", "..", "bin", "install.js")

// Fixture content simulating a real GitHub release asset
const MOCK_VERSION = "1.2.3"
const MOCK_PLUGIN_CONTENT = `// opencopilot v${MOCK_VERSION}
// https://github.com/anomalyco/opencode-plugins
// @bun
import type { Plugin } from "@opencode-ai/plugin";
var OpenCopilotPlugin = async ({ worktree }) => {
  return {};
};
var opencopilot_default = OpenCopilotPlugin;
export {
  opencopilot_default as default,
  OpenCopilotPlugin
};
`

const MOCK_VERSION_2 = "1.3.0"
const MOCK_PLUGIN_CONTENT_V2 = `// opencopilot v${MOCK_VERSION_2}
// https://github.com/anomalyco/opencode-plugins
// @bun
import type { Plugin } from "@opencode-ai/plugin";
var OpenCopilotPlugin = async ({ worktree }) => {
  return { updated: true };
};
var opencopilot_default = OpenCopilotPlugin;
export {
  opencopilot_default as default,
  OpenCopilotPlugin
};
`

// Create a temporary fixture server directory and return a file:// URL
function createMockSourceFile(content: string, tmpDir: string): string {
  const mockFile = join(tmpDir, "mock-opencopilot.ts")
  writeFileSync(mockFile, content, "utf8")
  // Use file:// URL — the installer uses native fetch which supports file:// in Node.js 18+
  // But since we need it to work in the installer, we'll use a local http server approach
  // Actually, we'll use a local file path with file:// protocol
  return `file://${mockFile}`
}

// Helper: run the installer in a given cwd with mocked network
interface RunResult {
  stdout: string
  stderr: string
  status: number | null
}

function runInstaller(
  args: string[],
  cwd: string,
  mockSourceUrl: string,
  stdinInput?: string,
): RunResult {
  const result = spawnSync("node", [INSTALLER, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      INSTALL_SOURCE_URL: mockSourceUrl,
    },
    input: stdinInput,
    timeout: 10000,
  })

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    status: result.status,
  }
}

describe("bin/install.js — installer integration tests", () => {
  let tmpDir: string
  let mockSourceUrl: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "opencopilot-test-"))
    // Write mock plugin file into the tmp dir
    const mockFile = join(tmpDir, "mock-opencopilot.ts")
    writeFileSync(mockFile, MOCK_PLUGIN_CONTENT, "utf8")
    mockSourceUrl = `file://${mockFile}`
  })

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors
    }
  })

  it("1. Fresh install: file written, exit 0, success message", () => {
    const result = runInstaller(["install"], tmpDir, mockSourceUrl)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("✓ Installed opencopilot v")
    expect(result.stdout).toContain(".opencode/plugins/opencopilot.ts")

    const pluginPath = join(tmpDir, ".opencode", "plugins", "opencopilot.ts")
    expect(existsSync(pluginPath)).toBe(true)
    const content = readFileSync(pluginPath, "utf8")
    expect(content).toContain("opencopilot")
  })

  it("2. Overwrite prompt — user says n: file unchanged, exit 0, Skipped message", () => {
    // Pre-create the plugin file
    const pluginDir = join(tmpDir, ".opencode", "plugins")
    mkdirSync(pluginDir, { recursive: true })
    const pluginPath = join(pluginDir, "opencopilot.ts")
    const originalContent = "// original content\n"
    writeFileSync(pluginPath, originalContent, "utf8")

    // Pipe "n" as stdin — non-interactive mode defaults to N
    const result = runInstaller(["install"], tmpDir, mockSourceUrl, "n\n")

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Skipped")

    // File should be unchanged
    const content = readFileSync(pluginPath, "utf8")
    expect(content).toBe(originalContent)
  })

  it("3. Overwrite prompt — non-interactive stdin defaults to N: file unchanged, exit 0", () => {
    // Pre-create the plugin file with older version
    const pluginDir = join(tmpDir, ".opencode", "plugins")
    mkdirSync(pluginDir, { recursive: true })
    const pluginPath = join(pluginDir, "opencopilot.ts")
    // Write an older version so the up-to-date check doesn't skip
    const originalContent = `// opencopilot v0.9.0\n// old content\n`
    writeFileSync(pluginPath, originalContent, "utf8")

    // When stdin is piped (non-TTY), the installer defaults to "N"
    // This is the correct behavior per cli-interface.md: "defaults to N in non-interactive mode"
    const result = runInstaller(["install"], tmpDir, mockSourceUrl)

    // Non-TTY → defaults to N → skip
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Skipped")

    // File should be unchanged
    const content = readFileSync(pluginPath, "utf8")
    expect(content).toBe(originalContent)
  })

  it("4. --force flag: file exists, overwritten without prompting, exit 0", () => {
    // Pre-create the plugin file
    const pluginDir = join(tmpDir, ".opencode", "plugins")
    mkdirSync(pluginDir, { recursive: true })
    const pluginPath = join(pluginDir, "opencopilot.ts")
    writeFileSync(pluginPath, "// old content\n", "utf8")

    const result = runInstaller(["install", "--force"], tmpDir, mockSourceUrl)

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("✓ Installed opencopilot v")

    const content = readFileSync(pluginPath, "utf8")
    expect(content).toContain("opencopilot")
    expect(content).not.toBe("// old content\n")
  })

  it("5. Symlink at target: exit 1, stderr contains 'symlink'", () => {
    // Create a symlink at the target path
    const pluginDir = join(tmpDir, ".opencode", "plugins")
    mkdirSync(pluginDir, { recursive: true })
    const pluginPath = join(pluginDir, "opencopilot.ts")
    // Create a real file to point to
    const targetFile = join(tmpDir, "real-file.ts")
    writeFileSync(targetFile, "// real file\n", "utf8")
    symlinkSync(targetFile, pluginPath)

    const result = runInstaller(["install"], tmpDir, mockSourceUrl)

    expect(result.status).toBe(1)
    expect(result.stderr.toLowerCase()).toContain("symlink")
  })

  it("6. Missing parent dirs: .opencode/plugins/ created automatically, file written", () => {
    // Ensure no .opencode directory exists
    const opencodePath = join(tmpDir, ".opencode")
    expect(existsSync(opencodePath)).toBe(false)

    const result = runInstaller(["install"], tmpDir, mockSourceUrl)

    expect(result.status).toBe(0)

    const pluginPath = join(tmpDir, ".opencode", "plugins", "opencopilot.ts")
    expect(existsSync(pluginPath)).toBe(true)
  })

  it("7. .opencode/package.json creation: no pre-existing file → created with both deps", () => {
    const result = runInstaller(["install"], tmpDir, mockSourceUrl)

    expect(result.status).toBe(0)

    const pkgPath = join(tmpDir, ".opencode", "package.json")
    expect(existsSync(pkgPath)).toBe(true)

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies).toBeDefined()
    expect(pkg.dependencies["@opencode-ai/plugin"]).toBeDefined()
    expect(pkg.dependencies["js-yaml"]).toBeDefined()
  })

  it("8. .opencode/package.json merge: existing file preserved, missing deps added", () => {
    // Create .opencode directory with a pre-existing package.json
    const opencodeDir = join(tmpDir, ".opencode")
    mkdirSync(opencodeDir, { recursive: true })
    const pkgPath = join(opencodeDir, "package.json")
    const existing = {
      name: "my-project",
      dependencies: {
        "some-other-dep": "^1.0.0",
      },
    }
    writeFileSync(pkgPath, JSON.stringify(existing, null, 2) + "\n", "utf8")

    const result = runInstaller(["install"], tmpDir, mockSourceUrl)

    expect(result.status).toBe(0)

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      name: string
      dependencies: Record<string, string>
    }
    // Existing keys preserved
    expect(pkg.name).toBe("my-project")
    expect(pkg.dependencies["some-other-dep"]).toBe("^1.0.0")
    // New deps added
    expect(pkg.dependencies["@opencode-ai/plugin"]).toBeDefined()
    expect(pkg.dependencies["js-yaml"]).toBeDefined()
  })

  it("9. Network error: bad URL → exit 1, stderr contains fallback URL", () => {
    // Use an invalid URL to simulate network error
    const badUrl = "https://invalid.example.invalid/nonexistent.ts"

    const result = runInstaller(["install"], tmpDir, badUrl)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("github.com/anomalyco/opencode-plugins/releases/latest/download/opencopilot.ts")
  })

  it("10. Already up to date: same version banner → exit 0, 'up to date' message, file unchanged", () => {
    // Pre-create the plugin file with the same version as the mock source
    const pluginDir = join(tmpDir, ".opencode", "plugins")
    mkdirSync(pluginDir, { recursive: true })
    const pluginPath = join(pluginDir, "opencopilot.ts")
    writeFileSync(pluginPath, MOCK_PLUGIN_CONTENT, "utf8")

    const result = runInstaller(["install"], tmpDir, mockSourceUrl)

    expect(result.status).toBe(0)
    expect(result.stdout.toLowerCase()).toContain("up to date")

    // File should be unchanged
    const content = readFileSync(pluginPath, "utf8")
    expect(content).toBe(MOCK_PLUGIN_CONTENT)
  })
})
