---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [yjs, tiptap, collaboration, undo, #gotcha]
---

# Yjs UndoManager: Tuning captureTimeout with Tiptap Collaboration

## The problem

Tiptap's Collaboration extension creates a `Y.UndoManager` internally with `captureTimeout: 500ms`. Fast typing groups many keystrokes into one undo step, giving the user few distinct steps to undo through.

## The correct fix — modify captureTimeout post-init #gotcha

**Do NOT create a custom UndoManager and pass it via `yUndoOptions`.** That approach breaks undo for additions (see below). Instead, let the Collaboration extension create its default UndoManager, then modify `captureTimeout` after the editor initializes:

```tsx
import { yUndoPluginKey } from 'y-prosemirror'

useEffect(() => {
  if (!editor) return
  const um = yUndoPluginKey.getState(editor.state)?.undoManager
  if (um) um.captureTimeout = 100
}, [editor])
```

`captureTimeout` is a plain property — setting it after init affects all future transactions.

## Why the custom UndoManager approach breaks undo #gotcha

The default UndoManager created by `yUndoPlugin` includes a critical filter:

```js
captureTransaction: tr => tr.meta.get('addToHistory') !== false
```

Without this filter, sync-back transactions (when the ySyncPlugin pushes Yjs state back to ProseMirror) get re-captured as undoable steps. This corrupts the undo stack: document sync entries appear as undo steps, and subsequent typed content layers on top incorrectly. The result: Ctrl+Z works for deletions but not additions, or undoes the entire document instead of just recent edits.

The default UndoManager has this filter built in. A custom UndoManager passed via `yUndoOptions` would need to replicate it exactly — but the `addToHistory` meta value on Yjs transactions is set deep in y-prosemirror internals and is easy to get wrong.

## captureTimeout tuning

| Value | Behavior |
|-------|----------|
| `0` | Every transaction = one step (per-keystroke undo) |
| `100` | Rapid typing groups; deliberate pauses = new step |
| `500` | Default — coarse grouping, few distinct undo steps |

`100ms` is a good default for document editors — gives ~10 distinct steps for normal writing cadence.

## Paste must call stopCapturing() #gotcha

With `captureTimeout: 100ms`, paste within 100ms of the last keystroke gets **merged into the same undo step**. Ctrl+Z then undoes the typing rather than the paste — the paste appears to vanish from undo history.

Fix: call `undoManager.stopCapturing()` before every paste. This resets the internal timestamp (`this.lastChange = 0`), guaranteeing the next transaction starts a fresh undo step regardless of elapsed time.

```tsx
// Intercept Ctrl+V at window level (fires before the paste event)
if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
  if (editor) yUndoPluginKey.getState(editor.state)?.undoManager?.stopCapturing()
  // No preventDefault — let ProseMirror handle the paste event normally
}

// Context menu paste
function breakCapture() {
  yUndoPluginKey.getState(editor.state)?.undoManager?.stopCapturing()
}
// Call breakCapture() before document.execCommand('paste') or insertContent()
```

`stopCapturing()` is safe — y-prosemirror itself calls it internally. It is a single property assignment.

The window `keydown` handler for Ctrl+V fires before the browser dispatches the `paste` event, so `stopCapturing()` is guaranteed to run before the paste transaction is created.

## Undo stack depth

The UndoManager keeps unlimited history. There is no step count limit.

## Related

- [tiptap-collab-yjs-supabase](tiptap-collab-yjs-supabase.md) — Yjs + Supabase Realtime transport
- [tiptap-context-menu-pattern](tiptap-context-menu-pattern.md) — right-click menu with Ctrl+Z keyboard shortcut display

<!-- orphan: 0 inbound links as of 2026-04-20 -->
