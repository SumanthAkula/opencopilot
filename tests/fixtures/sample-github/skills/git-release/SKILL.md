---
name: git-release
description: Create consistent releases and changelogs
license: MIT
---

## What I do

- Draft release notes from merged PRs since the last tag
- Propose a semantic version bump (MAJOR/MINOR/PATCH) based on commit types
- Provide a copy-pasteable `gh release create` command

## When to use me

Use this skill when preparing a tagged release for a project.
Ask clarifying questions if the target versioning scheme is unclear.

## Steps

1. Run `git log <last-tag>..HEAD --oneline` to gather commits
2. Categorize: breaking changes → MAJOR, features → MINOR, fixes → PATCH
3. Draft release notes in Keep a Changelog format
4. Output the `gh release create vX.Y.Z` command
