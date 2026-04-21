---
type: knowledge
created: 2026-04-16
updated: 2026-04-20
tags: [tauri, webview, rust, api]
---

# Tauri v2 Webview API Gotchas (2.10.x)

Hard corrections learned while building the embedded browser panel.

## `eval` not `evaluate_script`

```rust
// WRONG — method not found
bv.evaluate_script(&js)?;

// RIGHT
bv.eval(&js)?;
```

## `get_webview_window` not `get_webview`

```rust
// WRONG — no get_webview on AppHandle in stable
app.get_webview("browser")

// RIGHT
app.get_webview_window("browser")
```

## `add_child` / child webview requires `unstable` and still doesn't work in 2.10.3

`WebviewBuilder` and `add_child()` are gated behind the `unstable` feature:
```toml
tauri = { version = "2.10.3", features = ["unstable"] }
```
But even with `unstable`, `add_child` is not found on `WebviewWindow<R>` in 2.10.3 — the method exists in later Tauri versions. Don't attempt true child webviews in 2.10.x.

## Overlay window pattern (substitute for child webview)

To make a browser feel embedded in the main window, use a borderless `WebviewWindowBuilder` positioned over the content area:

```rust
WebviewWindowBuilder::new(&app, "browser", WebviewUrl::External(parsed))
    .decorations(false)
    .shadow(false)
    .skip_taskbar(true)
    .resizable(false)
    .position(x, y)          // logical screen coordinates
    .inner_size(w, h)
    .initialization_script(SCRIPT)
    .build()?;
```

Position calculation from JS (BrowserView anchor div):
```ts
const r = anchorRef.current.getBoundingClientRect();
const bounds = {
  x: window.screenX + r.left,   // absolute logical screen x
  y: window.screenY + r.top,
  w: r.width,
  h: r.height,
};
invoke("browser_open", { url, ...bounds });
```

Track window movement to keep the overlay in sync:
```ts
getCurrentWindow().onMoved(() => {
  const b = getScreenBounds();
  if (b) invoke("browser_resize", b);
});
```

Also wire a `ResizeObserver` on the anchor div for window resize events.

## `initialization_script` is stable and runs on every navigation

`WebviewWindowBuilder::initialization_script(script)` is NOT gated behind unstable. Use it for ad blocking, custom CSS, etc. The script runs before every page load — not just the first one.

## `browser_open` vs `browser_show` — reload behavior

When the `"browser"` webview window already exists:
- `browser_open(url, ...)` → repositions + shows + **reloads** via `window.location.replace(url)`
- `browser_show(x, y, w, h)` → repositions + shows, **no reload**
- `browser_hide()` → hides the window without destroying it

**Pattern for persistent browser (no reload on tab switch):**

Always mount the React wrapper component (CSS-hide like radio/swarm — `visibility: hidden` + `pointer-events: none`). Pass a `visible` prop and watch it:

```tsx
// Show without reload
useEffect(() => {
  if (visible) {
    const b = getScreenBounds();
    if (b) invoke("browser_show", b);
  } else {
    invoke("browser_hide");
  }
}, [visible]);
```

Call `browser_open` only on initial mount (creates the window) and on user-initiated URL navigation. Never call `browser_open` on visibility changes — it reloads the page.

## Browser as a draggable/resizable swarm tile

The overlay pattern extends to a moveable tile — make the anchor div a tile body and sync position on every `tile.x/y/width/height` change:

```tsx
// Debounce with RAF to avoid mid-drag flood (tile position changes on every mousemove)
useEffect(() => {
  if (rafRef.current) cancelAnimationFrame(rafRef.current);
  rafRef.current = requestAnimationFrame(() => {
    if (!visibleRef.current) return;
    const b = getScreenBounds();
    if (b) invoke("browser_show", b).catch(console.error);
  });
}, [tile.x, tile.y, tile.width, tile.height]);
```

Key constraints:
- `getScreenBounds()` returns null if `r.width === 0 || r.height === 0` (guard against hidden/unmounted)
- `visibleRef` mirrors the `visible` prop via a ref so the RAF callback reads latest value without stale closure
- On unmount call `browser_close` (not `browser_hide`) — see gotcha below
- `taskPath` field repurposed to store the initial URL for browser tiles (no schema change needed)

## Multiple browser tiles — per-tile window labels

Each browser tile needs its own Tauri `WebviewWindow` label. Use the tile's `id` to derive a stable, unique label:

```ts
const winLabel = "bw" + tile.id;  // e.g. "bw3"
// Pass label to every invoke: browser_open, browser_show, browser_hide, browser_close
invoke("browser_open", { label: winLabel, url, ...bounds });
invoke("browser_close", { label: winLabel });
```

Rust commands accept `label: String` and use `app.get_webview_window(&label)` instead of the hardcoded `"browser"` string. This allows N simultaneous browser tiles with no guard needed at spawn.

## Mount timing: use rAF before reading bounds

`getScreenBounds()` reads `getBoundingClientRect()`. If called synchronously in a `useEffect` that fires immediately after component mount, the element may still be at zero size (SwarmView may be `visibility: hidden`, layout not yet committed). Use `requestAnimationFrame` to defer until after paint:

```ts
useEffect(() => {
  const raf = requestAnimationFrame(() => {
    const b = getScreenBounds();
    if (b) invoke("browser_open", { label: winLabel, url, ...b });
  });
  return () => {
    cancelAnimationFrame(raf);
    invoke("browser_close", { label: winLabel });
  };
}, []);
```

## Overlay position drifts when main window is moved

The overlay's screen position is `window.screenX + r.left`. If the main Tauri window is moved (dragged), `window.screenX/Y` changes but the overlay doesn't get a `tile.x/y` change event — so it drifts.

Fix: listen to main window `onMoved` and re-sync:

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";

useEffect(() => {
  let unlisten: (() => void) | undefined;
  getCurrentWindow().onMoved(() => {
    const b = getScreenBounds();
    if (b) invoke("browser_show", { label: winLabel, ...b }).catch(console.error);
  }).then(fn => { unlisten = fn; });
  return () => unlisten?.();
}, [syncPosition]);
```

## Overlay windows go behind parent on drag — use `always_on_top(true)`

When a borderless WebviewWindow overlays the main window, clicking the main window (e.g., to drag a tile) gives it focus and pushes the overlay behind it. Fix: set `always_on_top(true)` at build time.

```rust
WebviewWindowBuilder::new(&app, "browser", WebviewUrl::External(parsed))
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)   // required — otherwise focus on main window hides overlay
    .position(x, y)
    .inner_size(w, h)
    .build()?;
```

This uses `HWND_TOPMOST` on Windows — the overlay stays above all windows system-wide, not just above the parent.

## `hide()` does NOT stop media — use `close()` on tile destroy

`bv.hide()` makes the window invisible but the process keeps running: audio plays, video decodes, JS executes. Media continues silently in the background.

**Rule:** only use `hide()` for tab-switch visibility (window will be shown again soon). Use `close()` when the tile is being removed — this fully destroys the window and stops all playback.

```rust
// Tab switch — window survives, no reload on re-show
bv.hide()?;

// Tile closed — must destroy
bv.close()?;
```

In React, the unmount cleanup of the mount effect should always call `browser_close`:
```tsx
useEffect(() => {
  invoke("browser_open", { url, ...bounds });
  return () => { invoke("browser_close").catch(console.error); }; // NOT browser_hide
}, []);
```

## iframe-as-tile vs WebviewWindow: cross-origin constraints

An `<iframe>` embedded in the main window is simpler to position than an overlay `WebviewWindow`, but it can't load most external URLs due to cross-origin restrictions:

- Sites that send `X-Frame-Options: DENY` or `SAMEORIGIN` refuse to load in an iframe
- Tauri's webview origin is `tauri://localhost`; sites checking `document.referrer` or frame origin will block
- You cannot access `iframe.contentDocument` or `iframe.contentWindow` across origins (throws `SecurityError`)
- `postMessage` works across origins, but the site must implement a listener — third-party sites don't

**When to use iframe:** internal pages (org-viewer views, localhost tools, same-origin content). Works fine for embedding your own Tauri pages in a tile without spawning a second window.

**When to use WebviewWindow overlay:** any external URL (news sites, docs, social). The overlay is a full browser window with its own process — no cross-origin restrictions, full JS execution, persistent cookies.

**Tauri `<webview>` tag** (the WKWebView/WebView2 equivalent in Tauri v1) is not available in Tauri v2 React apps. Stick to `WebviewWindow` for external content.

## External API Calls (CORS Bypass)

Tauri webview origin is `tauri://localhost`. Most external APIs (Anthropic, Stripe, etc.) do not send `Access-Control-Allow-Origin: tauri://localhost`, so direct `fetch()` from the frontend is blocked by CORS.

**Fix: proxy through Rust.** Make the HTTP call in a Tauri command — Rust has no CORS restrictions.

```rust
#[tauri::command]
async fn call_external_api(api_key: String, payload: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.example.com/endpoint")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .body(payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("{}: {}", resp.status(), resp.text().await.unwrap_or_default()));
    }
    resp.text().await.map_err(|e| e.to_string())
}
```

`reqwest` is already in most Tauri Cargo.toml setups with `features = ["json", "rustls-tls"]`. The JSON response comes back as a string; parse it on the frontend with `JSON.parse()` or use `.json::<T>()` in Rust.

**API key safety:** the key is passed from the frontend to Rust on each call (read from env var or a local config file). It never leaves the device — just traverses the IPC bridge.

The show/hide effect (for tab visibility) is separate and still uses `browser_hide`/`browser_show` — those are not on the unmount path.
