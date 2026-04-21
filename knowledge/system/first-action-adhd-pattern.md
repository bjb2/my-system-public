---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [adhd, task-schema, activation-energy, system]
---

# first-action: ADHD Activation Energy Pattern

## The Problem

Abstract first steps ("identify...", "research...", "figure out...") never start. The initiation decision itself is the blocker — not the work.

## The Pattern

Add a `first-action:` field to task frontmatter. One physical action, under 2 minutes, requires zero prior decisions.

```yaml
first-action: "Open maps.google.com, search 'church near me San Antonio', paste 3 names into this file"
```

Good first-actions:
- Name a specific URL to open
- Name a specific file to read and what to look for
- Name a specific search query to run
- Paste somewhere specific

Bad first-actions (still abstract):
- "Identify churches..." → still requires a decision
- "Research options..." → where? how?

## When Claude Should Auto-Populate

When creating a task where the first step uses verbs like: *identify, research, figure out, explore, investigate, decide, consider, think about* — automatically populate `first-action:` with the most concrete possible first move.

## Schema

Added to both Starter and Full task frontmatter schemas in CLAUDE.md. Default value is `null` when no concrete first action is defined.

## Origin

Observer agent proposal — noticed that `find-community` and `research-radio-approach` were stuck not for lack of interest but for lack of an obvious starting move.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
