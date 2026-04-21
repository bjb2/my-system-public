---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [tauri, capabilities, permissions, build]
---

# Tauri Capabilities: Permission Names Must Match Exactly

## Problem

`tauri build` fails at the Rust compile step with:

```
Permission core:window:allow-navigate not found, expected one of ...
```

Permissions in `src-tauri/capabilities/*.json` must exactly match what the installed Tauri version exposes. The full valid list is printed in the error message.

## Specific case: navigate permissions

`core:window:allow-navigate` and `core:webview:allow-navigate` do **not exist** in Tauri v2.10.x. Remove them from capabilities if present — they were likely added speculatively or from outdated docs.

## Debugging

The error prints the complete valid permission list. Grep it for the capability category you need:

```
# From the build error output, search for webview permissions
... core:webview:allow-create-webview-window, core:webview:allow-navigate ...
```

Wait — `core:webview:allow-navigate` genuinely doesn't appear. Use `core:webview:allow-create-webview-window` to open new windows instead of navigating existing ones.

## Critical: `core:webview:default` does NOT include `allow-create-webview-window`

`core:default` → `core:webview:default` includes only:
- `allow-get-all-webviews`
- `allow-webview-position`
- `allow-webview-size`
- `allow-internal-toggle-devtools`

**`allow-create-webview-window` is absent.** If you call `new WebviewWindow(...)` from JS and nothing happens (no window, no error in UI, just silence), the permission is missing. Add it explicitly:

```json
"permissions": [
  "core:default",
  "core:webview:allow-create-webview-window",
  ...
]
```

This was the root cause when the `+ browser` button did nothing — the `create_webview_window` Tauri command was blocked silently.

## Pattern

When a `WebviewWindow` needs to show a new URL, close and recreate it rather than calling `.navigate()` — the navigate API doesn't exist in this version's JS types or Rust capabilities.
