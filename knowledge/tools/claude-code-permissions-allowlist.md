---
type: knowledge
created: 2026-04-17
updated: 2026-04-16
tags: [claude-code, permissions, swarm]
---

# Claude Code: Permission Allowlist (Middle Ground)

## The three levels

| Mode | How | Use when |
|------|-----|----------|
| Default | Everything prompts | Interactive sessions |
| **Allowlist** | Named tools auto-approved, rest prompts | Agents doing known work |
| `--dangerously-skip-permissions` | Nothing prompts | Fully trusted, fully autonomous |

## Allowlist config

`~/.claude/settings.json` (global) or `.claude/settings.json` (project-level):

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Write",
      "Edit",
      "WebSearch",
      "WebFetch",
      "Bash(git *)",
      "Bash(npm *)",
      "Bash(cargo *)",
      "Bash(npx tsc *)"
    ]
  }
}
```

Pattern format: `"ToolName(glob)"` — `Bash(git *)` allows any git subcommand. `Read` with no args allows all reads.

## Project-level strategy for Swarm agents

Put `.claude/settings.json` in each project repo, tailored to that stack:

- Rust project: allow `cargo *`, `git *`
- JS/TS project: allow `npm *`, `npx tsc *`, `git *`
- Always allow: `Read`, `Write`, `Edit`, `WebSearch`, `WebFetch`
- Don't pre-allow: `rm`, `curl` to unknown hosts, destructive ops

This lets agents work freely on normal coding tasks without `--dangerously-skip-permissions`, while keeping a gate on anything unusual.

## Granting access to directories outside the project root

By default Claude Code (and spawned swarm agents) can only read/write within the current project directory. To allow access to sibling or parent directories, use `additionalDirectories`:

```json
{
  "permissions": {
    "additionalDirectories": [
      "C:/Users/bryan/enclave"
    ]
  }
}
```

This is the correct way to let agents roam across multiple repos under a shared parent (e.g. `enclave/*`). Without it, agents get permission-prompted for every file outside the cwd — or fail silently.

Put this in `.claude/settings.local.json` (gitignored) if the paths are machine-specific.

## Related

- `less-permission-prompts` skill scans transcripts and auto-generates an allowlist
- Project settings override global settings for the same key

<!-- orphan: 0 inbound links as of 2026-04-20 -->
