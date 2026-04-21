---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [tauri, rust, async, tokio]
---

# Tauri Async Runtime: spawn vs tokio::spawn

## The Gotcha

Calling `tokio::spawn` inside Tauri's `setup()` callback panics:

```
thread 'main' panicked: there is no reactor running,
must be called from the context of a Tokio 1.x runtime
```

`setup()` runs synchronously before Tauri's async runtime is active.

## Fix

Use `tauri::async_runtime::spawn` instead — it's Tauri's own runtime handle and is safe to call from `setup()`:

```rust
// Wrong — panics in setup()
tokio::spawn(async move { ... });

// Right — works anywhere in Tauri
tauri::async_runtime::spawn(async move { ... });
```

`tokio::time::{interval, Duration}` imports are still fine to use inside the async block.

## When it applies

Any background loop started in `setup()`: reminder checkers, file watchers using async, polling loops. If the loop is started from a Tauri command handler (already async), `tokio::spawn` works fine there.

## Related

- [[tauri-dev-setup]]
- [[tauri-background-notification-loop]]
