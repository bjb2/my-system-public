---
type: knowledge
created: 2026-04-17
updated: 2026-04-20
tags: [#gotcha, tauri, webview2, clipboard, xterm, windows]
---

# Tauri/WebView2 Clipboard Keyboard Shortcuts Don't Work on Windows

## #gotcha

On Windows, Tauri 2 + WebView2 does not reliably forward Ctrl+C/V browser accelerators to web content. Right-click → Copy/Paste works (uses WebView2's native context menu), but keyboard shortcuts silently fail. The root cause is that WebView2's accelerator key pipeline can be interrupted by Win32 message handling before the `copy`/`paste` DOM events are fired.

xterm.js compounds the problem: it intentionally handles Ctrl+C as SIGINT and Ctrl+V as the literal `\x16` character — no clipboard behavior by design.

## Fix: Two-Part

### 1. Global handler in `main.tsx` (non-terminal elements)

Add before `ReactDOM.createRoot(...)`, with `{ capture: true }` so it fires before all other handlers:

```typescript
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (!e.ctrlKey || e.shiftKey || e.altKey) return;
  if ((e.target as HTMLElement).tagName === 'CANVAS') return; // terminals handle their own
  const key = e.key.toLowerCase();
  if (key === 'c') {
    const text = window.getSelection()?.toString();
    if (text) { e.preventDefault(); navigator.clipboard.writeText(text).catch(() => {}); }
  } else if (key === 'x') {
    const text = window.getSelection()?.toString();
    if (text) {
      e.preventDefault();
      navigator.clipboard.writeText(text).catch(() => {});
      document.execCommand('delete');
    }
  } else if (key === 'v') {
    const el = e.target as HTMLElement;
    if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        if (text) document.execCommand('insertText', false, text);
      }).catch(() => {});
    }
  }
}, { capture: true });
```

- `CANVAS` check excludes xterm.js (handled below)
- `navigator.clipboard.writeText` works because WebView2 allows clipboard writes; it's only the browser accelerator pipeline that's broken
- `document.execCommand('insertText')` is deprecated but still works in WebView2 for editable elements

### 2. `attachCustomKeyEventHandler` on every xterm.js Terminal instance

Add after `terminal.open(container)` (or in the terminal factory function, before `open()`):

```typescript
terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
  if (e.type !== 'keydown' || !e.ctrlKey || e.shiftKey || e.altKey) return true;
  if (e.key === 'c' && terminal.hasSelection()) {
    // Copy selected text; preserve SIGINT when nothing is selected
    navigator.clipboard.writeText(terminal.getSelection()).catch(() => {});
    return false;
  }
  if (e.key === 'v') {
    // Paste from clipboard into PTY (instead of sending \x16)
    navigator.clipboard.readText().then(text => { if (text) terminal.paste(text); }).catch(() => {});
    return false;
  }
  return true;
});
```

Returning `false` from the handler prevents xterm from processing the key (no SIGINT on copy, no `\x16` on paste). Returning `true` lets xterm handle everything else normally.

### 3. Block xterm's native textarea paste handler (prevents double-paste)

xterm's internal paste handler lives on the inner `<textarea>`, which fires before a bubble-phase listener on the outer `.xterm` div. If you also have a `customKeyEventHandler` for Ctrl+V, both paths fire → double paste.

Fix: use capture phase + `stopPropagation` on `term.element` so the event never reaches the textarea:

```typescript
// WRONG — bubble phase fires after xterm's textarea handler
term.element?.addEventListener('paste', (e) => e.preventDefault());

// RIGHT — capture phase fires before any inner element handler
term.element?.addEventListener('paste', (e) => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
```

Add this after `term.open(container)`.

## Behavior After Fix

ContextCtrl+CCtrl+VTipTap editorcopies selectionpastes from clipboardInput / textareacopies selectionpastes from clipboardxterm (with selection)copies to clipboard (no SIGINT)pastes from clipboardxterm (no selection)sends SIGINTpastes from clipboard

## What Doesn't Change

- Right-click context menu still works as before
- Ctrl+Shift+C / Ctrl+Shift+V NOT needed — this fix makes the standard shortcuts work
- xterm.js paste via `term.paste(text)` sends text to the PTY as if the user typed it

## Related

- [tauri-webview-api-gotchas.md](tauri-webview-api-gotchas.md) — browser tile overlay, window label uniqueness
- [xterm-webgl-dispose-bug.md](xterm-webgl-dispose-bug.md)
<!-- orphan: 0 inbound links as of 2026-04-20 -->
