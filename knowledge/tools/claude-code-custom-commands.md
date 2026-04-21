---
type: knowledge
created: 2026-04-16
updated: 2026-04-19
tags: [claude-code, skills, commands, plugins]
---

# Claude Code Custom Commands (Slash Skills)

Project-level slash commands live in `.claude/commands/<name>.md`. Any `.md` file in that directory becomes a `/name` skill invocable in Claude Code sessions.

## How It Works

- File: `.claude/commands/deep-research.md` → invoked as `/deep-research`
- The file content is the system prompt that Claude runs when the skill is invoked
- `$ARGUMENTS` is substituted with anything typed after the command name

```
/deep-research apophatic theology  →  $ARGUMENTS = "apophatic theology"
```

## Scope

- `.claude/commands/` — project-scoped (only available in that working directory)
- `~/.claude/commands/` — user-scoped (available everywhere)

## Skill File Structure

```markdown
You are doing X for: $ARGUMENTS

[Instructions, phases, tools, constraints...]
```

No frontmatter needed. Plain markdown. The entire file is the prompt.

## Invocation Gotcha

The `Skill` tool (available to Claude agents) only knows **built-in** skills — it cannot invoke `.claude/commands/` custom commands. Calling `Skill("deep-research")` fails with "Unknown skill."

Custom commands are only invoked by the **user** typing `/command-name` directly in the Claude Code CLI. When running a custom command protocol inside an agent session, you must execute the protocol manually by reading the command file and following its instructions.

## Plugin Skills (Installed Plugins)

A second, heavier-weight skill system. Plugin skills install into `~/.claude/plugins/` and show in the session-reminder as `plugin:skill` (e.g., `frontend-design:frontend-design`).

### Directory Structure

```
~/.claude/plugins/
  cache/
    <marketplace>/         # e.g., claude-plugins-official, local
      <plugin-name>/
        <version>/
          .claude-plugin/
            plugin.json    # plugin metadata (name, description, author)
          skills/
            <skill-name>/
              SKILL.md     # skill content with YAML frontmatter
  installed_plugins.json   # registry of all installed plugins
```

### SKILL.md Frontmatter

```yaml
---
name: skill-name
description: One-line description shown in session-reminder
license: MIT
metadata:
  author: author-name
---
```

### installed_plugins.json Entry

```json
"plugin-name@marketplace": [
  {
    "scope": "user",
    "installPath": "C:\\Users\\...\\plugins\\cache\\<marketplace>\\<plugin>\\<version>",
    "version": "1.0.0",
    "installedAt": "2026-04-19T00:00:00.000Z",
    "lastUpdated": "2026-04-19T00:00:00.000Z"
  }
]
```

### Creating a Local Plugin

Use `local` as the marketplace namespace:

```
cache/local/<plugin-name>/1.0.0/
```

Register as `<plugin-name>@local` in `installed_plugins.json`. Requires a new Claude Code session to pick up.

### Plugin vs. Command Skills

Feature`.claude/commands/*.md`Plugin skillFormatPlain markdownStructured plugin dirScopeUser or projectUserSession-reminderListed by nameListed as `plugin:skill`Install methodDrop fileCreate dir + register JSONMarketplaceN/ANamespace in installed_plugins.json

## Related

- \[\[tools/claude-code-permissions-allowlist\]\] — controlling which tools skills can use
- \[\[tools/claude-code-hook-output-schema\]\] — stop/start hooks that complement skills
<!-- orphan: 0 inbound links as of 2026-04-20 -->
