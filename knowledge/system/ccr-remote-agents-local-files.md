---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [claude-code, ccr, scheduling, sovereignty]
---

# CCR Remote Agents Cannot Access Local Files

## The Constraint

Claude Code's scheduled remote triggers (CCR — Claude Code Remote) run in Anthropic's cloud infrastructure. They have **no access to local machine files, local environment variables, or local services**.

This means: if your system relies on local markdown files (e.g. a local-first org system), a remote CCR agent cannot read or write those files.

## Symptom

You try to schedule an agent to "read context files and write proposals to inbox/" — but the agent would clone a GitHub repo instead, write there, and the files never appear locally.

## The Right Fix for Local-First Systems

Use **Windows Task Scheduler** (or cron on Linux/Mac) to run Claude Code locally on a schedule:

```powershell
# Example: run observer prompt every Sunday at 9am
schtasks /create /tn "ClaudeObserver" /tr "powershell -File C:\path\to\run-observer.ps1" /sc weekly /d SUN /st 09:00
```

The launcher script invokes `claude --print` with the observer prompt, with the working directory set to the org root.

## When Remote CCR Is Appropriate

- The task operates on a GitHub repo (read code, open PRs, run tests)
- No local file access needed
- The repo is connected via Claude GitHub App or `/web-setup`

## Related

- [recursive-self-learning.md](recursive-self-learning.md) — observer architecture (uses local Task Scheduler, not CCR)
