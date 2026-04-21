---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [react, wm, drag, resize, tauri]
---

# Floating WM Tiles in React (Drag + 8-Point Resize)

No library needed. Each tile is `position: absolute` inside a `position: relative` container.

## Tile state (owned by parent)

```tsx
interface TileConfig {
  id: string;
  x: number; y: number; width: number; height: number; zIndex: number;
  // ...any domain fields
}
```

Parent owns all tile positions. Tiles call callbacks; parent updates state. This makes z-index management (bring-to-front) trivial.

## Bring to front

```tsx
const maxZRef = useRef(1);
const handleTileFocus = (id: string) => {
  const z = ++maxZRef.current;
  setTiles(prev => prev.map(t => t.id === id ? { ...t, zIndex: z } : t));
};
```

Use a ref (not state) for the counter — no render needed.

## Drag (title bar)

```tsx
const handleDragStart = (e: React.MouseEvent) => {
  if ((e.target as HTMLElement).closest("button")) return; // don't drag on close button
  e.preventDefault();
  onFocus(tile.id);
  const start = { x: e.clientX, y: e.clientY, tx: tile.x, ty: tile.y };
  const onMove = (ev: MouseEvent) =>
    onUpdate(tile.id, { x: start.tx + ev.clientX - start.x, y: start.ty + ev.clientY - start.y });
  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
};
```

## 8-Point Resize

Handle definitions (position absolute, zIndex above content):

```tsx
const HANDLES = [
  { id: "n",  style: { top: 0,    left: 8,   right: 8,  height: 4, cursor: "ns-resize" } },
  { id: "s",  style: { bottom: 0, left: 8,   right: 8,  height: 4, cursor: "ns-resize" } },
  { id: "e",  style: { right: 0,  top: 8,    bottom: 8, width: 4,  cursor: "ew-resize" } },
  { id: "w",  style: { left: 0,   top: 8,    bottom: 8, width: 4,  cursor: "ew-resize" } },
  { id: "ne", style: { top: 0,    right: 0,  width: 10, height: 10, cursor: "nesw-resize" } },
  { id: "nw", style: { top: 0,    left: 0,   width: 10, height: 10, cursor: "nwse-resize" } },
  { id: "se", style: { bottom: 0, right: 0,  width: 10, height: 10, cursor: "nwse-resize" } },
  { id: "sw", style: { bottom: 0, left: 0,   width: 10, height: 10, cursor: "nesw-resize" } },
];
```

Resize delta math:

```tsx
function applyResize(handle, origin, dx, dy) {
  let { x, y, w, h } = origin;
  if (handle.includes("e")) w = Math.max(MIN_W, w + dx);
  if (handle.includes("w")) { const nw = Math.max(MIN_W, w - dx); x += w - nw; w = nw; }
  if (handle.includes("s")) h = Math.max(MIN_H, h + dy);
  if (handle.includes("n")) { const nh = Math.max(MIN_H, h - dy); y += h - nh; h = nh; }
  return { x, y, width: w, height: h };
}
```

`n` and `w` handles move the origin (x/y) as they resize — the tile's opposite edge stays fixed.

## Stagger new tiles

```tsx
const offset = (tiles.length % 8) * 24;
const newTile = { x: 40 + offset, y: 40 + offset, width: 660, height: 420, zIndex: ++maxZ, ... };
```

## Re-fitting embedded terminals on resize

Debounce PTY resize to avoid hammering the backend:

```tsx
useEffect(() => {
  if (resizeTimer.current) clearTimeout(resizeTimer.current);
  resizeTimer.current = setTimeout(() => {
    fitAddon.fit();
    const dim = fitAddon.proposeDimensions();
    if (dim) invoke("pty_resize", { pty_id: ptyIdRef.current, rows: dim.rows, cols: dim.cols });
  }, 60);
}, [tile.width, tile.height]);
```

## Related

- [[drag-resize-sidebar]] — simpler 1D drag for sidebars
- [[tauri-async-runtime]] — PTY management in Tauri

<!-- orphan: 0 inbound links as of 2026-04-20 -->
