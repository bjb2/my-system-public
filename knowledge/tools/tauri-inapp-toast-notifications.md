---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [tauri, react, notifications, ux]
---

# Tauri In-App Toast Notifications via Events

See also: [[tauri-background-notification-loop]] — the OS-level notification approach this supersedes for portable exes.

Replace `tauri-plugin-notification` (OS-level toasts) with in-app toasts driven by Tauri events. Better UX: toasts appear inside the app window, no AUMID registration needed, no Windows notification center spam.

## Pattern

**Rust side** — emit a typed event payload:
```rust
#[derive(Clone, serde::Serialize)]
struct ToastPayload { title: String, body: String }

let _ = app.emit("reminder-toast", ToastPayload { title, body });
```

**React side** — listen and push to local state:
```tsx
useEffect(() => {
  const unlisten = listen<{ title: string; body: string }>("reminder-toast", (e) => {
    addToast(e.payload.title, e.payload.body);
  });
  return () => { unlisten.then(f => f()); };
}, [addToast]);
```

**ToastContainer** — fixed position, high z-index, auto-dismiss with `setTimeout`, click to dismiss early. Render inside the root component so it overlays everything.

## Past-due spam prevention

On startup, skip one-shot reminders overdue by more than 24 hours:
```rust
// startup = true on first check, false on poll loop ticks
let hours_overdue = (now - remind_at).num_hours();
let fire = now >= remind_at && (!startup || hours_overdue < 24);
```

Recurring reminders (daily/weekly/monthly) are unaffected — their key includes the date so they naturally deduplicate per period.

## Removing tauri-plugin-notification

1. Remove from `Cargo.toml`
2. Remove `.plugin(tauri_plugin_notification::init())` from `lib.rs`
3. Remove `"notification:default"` from `capabilities/default.json` — watch for trailing comma (invalid JSON → build error)
4. Remove `import { sendNotification } from "@tauri-apps/plugin-notification"` from frontend

## White screen / "can't connect to localhost" (ERR_CONNECTION_REFUSED)

Three distinct causes — **distinguish by binary size first**:

**Cause 1: Empty/broken `dist/`** — release binary embeds `dist/` at compile time. If `npm run build` fails, is interrupted, or hasn't run, `dist/` may be empty (tiny `index.html`, 1–2 asset files, no bundled JS). Tauri then has no frontend to serve and falls back to `devUrl` (`http://localhost:1420`) — which has no listener in production → ERR_CONNECTION_REFUSED. **Diagnostic**: compare exe sizes. A missing bundle makes the exe ~300–400KB smaller than a healthy build. Check `dist/assets/` — a healthy build has large `.js`/`.css` files. Fix: `npm run build` then `cargo build --release`.

**Cause 2: `register_aumid()` / `winreg` registry write** — writing to `HKCU\SOFTWARE\Classes\AppUserModelId\<id>` interferes with WebView2's internal content scheme initialization, causing it to refuse the connection and the main window to show ERR_CONNECTION_REFUSED. **Never write an AppUserModelId to the registry for a portable Tauri exe.** The fix: remove `register_aumid()` and the `winreg` dependency entirely. If the key was previously written, clean it up: `reg delete "HKCU\SOFTWARE\Classes\AppUserModelId\com.org-viewer.app" /f`. This was the actual root cause in org-viewer — the AUMID fix for WinRT toasts broke the app load. Switching to in-app Tauri-event toasts removes the need for AUMID registration altogether.
