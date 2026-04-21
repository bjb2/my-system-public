---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [claude-code, hooks, windows, security, scheduled-tasks]
---

# Claude Code: Hook Blocks Persistence Primitives

## What happens

A security hook intercepts certain PowerShell cmdlets and blocks them with the message:

> `New-ScheduledTaskAction creates or modifies a scheduled task (persistence primitive)`

The command never executes — Claude must provide the command for the user to run manually.

## Blocked cmdlets (known)

- `New-ScheduledTaskAction` — scheduled task registration
- Likely others: `New-ScheduledTaskTrigger`, `Register-ScheduledTask`, registry writes, startup folder shortcuts

## Workaround

Present the full PowerShell block to the user with explanation, so they can paste it into their own terminal. The hook only applies to Claude's tool execution, not the user's shell.

## Recommended Task Scheduler pattern for startup apps

```powershell
$action = New-ScheduledTaskAction -Execute "C:\path\to\app.exe" -WorkingDirectory "C:\path\to\"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "AppName" -Action $action -Trigger $trigger -Settings $settings -RunLevel Limited -Description "..." -Force
```

Key flags beyond the minimal example:
- `-WorkingDirectory` — critical if the exe resolves relative paths at runtime
- `ExecutionTimeLimit 0` — prevents Windows killing a long-running process
- `MultipleInstances IgnoreNew` — prevents double-launch on re-logon

## Related

- [claude-code-permissions-allowlist.md](claude-code-permissions-allowlist.md) — allowlist for tool permissions (separate mechanism)

<!-- orphan: 0 inbound links as of 2026-04-20 -->
