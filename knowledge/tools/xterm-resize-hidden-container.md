---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [xterm, tauri, react, pty, terminal]
---

# xterm.js: ResizeObserver + Hidden Container Corrupts PTY

## Pattern

When an xterm.js terminal is hidden by collapsing its container to `width: 0` (rather than `display: none` or `visibility: hidden`), the `ResizeObserver` still fires. Calling `fitAddon.fit()` on a zero-dimension container computes 0 cols/rows, which gets sent to the PTY via `pty_resize`. This corrupts the terminal display — the session stays alive but output is invisible or garbled when the container reopens.

## Symptoms

- Terminal view hidden via sidebar toggle
- Session still running (PTY alive), but output is gone or broken when reopened
- `fitAddon.fit()` called after reopening doesn't fully recover

## Fix

Guard the ResizeObserver callback to skip when the container has zero dimensions:

```ts
const ro = new ResizeObserver(() => {
  if (!containerRef.current || containerRef.current.offsetWidth === 0 || containerRef.current.offsetHeight === 0) return;
  activeTab.fitAddon.fit();
  const { rows, cols } = activeTab.terminal;
  invoke("pty_resize", { ptyId: activeTab.ptyId, rows, cols }).catch(() => {});
});
```

The separate `visible` prop effect handles the refit correctly when the container reopens (with a short setTimeout to let layout settle first).

## Why It Happens

`ResizeObserver` fires on any dimension change, including collapse to 0. `FitAddon.fit()` doesn't guard against zero dimensions — it calculates and applies whatever the container reports. The PTY backend then receives a 0-column resize and reflows output to nothing.

## See Also

- [xterm-webgl-dispose-bug.md](xterm-webgl-dispose-bug.md) — WebGL renderer context loss pattern
- [pty-readline-race-condition.md](pty-readline-race-condition.md) — PTY startup timing issues

<!-- orphan: 0 inbound links as of 2026-04-20 -->
