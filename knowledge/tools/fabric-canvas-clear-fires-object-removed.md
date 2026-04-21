---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [fabricjs, react, gotcha, #gotcha]
---

# Fabric.js: `canvas.clear()` fires `object:removed` for every object

## The Gotcha

`canvas.clear()` removes all objects by firing `object:removed` for each one synchronously. If your `object:removed` handler updates React state (e.g., resetting a field when a text object is deleted), it will queue those resets even during template switches — where you're calling `canvas.clear()` intentionally before rebuilding.

## Symptom

User edits headline copy → switches style/template → canvas shows default text again. Copy is gone.

**Root cause chain:**

1. User types "My Copy" → `text:changed` → `setFields({ headline: "My Copy" })`
2. Template switch → `canvas.clear()` fires `object:removed` for the headline textbox
3. `object:removed` handler calls `setFields(f => ({ ...f, headline: "" }))`
4. Template rebuilds with correct fields from closure → textbox shows "My Copy" ✓
5. React processes the queued `setFields("")` → `fields.headline = ""`
6. Sync effect sees `fields.headline = ""` → falls back to `DEFAULTS.headline` → overwrites textbox ✗

## Fix

Use a ref flag to suppress the side-effecting handler during template operations:

```typescript
const applyingTemplateRef = useRef(false);

// In object:removed handler:
fc.on("object:removed", (e: any) => {
  syncLayersFromRef();
  if (applyingTemplateRef.current) return;  // skip during template switch
  const name = e.target ? (e.target as any).name as string : "";
  if (name === "headline" || name === "subtext") {
    setFields(f => ({ ...f, [name]: "" }));
  }
});

// Wrap every canvas.clear() call (inside template functions):
applyingTemplateRef.current = true;
TEMPLATES[style](fc, fields, size);  // calls canvas.clear() internally
applyingTemplateRef.current = false;
```

Since `object:removed` fires synchronously during `canvas.clear()`, the flag is in the right state for the entire removal sequence.

## Also applies to `loadFromJSON`

`fc.loadFromJSON()` calls `canvas.clear()` first. Same flag needed if you load a saved canvas state:

```typescript
applyingTemplateRef.current = true;
fc.loadFromJSON(parsed.canvas, () => {
  applyingTemplateRef.current = false;
  // ... rest of callback
});
```

## General principle

Any Fabric.js canvas operation that clears objects will fire `object:removed` synchronously. If your handlers have React state side effects, guard them with a "batch in progress" ref.

## Related

- \[\[fabricjs-bidirectional-text-sync\]\] — bidirectional React↔canvas text sync (the handler this gotcha affects)
- \[\[asset-builder-canvas-json-schema\]\] — canvas JSON conventions for the asset builder