# Claude-Org

A personal organization system built on Claude Code. Local-first markdown files, a stop hook that enforces session hygiene, and a bundled document viewer that gives you a full interface without any cloud dependency.

![Org Viewer Dashboard](screenshots/org-viewer-dashboard.png)

---

## What It Is

A structured workspace that Claude Code can orient to quickly. You fill in your voice, projects, and working style once. After that, Claude always arrives knowing who you are, what you're working on, and how you like to collaborate.

Three things make it work:

1. **Architecture as memory** — continuity lives in flat files, not in Claude's context. Any session picks up where the last one left off.
2. **Stop hook** — before every session ends, Claude evaluates what should be captured, updated, or created. Maintenance becomes automatic rather than disciplined.
3. **Org viewer** — a native document browser included in this repo. Run it, and you get a full TUI interface for browsing, editing, and searching your org.

---

## Prerequisites

- [Claude Code](https://claude.ai/code) — the CLI that powers this system
- Python 3.10+ — for the hooks
- Windows, macOS, or Linux

---

## Quick Start

```
1. Clone this repo
2. Run org-viewer.exe (or open the folder in Claude Code directly)
3. Start Claude Code in this directory and paste the init prompt below
```

### The Init Prompt

Copy and paste this into Claude Code to begin setup:

```
Let's set up this organization system. Read through CLAUDE.md and the onboarding
playbook (ONBOARDING.md), then walk me through the full setup. Ask me questions,
help me fill in my voice and project docs, install the hooks, and clean up the
scaffolding when we're done.
```

That's it. Claude will guide you through the rest.

---

## What You Get

### Document Structure

```
├── context/        — voice, projects, current state (who you are + what matters)
├── tasks/          — active work with semantic status tracking
├── inbox/          — captures, decisions, ideas, investigations
├── knowledge/      — distilled insights, organized by domain
├── projects/       — larger efforts with their own structure
├── reminders/      — time-based reminders
└── setup/          — hooks, agents, and installation scripts
```

### Org Viewer

A native document browser bundled in this repo. No installation, no configuration — double-click and it runs.

![Graph View](screenshots/org-viewer-graph.png)

- Browse all documents with keyboard navigation (`1`–`7` for views)
- Full-text search across your entire org
- Graph view showing document connections via wikilinks
- Edit documents directly in the viewer
- Reminders view with status filtering
- Theme cycling with `t`

[Full documentation](ORG-VIEWER.md) | [Source](https://github.com/vincitamore/org-viewer)

### Maintenance Hook

The stop hook is the immune system of the org. Before Claude ends any session, it evaluates:

- New reusable insights → `knowledge/`
- Project status changes → `context/current-state.md`
- New tasks to create → `tasks/`
- Friction or ADHD pain → `inbox/decisions/` (for future improvement)

Without the hook, maintenance depends on remembering to do it. With it, maintenance happens automatically.

### Specialized Agents

Optional subagent configurations in `setup/agents/`:

| Agent | Purpose |
|-------|---------|
| `architect` | Design and architectural planning |
| `reviewer` | Code review + principle alignment |
| `distiller` | Extract knowledge worth capturing |
| `explorer` | Deep codebase/org understanding |
| `observer` | Weekly audit: gaps, orphans, improvement proposals |
| `qa-reviewer` | Verify acceptance criteria at runtime |

---

## Setup Details

### Hooks (Essential)

The stop hook enforces session hygiene automatically. Run the installer:

```bash
python setup/install.py
```

This copies hooks to `~/.claude/hooks/` and prints the settings.json configuration you need to add. See [setup/README.md](setup/README.md) for manual installation steps.

### Agents (Optional)

Copy agent definitions to `~/.claude/agents/`. See [setup/README.md](setup/README.md) for the JSON wrapper format.

### Obsidian (Alternative Viewer)

If you prefer Obsidian over the bundled viewer, this workspace opens as an Obsidian vault. See [setup/obsidian/README.md](setup/obsidian/README.md).

---

## Remote Access

Install [Tailscale](https://tailscale.com/download) and run the org viewer — you can browse your org from a phone or any device on your Tailscale network.

---

## Customization

This system is scaffolding, not scripture. The only load-bearing constraint is frontmatter consistency — the YAML at the top of each file is what the viewer and hooks use to parse state. As long as files have valid frontmatter with `type`, `status`, `created`, and `tags`, everything works.

Everything else: folder names, principles, tag taxonomy, inbox categories, hook behavior — change it to fit how you actually think and work.

---

## Philosophy

The key insight: Claude doesn't persist memory between sessions, but a well-structured workspace creates an *attractor basin* — terrain shaped by consistent thinking that any Claude instance can orient to quickly. The more thoughtfully you shape your context files, the faster Claude finds its footing.

Full system documentation: [CLAUDE.md](CLAUDE.md)
