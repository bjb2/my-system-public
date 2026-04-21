---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [meta, adhd-support, automation, observer]
---

# Recursive Self-Learning Architecture

The system improves itself over time with minimal prompting. Three mechanisms feed the proposal pipeline; one approval gesture triggers the build.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   OBSERVATION LAYER                       │
│                                                          │
│  [Observer Agent]       [Stop Hook]         [Manual]     │
│  runs weekly            runs each session   anytime      │
│  reads full context     scans for friction  "propose X"  │
│       └──────────────────────┴──────────────┘           │
│                              ↓                           │
│                   inbox/decisions/<proposal>.md          │
└──────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────┐
│                   APPROVAL LAYER                          │
│                                                          │
│   User reviews in org-viewer → Approve ❯ button         │
│   Swarm spawns Claude agent with decision as context     │
└──────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────┐
│                    BUILD LAYER                            │
│                                                          │
│   Swarm agent implements the proposal                    │
│   Archives decision to archive/research/                 │
│   Updates current-state.md with what changed            │
└──────────────────────────────────────────────────────────┘
```

## Observation Layer

### Observer Agent (scheduled weekly)

- Reads all context files + active tasks + knowledge gaps
- Applies ADHD and system lenses (see `setup/agents/observer.md`)
- Writes 1-3 scoped proposals per run
- Sunday 9am by default

### Stop Hook (every session)

- Already runs on every session end
- Now includes improvement scan: friction, aversion, missing externalizations
- Writes proposals to `inbox/decisions/` same as observer

### Manual

- Any session: "write a proposal for X to inbox/decisions/"
- Or just describe friction and let the session handle capture

## Proposal Schema

```yaml
---
type: inbox
created: YYYY-MM-DD
source: observer | session | manual
priority: high | medium | low
effort: small | medium | large   # small < 2h, medium < half-day, large > half-day
area: adhd-support | org-system | project | knowledge | automation
---
```

## ADHD Lenses the Observer Applies

Drawn from [borretti.me/article/notes-on-managing-adhd](https://borretti.me/article/notes-on-managing-adhd):

PatternWhat to look forMissing externalizationState living in memory rather than filesHigh activation energyTasks repeatedly deferred without clear reasonInterrupt vs. pollReactive workflows that could be scheduledOut-of-sight = forgottenVisibility principle violationsWillpower dependencySystems that require discipline rather than architectureThrashingFriction that scatters focus across multiple blocked itemsDecision paralysisDecisions accumulating without a clear processing path

## Approval Flow

1. Proposals appear in org-viewer Decisions pane
2. "Approve ❯" button spawns a Swarm agent with the decision as context
3. Swarm agent implements the proposal
4. Archive decision file to `archive/research/`

Review proposals in one batch (polling, not interrupts). One decision review session per week is enough.

## Key Design Decisions

**Why proposals, not direct action**?The observer has read-only scope by design. Direct action from a scheduled agent risks building things you don't want. The approval gesture is the control surface — low friction (one click) but present.

**Why weekly observer + per-session hook**?The hook catches session-specific friction (highest signal while fresh). The observer provides a weekly big-picture view with more context than any single session provides.

**Why inbox/decisions/ and not a separate queue**?Single-source principle. The existing decisions folder is already the review queue. The org-viewer already has the Approve ❯ button. No new UI needed.

## Related

- [setup/agents/observer.md](../../setup/agents/observer.md) — observer agent definition and task prompt
- [setup/hooks/maintenance-check.py](../../setup/hooks/maintenance-check.py) — session-end hook with improvement scan
- [context/voice.md](../../context/voice.md) — ADHD management context
- \[\[delta-gated-agent-maintenance\]\] — cost-controlled two-tier implementation of the observer pattern