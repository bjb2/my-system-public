---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [org-viewer, asset-builder, fabric-js, canvas, gotcha]
---

# Asset Builder — Canvas JSON Schema Conventions

## activeLogo field

`activeLogo` must be `"wordmark" | "icon" | null` — **not a file path**. The builder uses this to call `addLogoToCanvas(variant, size)`, which resolves the URL internally:

```js
const isDark = styleRef.current === "navy" || styleRef.current === "blue";
const url = isDark ? LOGO_WHITE : LOGO_DARK;  // "/outgoing-logo-white.png"
```

Setting `activeLogo` to a file path string breaks the logo re-placement on template re-apply.

## Logo image src paths

Logo files are served as Tauri static assets from `public/`:
- `/outgoing-logo-white.png` — for dark backgrounds (navy, blue)
- `/outgoing-logo-dark.png` — for light backgrounds (white, periwinkle)

Canvas image objects must use these relative URLs, not absolute paths like `C:/Users/.../Downloads/...`.

## style field → logo selection coupling

The `style` field in the canvas JSON sidecar affects which logo variant `addLogoToCanvas` uses when the template is re-applied:
- `"navy"` or `"blue"` → white logo
- `"white"` → dark logo

For custom background colors (periwinkle, cobalt, etc.), set `style` to whichever base preset has the right logo color:
- Periwinkle (light bg, dark logo) → `"style": "white"`
- Cobalt (dark bg, white logo) → `"style": "blue"`

## fields object — all 3 keys required

The `fields` object must always include all 3 keys even when empty, or the UI inputs render `undefined`:

```json
"fields": {
  "headline": "Your headline here",
  "subtext": "",
  "brand": ""
}
```

## Background color

`canvas.background` in the Fabric.js JSON is the canvas background. Editing it requires calling `fc.setBackgroundColor(color, callback)` — it is NOT just an object in the `objects` array. The asset builder now exposes this via a color picker in the DESIGN panel (added 2026-04-18).

## canvas JSON image object (logo) layout

```json
{
  "type": "image",
  "originX": "center",
  "originY": "center",
  "left": 540,
  "top": 970,
  "width": 220,
  "height": 55,
  "scaleX": 1,
  "scaleY": 1,
  "src": "/outgoing-logo-white.png",
  "crossOrigin": "anonymous",
  "name": "logo"
}
```

`width`/`height` in Fabric.js image JSON = natural pixel dimensions of source. `scaleX`/`scaleY` control rendered size. When natural dimensions are unknown, setting width/height to target display dimensions and scale=1 is a reasonable approximation — the renderer adjusts.

## Related

- [[fabric-canvas-clear-fires-object-removed]] — `canvas.clear()` fires `object:removed` per object; guard React handlers during template switches
- [[fabricjs-bidirectional-text-sync]] — keeping React field state in sync with canvas text edits
