/**
 * Integration tests for hook bridging
 * Tests: T022 (US2) — hooks-bridge.test.ts
 *
 * Tests end-to-end hook recognition and bridging from .github/hooks/*.json
 * to OpenCode plugin events.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { scanHookFiles } from "../../src/scanner.ts"
import { scanGithubDir } from "../../src/scanner.ts"
import type { CopilotHookDefinition } from "../../src/types.ts"

describe("Hook bridging - end-to-end recognition", () => {
  let tmpDir: string
  let hooksDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-hooks-test-"))
    hooksDir = path.join(tmpDir, "hooks")
    await mkdir(hooksDir)

    // Create test hook files
    await writeFile(
      path.join(hooksDir, "onChatStart.json"),
      JSON.stringify({
        event: "onChatStart",
        script: "echo 'Chat session started'",
        description: "Runs when a new chat session begins",
      }),
    )

    await writeFile(
      path.join(hooksDir, "onFileSave.json"),
      JSON.stringify({
        event: "onFileSave",
        description: "Tracks file save events",
      }),
    )

    await writeFile(
      path.join(hooksDir, "onCodeReview.json"),
      JSON.stringify({
        event: "onCodeReview",
        script: "run-code-review.sh",
        description: "Code review automation",
      }),
    )
  })

  it("scans and recognizes onChatStart hook", async () => {
    const hooks = await scanHookFiles(tmpDir)
    const chatStart = hooks.find((h) => h.event === "onChatStart")
    expect(chatStart).toBeDefined()
    expect(chatStart!.event).toBe("onChatStart")
    expect(chatStart!.script).toBe("echo 'Chat session started'")
    expect(chatStart!.description).toBe("Runs when a new chat session begins")
  })

  it("scans and recognizes onFileSave hook", async () => {
    const hooks = await scanHookFiles(tmpDir)
    const fileSave = hooks.find((h) => h.event === "onFileSave")
    expect(fileSave).toBeDefined()
    expect(fileSave!.event).toBe("onFileSave")
    expect(fileSave!.script).toBeNull()
  })

  it("scans and recognizes onCodeReview hook", async () => {
    const hooks = await scanHookFiles(tmpDir)
    const codeReview = hooks.find((h) => h.event === "onCodeReview")
    expect(codeReview).toBeDefined()
    expect(codeReview!.event).toBe("onCodeReview")
    expect(codeReview!.script).toBe("run-code-review.sh")
  })

  it("hook definitions are included in PluginCache after scanGithubDir", async () => {
    const cache = await scanGithubDir(tmpDir)
    expect(cache.initialized).toBe(true)
    expect(Array.isArray(cache.hooks)).toBe(true)
    expect(cache.hooks.length).toBeGreaterThanOrEqual(3)
  })

  it("PluginCache hooks include all hook event types", async () => {
    const cache = await scanGithubDir(tmpDir)
    const events = cache.hooks.map((h) => h.event)
    expect(events).toContain("onChatStart")
    expect(events).toContain("onFileSave")
    expect(events).toContain("onCodeReview")
  })

  it("cleanup: removes temp dir", async () => {
    await rm(tmpDir, { recursive: true })
    // Just verify cleanup doesn't throw
    expect(true).toBe(true)
  })
})

describe("Hook bridging - prompt file end-to-end flow (T033)", () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-prompt-flow-"))
    const promptsDir = path.join(tmpDir, "prompts")
    await mkdir(promptsDir)

    await writeFile(
      path.join(promptsDir, "test.prompt.md"),
      "---\nmode: instruction\ndescription: Test prompt for integration\n---\n\nThis is test prompt content for integration testing.",
    )
  })

  it("prompt files are included in PluginCache after scanGithubDir", async () => {
    const cache = await scanGithubDir(tmpDir)
    expect(cache.initialized).toBe(true)
    expect(Array.isArray(cache.prompts)).toBe(true)
    expect(cache.prompts.length).toBe(1)
  })

  it("prompt file content is accessible from cache", async () => {
    const cache = await scanGithubDir(tmpDir)
    const prompt = cache.prompts[0]
    expect(prompt).toBeDefined()
    expect(prompt.content).toContain("test prompt content for integration testing")
    expect(prompt.mode).toBe("instruction")
    expect(prompt.description).toBe("Test prompt for integration")
  })

  it("cleanup: removes temp dir", async () => {
    await rm(tmpDir, { recursive: true })
    expect(true).toBe(true)
  })
})

describe("Hook bridging - disable-model-invocation end-to-end (T035)", () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-disable-flow-"))
    const agentsDir = path.join(tmpDir, "agents")
    await mkdir(agentsDir)

    await writeFile(
      path.join(agentsDir, "hidden-bot.md"),
      "---\ndescription: Hidden bot agent\ndisable-model-invocation: true\nuser-invocable: true\n---\n\nThis agent should be hidden.",
    )

    await writeFile(
      path.join(agentsDir, "visible-bot.md"),
      "---\ndescription: Visible bot agent\n---\n\nThis agent should be visible.",
    )
  })

  it("agent with disable-model-invocation: true is scanned with disableModelInvocation=true", async () => {
    const cache = await scanGithubDir(tmpDir)
    const hiddenBot = cache.agents.get("hidden-bot")
    expect(hiddenBot).toBeDefined()
    expect(hiddenBot!.disableModelInvocation).toBe(true)
  })

  it("agent without disable-model-invocation has disableModelInvocation=false", async () => {
    const cache = await scanGithubDir(tmpDir)
    const visibleBot = cache.agents.get("visible-bot")
    expect(visibleBot).toBeDefined()
    expect(visibleBot!.disableModelInvocation).toBe(false)
  })

  it("cleanup: removes temp dir", async () => {
    await rm(tmpDir, { recursive: true })
    expect(true).toBe(true)
  })
})

describe("Hook bridging - model normalization end-to-end (T034)", () => {
  let tmpDir: string

  beforeAll(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "opencopilot-model-flow-"))
    const agentsDir = path.join(tmpDir, "agents")
    await mkdir(agentsDir)

    await writeFile(
      path.join(agentsDir, "gpt-agent.md"),
      "---\ndescription: Agent using gpt-4.1\nmodel: gpt-4.1\n---\n\nI use gpt-4.1.",
    )
  })

  it("agent with model: gpt-4.1 is scanned with model field set", async () => {
    const cache = await scanGithubDir(tmpDir)
    const agent = cache.agents.get("gpt-agent")
    expect(agent).toBeDefined()
    expect(agent!.model).toBe("gpt-4.1")
  })

  it("cleanup: removes temp dir", async () => {
    await rm(tmpDir, { recursive: true })
    expect(true).toBe(true)
  })
})
