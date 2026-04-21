---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [react, tauri, xterm, debugging, gotcha]
---

# React StrictMode Double-Effect Gotcha

## The bug

In React 18 development mode, StrictMode intentionally mounts → unmounts → remounts every component to surface side effects. This means `useEffect` with `[]` deps fires **twice**. If the effect creates an external resource (PTY, WebSocket, subscription), you get two instances.

**Symptom in xterm.js / PTY**: PowerShell banner + prompt appeared twice because two separate PTY processes were spawned.

## The fix

Use a `useRef` guard. Refs survive the StrictMode fake-unmount cycle, so the second run sees the flag and exits early:

```tsx
const initRef = useRef(false);

useEffect(() => {
  if (initRef.current) return;
  initRef.current = true;
  // create PTY, open WebSocket, etc.
}, []);
```

## Async listeners: cancelled flag pattern

When an effect sets up an async subscription (e.g. Tauri's `listen()`), the cleanup may run *before* the promise resolves. A ref-based approach fails silently:

```tsx
// BUG: cleanup runs before listen() resolves → unlistenRef.current is null → listener leaks
useEffect(() => {
  listen("event", handler).then(fn => { unlistenRef.current = fn; });
  return () => { unlistenRef.current?.(); }; // null — no-op
}, []);
```

Fix with a `cancelled` flag captured in the closure:

```tsx
useEffect(() => {
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  listen("event", handler).then(fn => {
    if (cancelled) fn(); // already cleaned up — cancel immediately
    else unlisten = fn;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}, []);
```

In StrictMode this leaking listener causes every event to fire twice — e.g. every PTY byte written to the terminal twice, producing doubled characters (`ccaann yyoouu`).

## Why not `tabs.length === 0` check?

Looks like it would work — if a tab exists, skip. But during the StrictMode remount, React re-runs the effect with the **same initial state** (`tabs = []`), so the guard is always false and two tabs are created regardless.

## Related

- \[\[tauri-dev-setup\]\] — other Tauri dev mode gotchas
- \[\[xterm-webgl-dispose-bug\]\] — WebGL cleanup crash triggered by StrictMode's double-invoke