# Quickstart: OpenCopilot Plugin

**Feature**: `001-copilot-opencode-adapter`
**Date**: 2026-05-02

This guide describes how a developer installs and verifies the OpenCopilot plugin.

---

## Prerequisites

- OpenCode installed and working in the target project
- A project with a `.github/` directory containing Copilot customization files (at least
  one of: `copilot-instructions.md`, `instructions/`, `agents/`, `skills/`)

---

## Installation

1. Copy (or symlink) the plugin file into your project's OpenCode plugins directory:

   ```bash
   mkdir -p .opencode/plugins
   cp opencopilot.ts .opencode/plugins/
   # OR, if using the npm package (future):
   # echo '{"plugin":["opencode-opencopilot"]}' >> opencode.json
   ```

2. Start an OpenCode session:

   ```bash
   opencode
   ```

3. Verify the startup log includes:

   ```
   [opencopilot] Loaded: N instruction files, M agents, K skills from .github/
   ```

---

## Verifying Instructions Are Loaded

1. Create `.github/copilot-instructions.md` with a distinctive phrase:

   ```markdown
   Always end every response with the phrase: "OpenCopilot active."
   ```

2. Start an OpenCode session and ask any question.

3. **Expected**: Every response ends with "OpenCopilot active."

---

## Verifying Agents Are Available

1. Create `.github/agents/code-reviewer.md`:

   ```markdown
   ---
   description: Reviews code for quality and security issues
   ---

   You are a code reviewer. Focus on security, performance, and correctness.
   Provide specific, actionable feedback.
   ```

2. Start an OpenCode session.

3. Type `@code-reviewer` in the chat — the agent should appear in autocomplete.

4. **Expected**: Agent responds with the code-reviewer persona.

---

## Verifying Skills Are Bridged

1. Create `.github/skills/git-release/SKILL.md`:

   ```markdown
   ---
   name: git-release
   description: Create consistent releases and changelogs
   ---

   ## What I do
   Draft release notes from merged PRs and propose a version bump.
   ```

2. Start an OpenCode session and ask: "Help me create a release using the git-release skill."

3. **Expected**: The agent acknowledges the skill and uses its instructions.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| No startup log line | Plugin file not found or syntax error | Check `.opencode/plugins/opencopilot.ts` exists; check Bun for errors |
| "0 instruction files" in log | `.github/copilot-instructions.md` missing or empty | Verify file exists and is non-empty |
| Agent not in `@` autocomplete | Agent file missing `description` field | Add `description` to agent frontmatter |
| Skill not found | `name` field in SKILL.md doesn't match directory name | Ensure `name: my-skill` in `.github/skills/my-skill/SKILL.md` |
| Instructions not appearing in responses | `applyTo` glob too narrow | Try `applyTo: "**/*"` or check glob syntax |
