---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, prosemirror, ux, clipboard, #gotcha]
---

# Tiptap: Custom Right-Click Context Menu

## Pattern

Create a standalone component that listens for `contextmenu` on `document`, checks the target is inside `.ProseMirror`, renders a positioned floating menu.

```tsx
useEffect(() => {
  function onContextMenu(e: MouseEvent) {
    const target = e.target as HTMLElement
    if (!target.closest('.ProseMirror')) return
    e.preventDefault()
    setPos({ x: e.clientX, y: e.clientY })
  }
  function onMouseDown(e: MouseEvent) {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) setPos(null)
  }
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('mousedown', onMouseDown)
  return () => {
    document.removeEventListener('contextmenu', onContextMenu)
    document.removeEventListener('mousedown', onMouseDown)
  }
}, [editor])
```

Render with `position: fixed`, `left: x`, `top: y`, `zIndex: 10000`. Clamp to viewport:
```tsx
const x = Math.min(pos.x, window.innerWidth  - menuW - 8)
const y = Math.min(pos.y, window.innerHeight - menuH - 8)
```

## Multiple context menus (delegation)

When you have multiple context menus (e.g. TableContextMenu + general EditorContextMenu), scope each by target:

```tsx
// TableContextMenu — only table cells
if (!target.closest('.ProseMirror td, .ProseMirror th')) return

// EditorContextMenu — editor but NOT table cells (let TableContextMenu handle those)
if (!target.closest('.ProseMirror')) return
if (target.closest('.ProseMirror td, .ProseMirror th')) return
```

## Use onMouseDown, not onClick #gotcha

ProseMirror loses its selection on `mousedown`. If you use `onClick` on menu items, the selection is already gone before the handler fires.

```tsx
// WRONG — selection lost by the time onClick fires
<button onClick={() => editor.chain().focus().cut().run()}>

// RIGHT — preventDefault prevents focus loss, selection preserved
<button onMouseDown={e => { e.preventDefault(); action() }}>
```

## Clipboard operations

Cut and Copy work fine with `execCommand` on contenteditable:
```tsx
editor.view.dom.focus()
document.execCommand('cut')   // or 'copy'
```

`document.execCommand('paste')` is unreliable cross-browser. For **paste without formatting**, use the Clipboard API:
```tsx
async function pasteText() {
  try {
    const text = await navigator.clipboard.readText()
    editor.chain().focus().insertContent(text).run()
  } catch {
    document.execCommand('paste')  // fallback
  }
}
```

## Disable items based on selection

```tsx
const hasSelection = !editor.state.selection.empty
// then pass disabled: !hasSelection to Cut/Copy/Delete items
```

## Keyboard shortcuts in menu items

Display shortcuts as right-aligned dim text:
```tsx
<button style={{ display: 'flex', justifyContent: 'space-between' }}>
  <span>{label}</span>
  {shortcut && <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 24 }}>{shortcut}</span>}
</button>
```

## Related

- [tiptap-table-links-collapse](tiptap-table-links-collapse.md) — TableContextMenu pattern (same technique, table-scoped)

<!-- orphan: 0 inbound links as of 2026-04-20 -->
