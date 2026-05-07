/**
 * Unit tests for disable-model-invocation handling
 * Tests: T026/T027 (US3) — mapper-disable.test.ts
 */

import { describe, it, expect, beforeAll } from "bun:test"
import path from "node:path"
import { toOpenCodeAgent } from "../../src/mapper.ts"
import { scanAgentFiles } from "../../src/scanner.ts"
import type { CopilotAgentDefinition } from "../../src/types.ts"

// Helper to create a minimal CopilotAgentDefinition
function makeAgent(overrides: Partial<CopilotAgentDefinition> = {}): CopilotAgentDefinition {
  return {
    filePath: "/fake/.github/agents/test.md",
    rawName: "test",
    name: "test",
    normalizedKey: "test",
    description: "A test agent",
    systemPrompt: "You are a test agent.",
    model: null,
    tools: null,
    userInvocable: true,
    disableModelInvocation: false,
    target: null,
    ...overrides,
  }
}

describe("toOpenCodeAgent() - disable-model-invocation", () => {
  it("sets hidden: false when disableModelInvocation=false and userInvocable=true", () => {
    const agent = makeAgent({ disableModelInvocation: false, userInvocable: true })
    const config = toOpenCodeAgent(agent)
    expect(config.hidden).toBe(false)
  })

  it("sets hidden: true when disableModelInvocation=true (overrides userInvocable=true)", () => {
    const agent = makeAgent({ disableModelInvocation: true, userInvocable: true })
    const config = toOpenCodeAgent(agent)
    expect(config.hidden).toBe(true)
  })

  it("sets hidden: true when disableModelInvocation=false and userInvocable=false", () => {
    const agent = makeAgent({ disableModelInvocation: false, userInvocable: false })
    const config = toOpenCodeAgent(agent)
    expect(config.hidden).toBe(true)
  })

  it("sets hidden: true when both disableModelInvocation=true and userInvocable=false", () => {
    const agent = makeAgent({ disableModelInvocation: true, userInvocable: false })
    const config = toOpenCodeAgent(agent)
    expect(config.hidden).toBe(true)
  })

  it("disable-model-invocation takes precedence over user-invocable", () => {
    // Even if user-invocable: true, disable-model-invocation: true forces hidden
    const agentWithDisable = makeAgent({ disableModelInvocation: true, userInvocable: true })
    const configWithDisable = toOpenCodeAgent(agentWithDisable)
    expect(configWithDisable.hidden).toBe(true)

    const agentWithout = makeAgent({ disableModelInvocation: false, userInvocable: true })
    const configWithout = toOpenCodeAgent(agentWithout)
    expect(configWithout.hidden).toBe(false)
  })

  it("preserves other fields correctly when disableModelInvocation=true", () => {
    const agent = makeAgent({
      disableModelInvocation: true,
      description: "Test agent",
      systemPrompt: "Do things",
    })
    const config = toOpenCodeAgent(agent)
    expect(config.description).toBe("Test agent")
    expect(config.prompt).toBe("Do things")
    expect(config.mode).toBe("subagent")
    expect(config.hidden).toBe(true)
  })
})

describe("scanAgentFiles() - disable-model-invocation parsing", () => {
  const FIXTURE_GITHUB = path.resolve(import.meta.dir, "../fixtures/sample-github")
  let agents: CopilotAgentDefinition[]

  beforeAll(async () => {
    agents = await scanAgentFiles(FIXTURE_GITHUB)
  })

  it("parses disable-model-invocation: true from agent frontmatter", () => {
    const hiddenAgent = agents.find((a) => a.rawName === "hidden-agent")
    expect(hiddenAgent).toBeDefined()
    expect(hiddenAgent!.disableModelInvocation).toBe(true)
  })

  it("defaults disableModelInvocation to false when field is absent", () => {
    const securityAuditor = agents.find((a) => a.rawName === "security-auditor")
    expect(securityAuditor).toBeDefined()
    expect(securityAuditor!.disableModelInvocation).toBe(false)
  })

  it("disableModelInvocation=false does not force hidden when userInvocable=true", () => {
    const securityAuditor = agents.find((a) => a.rawName === "security-auditor")
    expect(securityAuditor).toBeDefined()
    const config = toOpenCodeAgent(securityAuditor!)
    expect(config.hidden).toBe(false)
  })

  it("disableModelInvocation=true forces hidden:true via toOpenCodeAgent, overriding userInvocable=true", () => {
    const hiddenAgent = agents.find((a) => a.rawName === "hidden-agent")
    expect(hiddenAgent).toBeDefined()
    // user-invocable: true but disable-model-invocation: true → hidden: true
    expect(hiddenAgent!.userInvocable).toBe(true)
    const config = toOpenCodeAgent(hiddenAgent!)
    expect(config.hidden).toBe(true)
  })

  it("userInvocable=false sets hidden:true (existing behavior)", () => {
    const notInvocable = agents.find((a) => a.rawName === "not-invocable")
    expect(notInvocable).toBeDefined()
    expect(notInvocable!.userInvocable).toBe(false)
    const config = toOpenCodeAgent(notInvocable!)
    expect(config.hidden).toBe(true)
  })
})
