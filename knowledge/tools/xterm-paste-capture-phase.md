---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [xterm, clipboard, gotcha, org-viewer-dev]
---

# xterm.js Double-Paste: Capture-Phase Fix

## Problem

Pasting into an xterm.js terminal fires the paste handler **twice**:

1. The inner `<textarea>` (xterm's input sink) receives the `paste` event in bubble phase
2. `attachCustomKeyEventHandler` then fires again for the Ctrl+V key combo — treating it as a second paste

Result: every paste inserts the clipboard content twice.

## Why it happens

xterm.js installs `attachCustomKeyEventHandler` to intercept Ctrl+V and call `terminal.paste(text)`. But the browser also fires a native `paste` event on the inner `<textarea>` — which xterm handles separately. Both paths run on the same clipboard action.

The bubble-phase `paste` listener on the terminal wrapper (AgentTile, TerminalView) runs **after** xterm's internal handler — by then the text is already written once, and then the custom key handler writes it again.

## Fix

Register the paste listener in **capture phase** so it intercepts and stops the event before xterm sees it:

```ts
const handler = (e: ClipboardEvent) => {
  e.stopPropagation();
  e.preventDefault();
  const text = e.clipboardData?.getData("text") ?? "";
  if (text) terminal.paste(text);
};
terminalContainerRef.current.addEventListener("paste", handler, { capture: true });
// cleanup:
return () => terminalContainerRef.current?.removeEventListener("paste", handler, { capture: true });
```

**Apply in both** `AgentTile.tsx` and `TerminalView.tsx` — both wrap an xterm instance and both have the same double-fire bug.

## Key points

- `{ capture: true }` is the required third argument — without it, the listener runs in bubble phase after xterm has already handled the event
- `stopPropagation()` prevents the event from reaching xterm's inner textarea handler
- `preventDefault()` prevents any native browser paste behavior
- Call `terminal.paste(text)` directly to hand off to xterm's own paste path once

## Related

- [[xterm-resize-hidden-container]] — other xterm lifecycle gotchas
- [[xterm-webgl-dispose-bug]] — xterm disposal patterns
