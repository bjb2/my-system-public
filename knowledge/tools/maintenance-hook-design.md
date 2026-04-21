---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [claude-code, hooks, maintenance, org-system]
---

# Maintenance Hook Design Patterns

The stop hook is the load-bearing piece of the org system's self-maintenance. Without it, maintenance requires discipline — which means it won't happen consistently.

## What Makes a Good Maintenance Prompt

**Signal→action table is essential.** A generic "anything to update?" invites a reflexive "no." A table that maps each signal type to a specific file location forces Claude to evaluate each category explicitly and removes ambiguity about where things go.

**Session context matters.** Injecting which files were modified and current org stats (active tasks, inbox count) gives Claude concrete evidence to evaluate rather than relying on recall.

**"Be aggressive about capture"** — this line matters. Sets the right posture: default to capturing, not defaulting to no.

## Current Hook Features

- Signal→action routing table with 10 signal types
- Session context: files modified in last 2 hours, live org stats
- Skips trivial sessions (< 15 transcript lines)
- Tight "already answered" detection — only accepts `"No maintenance needed."` as a standalone final line, not buried in conversation text
- Prevents infinite loops via `stop_hook_active` flag

## "No Maintenance Needed" Detection

The hook should only skip if Claude explicitly stated the phrase as a **standalone response**, not if it appears buried in earlier conversation. Check only the last ~1000 chars and require the exact phrase as the last non-empty line.

## Related

- [[claude-code-hook-output-schema]] — valid JSON fields for hook output
- [[stop-hook-system-message]] — displaying custom messages via Stop hook
