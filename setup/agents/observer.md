# Observer Agent

> Delta-gated autonomous maintenance agent. Scans for changes, plans actions via Opus, executes focused recipes via Sonnet. Runs on a schedule with no prompting required.

## How It Works

The observer runs as a **two-tier system** via `setup/scripts/run-observer.ps1`:

1. **Delta scan** — checks if anything meaningful changed since last run (git hash, inbox mtime, tasks mtime). If no delta and not a 24hr catch-all, only light actions run.
2. **Planning pass (Opus)** — given the delta context and remaining budget, Opus outputs a JSON action list.
3. **Execution pass (Sonnet)** — each action is a focused `claude --print` call with a recipe prompt from `setup/recipes/`.

## Action Tiers

**Heavy** (run only with delta or 24hr catch-all):
- `knowledge-gap-scan` — scan recently completed tasks for missing KB articles
- `knowledge-consolidation` — find and merge near-duplicate KB articles
- `inbox-triage` — process inbox items older than 7 days
- `project-health` — audit active tasks for stale/blocked/shadow-completed
- `orphan-scan` — find KB articles with 0 inbound links, propose cross-links

**Light** (always eligible — read-only, fast):
- `inbox-age-report` — list inbox items by age tier
- `completed-task-harvest` — flag completed tasks needing KB articles
- `frontmatter-lint` — find files missing required frontmatter fields
- `kb-link-density` — tag KB orphans with a comment
- `kb-readme-reconcile` — check knowledge subfolder README counts

## Budget + Cooldown

- **Daily budget**: 8 actions/day (resets at midnight)
- **Cooldown**: 2hr minimum between cycles
- State tracked in `setup/observer/last-run.json`

## Execute vs. Propose Boundary

- **Direct execution**: additive, low-risk actions (new articles, reports, tag appends)
- **Write proposals** to `inbox/decisions/`: anything destructive — merging existing content, architectural changes, touching task/project state

## Agent Definition

```json
{
  "name": "observer",
  "model": "sonnet",
  "description": "Delta-gated maintenance agent: scans for changes, runs focused recipe actions, writes proposals for anything requiring approval",
  "instructions": "You are the observer agent for this personal organization system. Your role is to execute the specific recipe action you've been given — then write concrete proposals to inbox/decisions/ for anything that would require the user's approval. You do NOT make architectural decisions or modify existing content without a proposal. Be specific and scoped. A good proposal has a clear problem, a clear solution, and a realistic effort estimate. Do not generate more than 3 proposals per run. Prefer high-impact, low-effort items. Do not duplicate existing inbox/decisions/ items."
}
```

## Installation

```powershell
# Register as a daily scheduled task (runs at 9:00 AM)
schtasks /Create /TN "ClaudeOrg\ObserverAgent" /TR "powershell.exe -NonInteractive -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-observer.ps1`"" /SC DAILY /ST 09:00 /F

# Verify
schtasks /Query /TN "ClaudeOrg\ObserverAgent" /V /FO LIST

# Run immediately
schtasks /Run /TN "ClaudeOrg\ObserverAgent"
```

Or run manually: `.\setup\scripts\run-observer.ps1`

Logs write to `setup/logs/observer-YYYY-MM-DD.log`.

## Proposal Lifecycle

```
observer executes recipe → writes report or KB article directly
                        ↓ (for destructive/architectural changes)
             inbox/decisions/<proposal>.md
                        ↓
          User reviews in org-viewer (Decisions view)
                        ↓
          Approve → Swarm agent builds it
                        ↓
          Archive decision to archive/research/
```

## Adding New Actions

1. Add a recipe file to `setup/recipes/` (heavy) or `setup/recipes/light/` (light)
2. The observer's planning pass will see it in the action list automatically
3. No script changes needed

## Related

- [run-observer.ps1](../scripts/run-observer.ps1) — the actual implementation
- [distiller.md](distiller.md) — knowledge capture (different concern: what to remember vs. what to improve)
- [architect.md](architect.md) — called by Swarm when implementing approved proposals
- [../hooks/maintenance-check.py](../hooks/maintenance-check.py) — session-end hook that also surfaces proposals
- [../../knowledge/system/delta-gated-agent-maintenance.md](../../knowledge/system/delta-gated-agent-maintenance.md) — pattern reference
- [../../knowledge/system/recursive-self-learning.md](../../knowledge/system/recursive-self-learning.md) — higher-level architecture
