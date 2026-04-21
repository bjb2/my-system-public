---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [fabricjs, react, canvas, state-sync]
---

# Fabric.js Bidirectional Text Sync

## Problem

Fabric.js canvas text edits (inline double-click editing) don't automatically update React state. Default setup is one-directional: React state → canvas. If the user edits text directly on the canvas or deletes a named text object, the sidebar/form controls stay stale.

## Solution

Listen to Fabric events and push changes back to React state.

```ts
// Sync canvas text edits → React fields
fc.on("text:editing:entered", () => { canvasEditingRef.current = true; });
fc.on("text:editing:exited",  (e: any) => {
  canvasEditingRef.current = false;
  const name = (e.target as any).name as string;
  const text = (e.target as fabric.Textbox).text ?? "";
  if (name === "headline" || name === "subtext" || name === "brand") {
    setFields(f => ({ ...f, [name]: text }));
  }
});
fc.on("text:changed", (e: any) => {
  const name = (e.target as any).name as string;
  const text = (e.target as fabric.Textbox).text ?? "";
  if (name === "headline" || name === "subtext" || name === "brand") {
    setFields(f => ({ ...f, [name]: text }));
  }
});

// Clear field when named text object is deleted
fc.on("object:removed", (e: any) => {
  const name = e.target ? (e.target as any).name as string : "";
  if (name === "headline" || name === "subtext" || name === "brand") {
    setFields(f => ({ ...f, [name]: "" }));
  }
});
```

## Guard the React→Canvas sync

Without this, the `useEffect` that syncs `fields → canvas` will fight with in-progress inline edits:

```ts
const canvasEditingRef = useRef(false);

// In the fields → canvas useEffect:
if (!fc || canvasEditingRef.current) return;
```

## Why `text:changed` AND `text:editing:exited`

- `text:changed` fires on every keystroke — keeps sidebar live while typing
- `text:editing:exited` fires on blur/Enter — catches the final state and resets the guard
- Both are needed; `text:changed` alone misses the final committed value in some exit paths

## Object naming convention

Requires that text objects have a `name` property set at creation time (`name: "headline"`). The bidirectional sync keys off this name to know which field to update.

## Related

- [[fabric-canvas-clear-fires-object-removed]] — gotcha: `canvas.clear()` fires `object:removed` for every object; guard your handlers
- [[asset-builder-canvas-json-schema]] — canvas JSON and field schema conventions
