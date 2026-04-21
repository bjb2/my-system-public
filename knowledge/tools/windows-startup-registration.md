---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [windows, startup, task-scheduler]
---

# Windows Startup Registration

Two options to auto-launch an exe at logon. Key constraint: Task Scheduler requires elevation to register even a user-level at-logon task.

## Startup Folder (no elevation required)

```powershell
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\MyApp.lnk"
)
$shortcut.TargetPath = "C:\path\to\app.exe"
$shortcut.WorkingDirectory = "C:\path\to\"
$shortcut.Save()
```

Runs at logon for the current user. No UAC prompt. Window state is whatever the app defaults to.

## Task Scheduler (requires elevation)

```powershell
$action = New-ScheduledTaskAction -Execute "C:\path\to\app.exe"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName "MyApp" -Action $action -Trigger $trigger -RunLevel Limited
```

More control (hidden window, delay, conditions) but `Register-ScheduledTask` throws `Access is denied (0x80070005)` without an elevated shell — even for `-RunLevel Limited` user tasks.

## Which to use

- No UAC / scripted install → startup folder
- Need hidden window or startup delay → Task Scheduler (run script elevated once, or via installer)

<!-- orphan: 0 inbound links as of 2026-04-20 -->
