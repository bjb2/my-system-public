---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [windows, notifications, tauri, debugging]
---

# Windows Toast Notifications Globally Disabled

## Symptom

Tauri `tauri-plugin-notification` toasts silently never appear. Code is correct, app is running, no errors — notifications just don't show.

## Root Cause

Windows global notification toggle is off:

```
HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications
ToastEnabled = 0
```

## Diagnostic

```powershell
Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\PushNotifications' | Select-Object ToastEnabled
# ToastEnabled: 0 = disabled globally; 1 = enabled
```

## Fix

Win+I → System → Notifications → toggle **Notifications** to On.

## Notes

- This is the master switch. Even if per-app settings are correct, `ToastEnabled=0` silently drops all toasts.
- Overdue Tauri reminders fire immediately on next app launch (or within 60s on next poll) once enabled.
- No registry key = notifications are on by default (only explicitly set when user toggles off).

<!-- orphan: 0 inbound links as of 2026-04-20 -->
