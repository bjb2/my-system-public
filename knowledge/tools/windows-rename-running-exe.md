---
type: knowledge
created: 2026-04-16
updated: 2026-04-18
tags: [windows, tauri, org-viewer, deployment]
---

# Windows: Rename a Running Exe

Windows locks a running `.exe` against **overwrite and delete**, but allows **rename**. This enables a stable-name deploy pattern without stopping the app.

## Deploy Pattern

```
org-viewer.exe       ← stable name, startup task points here
org-viewer-prev.exe  ← was running before last deploy (safe to delete after restart)
```

**Steps:**
1. Build lands as `org-viewer-new.exe`
2. Rename `org-viewer.exe` → `org-viewer-prev.exe` (succeeds even while running)
3. Rename `org-viewer-new.exe` → `org-viewer.exe`

The running process continues from `org-viewer-prev.exe` until restarted. On next launch, `org-viewer.exe` is the new build.

## Benefits

- Startup task path never changes
- No version number proliferation
- `org-viewer-prev.exe` is an implicit one-step rollback

## Gotcha: fixed slot names accumulate lock conflicts

If `org-viewer-old.exe` itself is inaccessible (permission denied, or itself running from a mid-flight previous deploy), the chain breaks silently: `Remove-Item` fails with SilentlyContinue, `Rename-Item` prev→old also fails, then `Move-Item` stable→prev fails with "file already exists." The whole deploy fails with no clear error.

**Fix: use timestamped archive names** so prev never needs to land in a slot that might already exist:

```powershell
if (Test-Path $prevDst) {
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    Rename-Item -Path $prevDst -NewName "org-viewer-old-$ts.exe" -ErrorAction SilentlyContinue
    if (Test-Path $prevDst) {
        Remove-Item $prevDst -Force -ErrorAction SilentlyContinue
    }
}
Rename-Item -Path $stableDst -NewName "org-viewer-prev.exe" -ErrorAction Stop
Copy-Item $buildSrc $stableDst -ErrorAction Stop
```

Rule: **use `Rename-Item -ErrorAction Stop` for the stable→prev rotation** (not `Move-Item` — semantically the same on one FS but `Rename-Item` makes intent clear). Use `-ErrorAction Stop` so failures surface immediately rather than cascading silently.

## Related

- [[tools/windows-locked-binary-swap]] — earlier (worse) versioning approach, superseded by this
- [[tasks/org-viewer-run-at-windows-startup]]
