---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [xterm, webgl, react, tauri, gotcha]
---

# xterm.js WebglAddon Dispose Bug

## Symptom

React error boundary catches: `Cannot read properties of undefined (reading '_isDisposed')` originating from `@xterm/addon-webgl`. Happens on component unmount — crashes tile/view with no visible cause.

## Root Cause

`WebglAddon.dispose()` accesses an internal GL object that may already be garbage collected by the time cleanup runs. React StrictMode makes this worse by running cleanup immediately after the first mount.

## Fix

Dispose the WebGL addon manually **before** `term.dispose()`, both wrapped in try/catch:

```typescript
// Track webgl instance in a local variable (not a ref — stays in closure)
let webgl: WebglAddon | null = null;
try {
  webgl = new WebglAddon();
  webgl.onContextLoss(() => { try { webgl?.dispose(); } catch {} webgl = null; });
  term.loadAddon(webgl);
} catch { webgl = null; }

// In cleanup:
return () => {
  try { webgl?.dispose(); } catch {}
  webgl = null;
  try { term.dispose(); } catch {}
};
```

## Why local variable, not ref

`webgl` lives in the effect closure — same lifetime as `term`. A ref would persist across StrictMode's double-invoke cycle and could point to a disposed instance.

## Related

- Same pattern needed in any component using WebGL (AgentTile, TerminalView)
- `term.dispose()` itself can also throw in edge cases — wrap it too
- [[react-strictmode-double-effect]] — StrictMode's double-invoke cycle is what makes this bug manifest in dev

<!-- orphan: 0 inbound links as of 2026-04-20 -->
