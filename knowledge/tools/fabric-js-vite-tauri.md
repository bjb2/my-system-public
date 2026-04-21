---
type: knowledge
created: 2026-04-18
updated: 2026-04-20
tags: [fabric, canvas, vite, tauri, design-tool, #gotcha]
---

# Fabric.js v5 in Vite + Tauri

Gotchas and patterns for using Fabric.js v5 as an in-app canvas editor inside a Tauri 2 / Vite / React project.

## Setup

```bash
npm install fabric@5
npm install --save-dev @types/fabric
```

**vite.config.ts** — fabric v5 is CommonJS; Vite needs explicit pre-bundling:

```ts
optimizeDeps: { include: ["fabric"] }
```

**Import:**
```ts
import { fabric } from "fabric";
```

## Canvas Init Pattern (React)

Use a `fontReady` gate — Fabric renders text using browser canvas, so the font MUST be loaded before the canvas is initialized or text measures/renders wrong.

```ts
const fabricRef = useRef<fabric.Canvas | null>(null);

// 1. Load font
useEffect(() => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;800&display=swap";
  link.onload = () =>
    Promise.all([
      document.fonts.load("800 20px Figtree"),
      document.fonts.load("400 20px Figtree"),
    ]).then(() => setFontReady(true));
  document.head.appendChild(link);
}, []);

// 2. Init canvas ONLY after font is ready
useEffect(() => {
  if (!fontReady || !canvasElRef.current || fabricRef.current) return;
  const fc = new fabric.Canvas(canvasElRef.current, { width: 1080, height: 1080 });
  fabricRef.current = fc;
  // ... apply template, set zoom ...
  return () => { fc.dispose(); fabricRef.current = null; };
}, [fontReady]);
```

## Display Zoom + Full-Res Export

Keep internal coordinates at design resolution (1080×1080). Scale down for display via zoom + resize.

```ts
const DISPLAY_W = 520;
const zoom = DISPLAY_W / 1080; // ~0.48

fc.setZoom(zoom);
fc.setWidth(DISPLAY_W);
fc.setHeight(Math.round(1080 * zoom));
```

**Export at full res** — temporarily reset zoom:

```ts
fc.setZoom(1);
fc.setWidth(1080);
fc.setHeight(1080);
fc.renderAll();
const dataUrl = fc.toDataURL({ format: "png", multiplier: 1 });
// restore
fc.setZoom(zoom);
fc.setWidth(DISPLAY_W);
fc.setHeight(Math.round(1080 * zoom));
fc.renderAll();
const b64 = dataUrl.split(",")[1];
await invoke("write_file_bytes", { path, b64 });
```

## Use Textbox, Not IText

`fabric.IText` doesn't wrap — use `fabric.Textbox` for any text that should wrap within a width:

```ts
new fabric.Textbox("headline text", {
  name: "headline",   // name used to find and patch the object later
  left: 90, top: 320,
  width: 900,         // wrapping width
  fontSize: 86, fontFamily: "Figtree", fontWeight: "800",
  fill: "#fbf7f3", textAlign: "center",
  selectable: true, editable: true,
})
```

## Syncing Form Fields → Canvas Objects

Identify objects by `name` property; patch on field change without rebuilding:

```ts
useEffect(() => {
  const fc = fabricRef.current;
  if (!fc) return;
  let dirty = false;
  fc.getObjects().forEach(obj => {
    const tb = obj as fabric.Textbox;
    if ((obj as any).name === "headline" && tb.text !== newValue) {
      tb.set({ text: newValue }); dirty = true;
    }
  });
  if (dirty) fc.renderAll();
}, [headline]);
```

## Prevent Infinite Template Re-Apply

When style/size changes trigger a full canvas rebuild, use a ref to track last-applied key:

```ts
const prevTemplateRef = useRef("");
useEffect(() => {
  const key = `${style}|${size}`;
  if (key === prevTemplateRef.current || !fabricRef.current) return;
  prevTemplateRef.current = key;
  // rebuild canvas...
}, [style, size]);
```

## Selection Events

```ts
fc.on("selection:created", (e: fabric.IEvent & { selected?: fabric.Object[] }) => {
  syncSelectionProps(e.selected?.[0]);
});
fc.on("selection:updated", (e: fabric.IEvent & { selected?: fabric.Object[] }) => {
  syncSelectionProps(e.selected?.[0]);
});
fc.on("selection:cleared", () => setSelProps(null));
```

The selected object is mutable (by ref), so to update the React property panel after patching, call `syncSelectionProps(active)` again after every `active.set({...})`.

## Patching Selected Object

```ts
const active = fabricRef.current?.getActiveObject();
active?.set({ fill: "#new-color", fontSize: 72 });
fabricRef.current?.renderAll();
```

## Fabric Object Z-Order

```ts
obj.bringForward();   // move up one layer
obj.sendBackwards();  // move down one layer
obj.bringToFront();
obj.sendToBack();
```

## Background Color

`canvas.setBackgroundColor` is async (callback-based in v5):

```ts
canvas.setBackgroundColor("#131354", () => {});
// call canvas.renderAll() separately after adding all objects
```

## Loading Images into Canvas (Tauri)

**Don't use Vite `?url` imports for images** — Tauri's tsconfig won't have `vite/client` types, causing TS errors. Instead, put images in `public/` and reference as plain strings:

```ts
const LOGO_URL = "/outgoing-logo-dark.png"; // served from public/
```

Load with `fabric.Image.fromURL` (async, callback-based in v5):

```ts
fabric.Image.fromURL(url, (img) => {
  if (!img || !img.width) return;
  const scale = targetWidth / img.width;
  img.set({ name: "logo", scaleX: scale, scaleY: scale, left: x, top: y, selectable: true });
  // remove prior instance by name before adding new one
  const prev = canvas.getObjects().find(o => (o as any).name === "logo");
  if (prev) canvas.remove(prev);
  canvas.add(img);
  canvas.renderAll();
}, { crossOrigin: "anonymous" });
```

**Re-adding logos after template rebuild** — template functions call `canvas.clear()`, which removes images too. Track active logo in a `useRef` (not just state, since the effect closure may capture stale state) and re-call `addLogoToCanvas` at the end of the template re-apply effect:

```ts
const activeLogoRef = useRef<"wordmark" | "icon" | null>(null);

// in template re-apply effect:
TEMPLATES[style](fc, fields, size);
// ...
if (activeLogoRef.current) addLogoToCanvas(activeLogoRef.current, size);
```

**Per-template logo positioning via STYLE_META** — when templates need the logo at different positions (e.g. a "Brand Dark" template with the wordmark large at the top vs. a generic template with the logo small at the bottom), store positioning in a metadata record keyed by style preset rather than hardcoding in `addLogoToCanvas`:

```ts
const STYLE_META: Record<StylePreset, {
  label: string; bg: string; fg: string;
  defaultLogo?: "wordmark" | "icon"; // auto-load on template switch
  logoTop?: number;       // fraction of h (default 0.76)
  logoWidthFrac?: number; // wordmark width as fraction of w (default 0.38)
  logoLeft?: number;      // absolute px; undefined = centered
}> = {
  navy:    { label: "Navy", bg: "#131354", fg: "#fbf7f3" },
  "wm-dark": { label: "Brand Dark", bg: "#131354", fg: "#fbf7f3",
               defaultLogo: "wordmark", logoTop: 0.10, logoWidthFrac: 0.52 },
  minimal: { label: "Minimal", bg: "#ffffff", fg: "#131354",
             defaultLogo: "wordmark", logoTop: 0.07, logoWidthFrac: 0.44, logoLeft: 100 },
  // ...
};

function addLogoToCanvas(variant, currentSize) {
  const meta = STYLE_META[styleRef.current];
  const logoTopFrac = meta.logoTop ?? 0.76;
  const logoWFrac   = variant === "wordmark" ? (meta.logoWidthFrac ?? 0.38) : 0.16;
  // ...
  const logoLeft = meta.logoLeft !== undefined ? meta.logoLeft : (w - targetW) / 2;
  img.set({ left: logoLeft, top: h * logoTopFrac, ... });
}

// in template re-apply effect — auto-load default logo for branded templates:
const meta = STYLE_META[style];
if (meta.defaultLogo) {
  addLogoToCanvas(meta.defaultLogo, size);
} else if (activeLogoRef.current) {
  addLogoToCanvas(activeLogoRef.current, size);
}
```

`logoLeft` as absolute px (not a fraction) is intentional for left-aligned layouts where the logo should align with left-aligned text at a fixed indent, not center within the canvas width.

**`data:` URLs from FileReader don't need `crossOrigin`** — only HTTP-served assets need `{ crossOrigin: "anonymous" }`. Dropping a file via `FileReader.readAsDataURL` gives an inline data URL; omit the crossOrigin option or it may error.

## Layer Management Panel

`canvas.getObjects()` returns objects in z-order (index 0 = bottom, last = top). For a UI where "top of list = topmost on canvas", reverse the array and convert indices:

```ts
function syncLayers() {
  const objs = fc.getObjects().filter(o => (o as any).name !== "_cropRect");
  setLayers([...objs].reverse().map((obj, i) => ({
    idx: i, name: objDisplayName(obj), type: guessObjType(obj),
    visible: obj.visible !== false, fabricObj: obj,
  })));
}
```

**Index inversion for `moveTo`** — display index 0 = top = canvas index `total - 1`:
```ts
const toCanvasIdx = total - 1 - toDisplayIdx;
fc.moveTo(obj, toCanvasIdx);
```

**`canvas.getObjects()` does NOT include the background** when set via `setBackgroundColor` — only objects added via `canvas.add()`. Layers list stays clean.

**Wire object:added/removed events** during canvas init to keep layers in sync automatically:
```ts
fc.on("object:added",    () => syncLayers());
fc.on("object:removed",  () => syncLayers());
fc.on("object:modified", () => { pushHistory(); syncLayers(); });
```

**Custom `_layerName` property** survives `loadFromJSON` only if included in `toJSON`:
```ts
canvas.toJSON(["name", "_layerName", "clipPath"])
```

## Undo/Redo (JSON Snapshot Stack)

Fabric 5 supports `canvas.toJSON()` + `canvas.loadFromJSON()` for snapshot-based undo:

```ts
const historyRef    = useRef<string[]>([]);
const historyIdxRef = useRef(-1);

function pushHistory() {
  const snap = JSON.stringify(fc.toJSON(["name", "_layerName", "clipPath"]));
  historyRef.current.splice(historyIdxRef.current + 1); // truncate redo branch
  historyRef.current.push(snap);
  if (historyRef.current.length > 20) historyRef.current.shift();
  historyIdxRef.current = historyRef.current.length - 1;
}

function restoreSnapshot(snap: string) {
  fc.loadFromJSON(snap, () => {
    // loadFromJSON may reset canvas dimensions — re-apply zoom/size
    const { w, h } = SIZES[sizeRef.current];
    const zoom = DISPLAY_W / w;
    fc.setZoom(zoom);
    fc.setWidth(DISPLAY_W);
    fc.setHeight(Math.round(h * zoom));
    fc.renderAll();
    syncLayers();
  });
}
```

**`data:` image URLs in snapshots** — dropped photos stored as data URLs ARE serialized in `toJSON().objects[].src`. Snapshots with photos will be large (~MB each), but that's fine for desktop. Cap at 20.

**`loadFromJSON` does NOT change viewport transform** — but it may reset canvas `width`/`height` to the JSON-stored values. Always re-apply display zoom after loading.

## Crop with clipPath

Fabric 5's `clipPath` is the correct crop approach — no library needed.

```ts
// Add crop overlay rect on top of image
const cr = new fabric.Rect({
  name: "_cropRect", left: b.left + inset, top: b.top + inset,
  width: b.width - inset*2, height: b.height - inset*2,
  fill: "rgba(0,0,0,0.05)", stroke: "#ffffff", strokeWidth: 2,
  strokeDashArray: [8, 4], selectable: true, hasControls: true,
});
fc.add(cr);
fc.setActiveObject(cr);

// On apply — convert canvas coords to image local space, then set clipPath
const b = cr.getBoundingRect(true); // canvas-space coords
const scaleX = img.scaleX || 1;
const scaleY = img.scaleY || 1;
// Fabric local space: center of object = (0,0)
const clip = new fabric.Rect({
  left:   (b.left - (img.left ?? 0)) / scaleX - (img.width ?? 0) / 2,
  top:    (b.top  - (img.top  ?? 0)) / scaleY - (img.height ?? 0) / 2,
  width:  b.width  / scaleX,
  height: b.height / scaleY,
  // NO absolutePositioned — clip travels with the image on move/resize
});
img.set({ clipPath: clip });
```

**#gotcha `absolutePositioned: true` breaks move** — it sounds like the right choice (crop rect is in canvas coords), but it pins the clip to the canvas. When you move the image, the clip stays put and the visible region shifts. The fix: omit `absolutePositioned` (defaults to `false`) and convert coords to the image's local space where center = (0, 0).

**Local space formula** — for `originX: 'left'` (Fabric default): `localX = (canvasX - img.left) / scaleX - img.width / 2`. This correctly maps the canvas-space crop rect to the object-relative clip rect.

**`getBoundingRect(true)` returns canvas coordinates** (full-res, not display pixels). Since zoom only affects display rendering, these values are in the 0–1080 space.

**Dim other objects during crop** by setting `selectable: false` and reducing `opacity`. Restore on exit (divide back by the dim factor, cap at 1).

## Canvas Sidecar Pattern (Round-Trip Editing)

Save a `.canvas.json` alongside every exported PNG so the canvas can be reopened and modified. The JSON stores all UI state needed to restore the editor exactly.

**Sidecar format:**
```json
{
  "version": 1,
  "style": "navy",
  "size": "square",
  "fields": { "headline": "...", "subtext": "...", "brand": "..." },
  "activeLogo": "wordmark",
  "canvas": { ...canvas.toJSON(["name", "_layerName", "clipPath"])... }
}
```

**On save** — write both files atomically:
```ts
const sidecar = { version: 1, style, size, fields, activeLogo,
  canvas: fc.toJSON(["name", "_layerName", "clipPath"]) };
await invoke("write_file_bytes", { path: `${destDir}/${name}`, b64 });
await invoke("write_file", { path: `${destDir}/${name}.canvas.json`,
  content: JSON.stringify(sidecar, null, 2) });
```

**On load (from `initialCanvasJson` prop)** — skip template apply, load from JSON, and suppress the template re-apply effect:
```ts
if (initialCanvasJson) {
  const parsed = JSON.parse(initialCanvasJson);
  const { w: lw, h: lh } = SIZES[parsed.size ?? "square"];
  const lZoom = DISPLAY_W / lw;
  fc.setWidth(lw); fc.setHeight(lh);
  fc.loadFromJSON(parsed.canvas, () => {
    fc.setZoom(lZoom);
    fc.setWidth(DISPLAY_W);
    fc.setHeight(Math.round(lh * lZoom));
    fc.renderAll();
  });
  // Restore React state
  setStyle(parsed.style); setSize(parsed.size);
  setFields(parsed.fields); setActiveLogo(parsed.activeLogo);
  // Prevent template re-apply effect from overwriting the loaded canvas
  prevTemplateRef.current = `${parsed.style}|${parsed.size}`;
  sizeRef.current = parsed.size; styleRef.current = parsed.style;
}
```

**Key gotcha: `prevTemplateRef` is settable from the canvas init effect** even though it's declared later in the component source — React hooks all run during the render phase before effects fire, so the ref is initialized by the time the effect runs.

**Sidecar filename convention:** `identity-card-v1.png` → `identity-card-v1.png.canvas.json`. Append `.canvas.json` (don't strip the `.png`). Keeps association obvious.

**Large files:** `toJSON()` serializes dropped photo data URLs inline — sidecars with photos can be several MB. Acceptable for desktop, but don't serialize these to a database.

## Shapes: Circle, Ellipse, Star, Polygon

All center on the canvas. Use `SIZES[size]` to get `w/h` and express positions as fractions:

```ts
// Circle
new fabric.Circle({ name: `circle_${Date.now()}`, left: w*0.35, top: h*0.35, radius: w*0.15, fill: "#3a39ff", selectable: true });

// Ellipse
new fabric.Ellipse({ name: `ellipse_${Date.now()}`, left: w*0.25, top: h*0.38, rx: w*0.25, ry: h*0.12, fill: "#3a39ff", selectable: true });

// Star (N-pointed, trig construction)
function makeStar(pts: number, cx: number, cy: number, outer: number, inner: number) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < pts * 2; i++) {
    const angle = (i * Math.PI / pts) - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return new fabric.Polygon(points, { name: `star_${Date.now()}`, fill: "#3a39ff", selectable: true });
}
// inner = outer * 0.42 gives a classic 5-point star shape

// Regular polygon (hexagon etc.)
function makePolygon(sides: number, cx: number, cy: number, r: number) {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI / sides) - Math.PI / 2;
    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return new fabric.Polygon(points, { name: `polygon_${Date.now()}`, fill: "#3a39ff", selectable: true });
}
```

**`Polygon` vs `Path`** — `fabric.Polygon` is correct for closed shapes. It serializes/deserializes cleanly in `toJSON/loadFromJSON`. Don't use `Path` for programmatically-defined shapes.

## Stroke Controls

All Fabric objects accept `stroke`, `strokeWidth`, `strokeDashArray`:

```ts
obj.set({
  stroke: "#a6b5ff",
  strokeWidth: 4,
  strokeDashArray: [],        // solid
  // strokeDashArray: [14, 7],  // dash
  // strokeDashArray: [3, 7],   // dot
});
```

**Corner radius for Rect** — `rx` and `ry` (set both the same for uniform rounding):
```ts
(obj as fabric.Rect).set({ rx: 60, ry: 60 });
```

**Sync from selected object** — to populate UI controls, read from the active object:
```ts
const strokeDash: "solid" | "dash" | "dot" =
  !dash || dash.length === 0 ? "solid" :
  (dash[0] ?? 12) <= (dash[1] ?? 6) * 0.6 ? "dot" : "dash";
```

## Image Frames (clipPath Fill)

A frame is a placeholder shape (`_isFrame: true`) that accepts a dropped image. When the image arrives, it's scaled to cover the frame bounds and clipped to the frame's shape.

**Coordinate math** — Fabric `clipPath` uses the object's LOCAL coordinate space, where `(0, 0)` is the center of the object:
```
localX = (canvasX - obj.left) / scaleX - obj.width / 2
localY = (canvasY - obj.top) / scaleY - obj.height / 2
```

**Frame fill for rect** (covers + clips):
```ts
function applyFrameFillRect(fc, img, frame) {
  const b = frame.getBoundingRect(true); // canvas-space: left/top/width/height
  const frx = (frame.rx ?? 0) * (frame.scaleX ?? 1);
  const cov = Math.max(b.width / (img.width ?? 1), b.height / (img.height ?? 1));
  img.set({
    scaleX: cov, scaleY: cov,
    left: b.left + b.width/2  - (img.width  ?? 0) * cov / 2,
    top:  b.top  + b.height/2 - (img.height ?? 0) * cov / 2,
  });
  const clip = new fabric.Rect({
    left:   (b.left - img.left!) / cov - (img.width  ?? 0) / 2,
    top:    (b.top  - img.top!)  / cov - (img.height ?? 0) / 2,
    width:  b.width  / cov, height: b.height / cov,
    rx: frx / cov,  ry: frx / cov,
  });
  img.set({ clipPath: clip });
  (img as any)._frameShape  = "rect";
  (img as any)._frameBounds = { left: b.left, top: b.top, width: b.width, height: b.height, rx: frx, ry: frx };
  fc.remove(frame); fc.add(img); fc.setActiveObject(img); fc.renderAll();
}
```

**Frame fill for circle** — image is centered on the circle, clip is centered on image (so clip local coords are `(-r, -r)` when image is perfectly centered):
```ts
function applyFrameFillCircle(fc, img, frame) {
  const b = frame.getBoundingRect(true);
  const r = b.width / 2, cx = b.left + r, cy = b.top + r;
  const cov = Math.max((r*2) / (img.width ?? 1), (r*2) / (img.height ?? 1));
  img.set({ scaleX: cov, scaleY: cov,
    left: cx - (img.width ?? 0)*cov/2, top: cy - (img.height ?? 0)*cov/2 });
  const clipR = r / cov;
  img.set({ clipPath: new fabric.Circle({ left: -clipR, top: -clipR, radius: clipR }) });
  (img as any)._frameShape = "circle";
  (img as any)._frameBounds = { cx, cy, r };
  fc.remove(frame); fc.add(img); fc.setActiveObject(img); fc.renderAll();
}
```

**Drop-to-fill detection** — use `containsPoint` at the drop position. **#gotcha `containsPoint` expects viewport coordinates (CSS px from canvas edge), NOT canvas-space coords.** Keep two separate values:
```ts
const vpX   = e.clientX - rect.left;   // viewport — for containsPoint
const vpY   = e.clientY - rect.top;
const dropX = vpX / zoom;              // canvas-space — for image.set({ left, top })
const dropY = vpY / zoom;

const frameObj = fc.getObjects().find(o =>
  (o as any)._isFrame &&
  o.containsPoint(new fabric.Point(vpX, vpY))   // ← viewport coords
) ?? null;
```
At 0.48× zoom, passing canvas-space coords to `containsPoint` puts the hit point ~2× off — frame never registers a hit.

**Store `_frameBounds` in canvas-space on the image** so the reposition mode can recalculate the clip when the user moves the image.

**#gotcha custom properties must be listed in every `toJSON` call** or they're silently dropped on undo/redo (which uses `loadFromJSON`). Include all frame properties:
```ts
fc.toJSON(["name", "_layerName", "clipPath", "_frameBounds", "_frameShape", "_isFrame",
           "_isFrameBorder", "_borderForImg", "_borderObjName"])
// Apply this everywhere: pushHistory, handleSave sidecar, AI draft generation
```
If `_frameBounds` is missing after undo, the reposition button won't appear and double-click detection fails silently.

**Frame border companion pattern** — stroke on a `fabric.Image` with a `clipPath` draws around the image's bounding rect, not the clip shape. For a circle clip, this creates rectangle corner arcs (ugly). **Solution**: maintain a companion border object (Circle or Rect) at the same canvas-space position as `_frameBounds`, with `selectable: false, evented: false`. Route all stroke/border-radius edits to the companion rather than the image.

```ts
function addFrameBorderCompanion(fc, img, shape) {
  const bounds = (img as any)._frameBounds;
  const borderName = `frame_border_${img.name}`;
  const existing = fc.getObjects().find(o => o.name === borderName);
  if (existing) fc.remove(existing);

  const border = shape === "circle"
    ? new fabric.Circle({ name: borderName, left: bounds.cx - bounds.r, top: bounds.cy - bounds.r,
        radius: bounds.r, fill: "transparent", stroke: "", strokeWidth: 0,
        selectable: false, evented: false })
    : new fabric.Rect({ name: borderName, left: bounds.left, top: bounds.top,
        width: bounds.width, height: bounds.height, rx: bounds.rx, ry: bounds.ry,
        fill: "transparent", stroke: "", strokeWidth: 0,
        selectable: false, evented: false });

  (border as any)._isFrameBorder = true;
  (border as any)._borderForImg  = img.name;
  (img   as any)._borderObjName  = borderName;
  fc.add(border); fc.bringToFront(border);
}
```

**Editing border radius on a filled rect frame** — update three things atomically: the companion border `rx/ry`, the `clipPath` `rx/ry` (in local image space = `rxCanvas / scaleX`), and `_frameBounds.rx`:
```ts
const cov = active.scaleX ?? 1;
(companion as any).set({ rx: rxVal, ry: rxVal });
(clipPath as fabric.Rect).set({ rx: rxVal / cov, ry: rxVal / cov });
bounds.rx = rxVal; bounds.ry = rxVal;
```

**Layers panel** — filter companion borders from the layers list using `!(o as any)._isFrameBorder`.

**Delete** — always remove the companion when deleting a framed image:
```ts
const bn = (obj as any)._borderObjName;
if (bn) { const b = fc.getObjects().find(o => o.name === bn); if (b) fc.remove(b); }
```

## Reposition-Within-Frame Mode

Double-click a framed image (`img._frameBounds && img.clipPath`) to enter reposition mode. **Do NOT remove the clip.** Instead, switch to an `absolutePositioned: true` clip so the frame window stays fixed in canvas space and the image moves freely underneath it. The user sees exactly the final result while repositioning.

**#gotcha `mouse:dblclick` unreliable in Fabric v5** — `e.target` comes from `_currentTransform` (the last drag target), not `findTarget`. Click-without-drag gives `null`. Use manual double-click detection via `mouse:down` timing:

```ts
let dblTapTime = 0;
let dblTapTarget: fabric.Object | null = null;
fc.on("mouse:down", (e: any) => {
  const now = Date.now();
  const target = e.target ?? null;
  if (target && target === dblTapTarget && now - dblTapTime < 350) {
    if (target instanceof fabric.Image && (target as any)._frameBounds && target.clipPath) {
      enterFramePanMode(target as fabric.Image);
    }
    dblTapTarget = null; dblTapTime = 0;
  } else { dblTapTarget = target; dblTapTime = now; }
});
```

**Entering reposition mode:**
1. Store `img.clipPath` (the image-local clip) in a ref
2. Create an `absolutePositioned: true` clip from `_frameBounds` canvas-space coords
3. Set `img.clipPath = absClip` — frame window fixed; image can be dragged under it
4. Add a dashed outline overlay at the frame boundary (non-selectable/evented)

```ts
const absClip = new fabric.Rect({
  left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
  rx: bounds.rx, ry: bounds.ry, absolutePositioned: true,  // ← key
});
img.set({ clipPath: absClip });
```

On **Apply** — recalculate clip from the stored `_frameBounds` + current image transform:
```ts
// For rect frame:
const clip = new fabric.Rect({
  left:   (bounds.left - img.left!) / scaleX - imgW / 2,
  top:    (bounds.top  - img.top!)  / scaleY - imgH / 2,
  width:  bounds.width  / scaleX,
  height: bounds.height / scaleY,
  rx: bounds.rx / scaleX, ry: bounds.ry / scaleY,
});
img.set({ clipPath: clip });
// For circle frame:
const clipR = bounds.r / scaleX;
const clipCx = (bounds.cx - img.left!) / scaleX - imgW / 2;
const clipCy = (bounds.cy - img.top!)  / scaleY - imgH / 2;
img.set({ clipPath: new fabric.Circle({ left: clipCx - clipR, top: clipCy - clipR, radius: clipR }) });
```

On **Cancel** — restore original clip from ref.

**`mouse:dblclick` event** for entering reposition mode:
```ts
fc.on("mouse:dblclick", (e: any) => {
  const obj = e.target;
  if (obj instanceof fabric.Image && (obj as any)._frameBounds && obj.clipPath) {
    enterFramePanMode(obj);
  }
});
```

**Guide overlay** — add as non-selectable/non-evented shape so it doesn't interfere with image manipulation:
```ts
const overlay = new fabric.Rect({ ..., selectable: false, evented: false });
```

**Dim restore** — when exiting, divide opacity back: `o.set({ opacity: Math.min(1, (o.opacity ?? 1) / 0.25) })`. Cap at 1 to avoid floating-point overflow.

**`getBoundingRect(true)` uses canvas coords** (not viewport/CSS), matching `containsPoint` input and object `left/top`. Use it consistently; don't mix with CSS pixel coordinates.

## Alignment Guides (snap lines on drag)

Draw live alignment guidelines when the user drags objects — snaps to canvas center, canvas edges, and other object edges/centers.

**Pattern:** Use `object:moving` to compute snaps + update a module-level `activeGuides` array, and `after:render` to paint lines on the raw canvas context.

```ts
const SNAP_THRESHOLD = 6; // display pixels
interface Guide { x?: number; y?: number }
let activeGuides: Guide[] = [];

fc.on("object:moving", (e: any) => {
  const obj = e.target as fabric.Object;
  const zoom      = fc.getZoom();
  const threshold = SNAP_THRESHOLD / zoom;          // convert to canvas space
  const cw = fc.getWidth() / zoom;
  const ch = fc.getHeight() / zoom;

  const objLeft = obj.left!;
  const objTop  = obj.top!;
  const objW    = obj.getScaledWidth();
  const objH    = obj.getScaledHeight();
  const cxObj   = objLeft + objW / 2;
  const cyObj   = objTop  + objH / 2;

  const guides: Guide[] = [];
  let snapLeft = objLeft, snapTop = objTop;

  // Canvas center
  if (Math.abs(cxObj - cw / 2) < threshold) { snapLeft = cw/2 - objW/2; guides.push({ x: cw/2 }); }
  if (Math.abs(cyObj - ch / 2) < threshold) { snapTop  = ch/2 - objH/2; guides.push({ y: ch/2 }); }

  // Other objects: center + all 4 edges
  for (const other of fc.getObjects().filter(o => o !== obj)) {
    const oLeft = other.left!, oTop = other.top!;
    const oW = other.getScaledWidth(), oH = other.getScaledHeight();
    const ocx = oLeft + oW/2, ocy = oTop + oH/2;
    // ... edge/center comparisons, push guides, set snapLeft/snapTop
  }

  obj.set({ left: snapLeft, top: snapTop });
  activeGuides = guides;
  fc.renderAll();
});

fc.on("object:modified", () => { activeGuides = []; fc.renderAll(); });
fc.on("mouse:up",        () => { activeGuides = []; fc.renderAll(); });

fc.on("after:render", () => {
  if (!activeGuides.length) return;
  const ctx  = fc.getContext();
  const zoom = fc.getZoom();
  ctx.save();
  ctx.strokeStyle = "rgba(0,200,255,0.85)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 3]);
  for (const g of activeGuides) {
    if (g.x !== undefined) {
      ctx.beginPath(); ctx.moveTo(g.x * zoom, 0); ctx.lineTo(g.x * zoom, fc.getHeight()); ctx.stroke();
    }
    if (g.y !== undefined) {
      ctx.beginPath(); ctx.moveTo(0, g.y * zoom); ctx.lineTo(fc.getWidth(), g.y * zoom); ctx.stroke();
    }
  }
  ctx.restore();
});
```

**Key gotchas:**
- Threshold must be divided by `zoom` to work in canvas coords (`object:moving` gives canvas-space `left/top`, not display pixels).
- `fc.getWidth()` returns display pixels; divide by zoom to get canvas coords for center/edge calculations.
- `after:render` coords must be multiplied by zoom back to display pixels for drawing.
- Deduplicate guide positions before drawing to avoid redundant lines.
- Clear guides on both `object:modified` AND `mouse:up` — `modified` fires after drag ends, but `mouse:up` catches cases where the object didn't actually move.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
