---
type: knowledge
created: 2026-04-17
updated: 2026-04-17T08:40
tags: [tauri, rust, notifications, reminders, tokio]
---

# Tauri 2: Background Notification Loop for Scheduled Reminders

See also: \[\[tauri-inapp-toast-notifications\]\] — preferred for portable exes (no AUMID registration, no registry writes, no WebView2 conflicts).

## Pattern

Spawn a tokio background task in `setup()` that polls reminder files every 60s and fires Windows toast notifications via `tauri-plugin-notification`.

## Dependencies

```toml
# Cargo.toml
tauri-plugin-notification = "2"
chrono = { version = "0.4", features = ["clock"] }
```

```json
// capabilities/default.json — add to permissions array
"notification:default"
```

```bash
npm install @tauri-apps/plugin-notification
```

## Register plugin in lib.rs

```rust
.plugin(tauri_plugin_notification::init())
```

## Fire a notification from Rust

```rust
use tauri_plugin_notification::NotificationExt;

app_handle
    .notification()
    .builder()
    .title("Reminder title")
    .body("Reminder body")
    .show()
    .ok();
```

## Background loop pattern

```rust
pub fn start_reminder_loop(org_root: PathBuf, app: AppHandle, notified: Arc<NotifiedSet>) {
    tokio::spawn(async move {
        check_reminders(&org_root, &app, &notified); // fire immediately on start
        let mut ticker = interval(Duration::from_secs(60));
        loop {
            ticker.tick().await;
            check_reminders(&org_root, &app, &notified);
        }
    });
}
```

Start it inside `setup()` before the file watcher:

```rust
let notified = reminders::NotifiedSet::new();
reminders::start_reminder_loop(org_root.clone(), handle.clone(), notified);
```

## Deduplication

Use an `Arc<Mutex<HashSet<String>>>` keyed by path + repeat period to prevent re-firing:

RepeatKey formatnone (one-shot)\`"{path}daily\`"{path}weekly\`"{path}monthly\`"{path}

Keys reset on app restart — intentional for one-shots (user should dismiss), acceptable for repeating.

## Datetime parsing (remind-at field)

```rust
NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
    .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M"))
    .ok()
```

The frontmatter format `2026-04-17T09:00` (no seconds) requires the second pattern.

## Gotchas

- **No async in setup()**: `start_reminder_loop` must be fully async-safe. The tokio runtime is already running via Tauri's async runtime, so `tokio::spawn` works directly.
- **Notification requires app handle, not window**: Use `app.handle().clone()` not a window reference.
- **Skip completed/ subfolder**: Walk `reminders/` but check `path.components().any(|c| c.as_os_str() == "completed")`.
- **snoozed-until**: Check before firing — if non-null and &gt; now, skip.
- **No desktop action buttons**: `ActionType` and `Action` in `tauri-plugin-notification` v2 are `#[cfg(mobile)]` only. The desktop builder (`notify-rust` under the hood) only supports `title`, `body`, `icon`, `sound` — no snooze/dismiss action buttons in the toast. For interactive Windows toasts, you'd need raw WinRT bindings (`windows` crate, `Windows::UI::Notifications`). Snooze UX belongs in-app instead.
- **AUMID must be registered for portable exe**: When running outside `target/debug` or `target/release`, `notify-rust` sets the WinRT app_id — but if the AUMID isn't registered in `HKCU\SOFTWARE\Classes\AppUserModelId\{id}`, Windows silently drops all toasts. A Tauri app installed via NSIS/MSI registers the AUMID automatically, but a portable copied `.exe` never does. Fix: call `register_aumid()` at startup.

```toml
# Cargo.toml
[target.'cfg(windows)'.dependencies]
winreg = "0.52"
```

```rust
#[cfg(windows)]
fn register_aumid(app_id: &str, display_name: &str) {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_WRITE};
    use winreg::RegKey;
    let path = format!("SOFTWARE\\Classes\\AppUserModelId\\{}", app_id);
    if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags(&path, KEY_WRITE)
        .or_else(|_| RegKey::predef(HKEY_CURRENT_USER).create_subkey(&path).map(|(k, _)| k))
    {
        let _ = hkcu.set_value("DisplayName", &display_name.to_string());
    }
}
#[cfg(not(windows))]
fn register_aumid(_app_id: &str, _display_name: &str) {}
```

Call it in `setup()` before `start_reminder_loop()`:

```rust
register_aumid("com.org-viewer.app", "org-viewer");
```