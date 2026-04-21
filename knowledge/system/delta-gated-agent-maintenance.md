---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [automation, observer, agent-orchestration, #sovereignty]
---

# Delta-Gated Two-Tier Agent Maintenance

Pattern for building an autonomous maintenance agent that self-regulates cost, avoids wasted runs, and executes focused actions rather than open-ended sessions.

## The Pattern

**Planning tier** (expensive model, fast): given delta context + run history, output a JSON action list. Cheap because it's just reasoning, not execution.

**Execution tier** (capable model, per-action): each action is a focused `claude --print` invocation with a specific recipe prompt. One action = one invocation = one log entry.

## Delta Gating

Before any planning, scan for meaningful changes since last run:

- Git HEAD hash changed
- Key directories have newer mtime than last-run timestamp
- Time elapsed &gt;= 24hr (catch-all override)

If no delta AND not catch-all: skip heavy recipes, still run light actions (fast/cheap).

## Budget + Cooldown

Track actions in a `last-run.json` state file:

- Daily budget cap (e.g., 8 actions/day)
- Cooldown minimum between cycles (e.g., 2hr)
- Budget resets at midnight (check `actionsDate` field)

## Recipe Files

Each action is a standalone `.md` file containing the full `claude --print` prompt. This means:

- Any recipe can be triggered manually in a session
- Recipes are readable/editable without touching the script
- Adding a new action = add a recipe file, no script changes

## Two Action Tiers

**Heavy** (run only with delta or catch-all): write/merge/restructure content — knowledge articles, inbox triage, project health audit.

**Light** (always eligible): read-only outputs — age reports, lint reports, orphan tagging. Never modify existing content, only append or create new captures/.

## Proposal vs. Execute Boundary

Execute directly for additive, low-risk actions (new articles, tag appends, report writes). Write proposals (inbox/decisions/) for anything destructive: merging existing content, architectural changes, touching project/task state.

## File Structure

```
setup/
  observer/
    last-run.json   # { lastRunTime, lastGitHash, actionsToday, actionsDate }
    plan.json       # current cycle plan (survives restart)
  recipes/
    <action>.md     # heavy recipe prompts
    light/
      <action>.md   # light action prompts
  scripts/
    run-observer.ps1  # delta scan → Opus plan → Sonnet execute loop
```

## Applied In

- `setup/scripts/run-observer.ps1` — org maintenance observer (2026-04-20)
- Decision: `inbox/decisions/observer-dream-cycle-upgrade.md`

## Related

- \[\[recursive-self-learning\]\] — higher-level architecture this pattern implements
- \[\[maintenance-hook-design\]\] — stop-hook patterns that feed proposals into this pipeline