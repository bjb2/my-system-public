# Drag-to-Resize Sidebar (React)

Mouse-drag resize for a right sidebar panel, no library needed.

## Pattern

```tsx
const [width, setWidth] = useState(480);
const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

// On the left edge of the sidebar:
<div
  style={{ width: "4px", cursor: "col-resize" }}
  onMouseDown={e => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - ev.clientX; // left-edge: invert delta
      const next = Math.max(MIN, Math.min(MAX, dragRef.current.startWidth + delta));
      setWidth(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }}
/>
```

Key points:

- Listeners go on `window`, not the handle — prevents losing track when mouse moves fast
- `dragRef` (not state) stores drag origin — avoids stale closure on move
- Left-edge handle: delta = `startX - currentX` (dragging left = expanding)
- Right-edge handle: delta = `currentX - startX`
- Clamp to `Math.max(MIN, Math.min(MAX, ...))` for hard limits

## Keeping hidden panels alive (critical gotcha)

**Wrong approach** — two conditional renders at different tree positions:

```tsx
{open && <MyPanel visible={true} />}
{!open && <MyPanel visible={false} />}  // ← different instance, all state lost on toggle
```

React unmounts one and mounts the other on every toggle. PTY sessions, WebSocket connections, scroll position — all gone.

**Right approach** — single instance, CSS controls visibility:

```tsx
<div style={{ width: open ? width : 0, overflow: "hidden", flexShrink: 0 }}>
  <MyPanel visible={open} />  {/* always mounted, never unmounts */}
</div>
```

When `width: 0` + `overflow: hidden`, the panel is invisible and non-interactive. When `width > 0`, it reappears with full state intact. The ResizeObserver inside the panel fires on width change and can refit accordingly.

## Related

- \[\[tauri-dev-setup\]\] — PTY sessions this pattern was built for