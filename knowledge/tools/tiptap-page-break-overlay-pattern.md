---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, prosemirror, react, css, #gotcha]
---

# Tiptap: Visual Page Breaks (Overlay Approach)

True pagination in Tiptap (splitting content across separate DOM containers) requires one ProseMirror instance per page — impractical with Yjs/Collaboration. The overlay approach gives 95% of the visual effect with zero editor changes.

## Pattern

Wrap `<EditorContent>` in a `position: relative` div. Render absolutely-positioned gray bands at `PAGE_HEIGHT * n` px intervals as siblings.

```
.pageWrapper (position: relative, width: 816px, margin: 0 auto)
  ├── EditorContent (.editor — white paper, padding: 96px)
  └── PageBreaksOverlay (renders .pageBreak divs absolutely)
```

## PageBreaksOverlay

```tsx
const PAGE_H = 1056  // US Letter at 96dpi
const PAD = 96       // 1-inch margin

export default function PageBreaksOverlay({ containerRef }) {
  const [positions, setPositions] = useState<number[]>([])

  useEffect(() => {
    const pm = containerRef.current?.querySelector('.ProseMirror')
    if (!pm) return
    const compute = () => {
      const total = PAD + pm.offsetHeight + PAD
      const n = Math.floor(total / PAGE_H)
      setPositions(Array.from({ length: n }, (_, i) => PAGE_H * (i + 1)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(pm)
    return () => ro.disconnect()
  }, [containerRef])

  return <>{positions.map(y => <div key={y} className={s.pageBreak} style={{ top: y }} />)}</>
}
```

## CSS

```css
.pageBreak {
  position: absolute;
  left: -96px; right: -96px;  /* bleed past paper padding */
  height: 24px;
  background: #e8eaed;
  pointer-events: none;
  z-index: 5;
}
.pageBreak::before {
  content: ''; position: absolute; bottom: 100%; left: 0; right: 0;
  height: 10px;
  background: linear-gradient(to bottom, transparent, rgba(0,0,0,0.08));
}
.pageBreak::after {
  content: ''; position: absolute; top: 100%; left: 0; right: 0;
  height: 10px;
  background: linear-gradient(to top, transparent, rgba(0,0,0,0.06));
}
```

## Known Limitation

Text that happens to fall on a page boundary flows through the gray band. This is unavoidable without actually splitting ProseMirror. Uncommon in practice — most users don't notice.

## Web View Toggle

```tsx
const [pageView, setPageView] = useState(() => localStorage.getItem('pageView') !== 'false')
```

Apply `.editorWeb { min-height: 0 }` when not in page view to remove the 1056px floor.

## Related

- [Tiptap embedded widget node pattern](tiptap-embedded-widget-node-pattern.md)
- [Tiptap inline image + formula patterns](tiptap-inline-image-formula-patterns.md)
