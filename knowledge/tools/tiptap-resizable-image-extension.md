---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, frontend, canvas, image, #gotcha]
---

# Tiptap: Resizable Images + Canvas Compression

## Pattern

Extend the built-in `@tiptap/extension-image` with a `width` attribute and a `ReactNodeViewRenderer`. Drag handles live in the React component; dimension changes go through `updateAttributes`. Compression uses canvas — no extra packages.

## Canvas Compression (no new packages)

```ts
// src/lib/imageUtils.ts
export async function compressImage(file: File, maxWidth = 1920): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, maxWidth / img.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => {
        const reader = new FileReader()
        reader.onload = e => resolve(e.target!.result as string)
        reader.readAsDataURL(blob!)
      }, 'image/jpeg', 0.85)
    }
    img.src = objectUrl
  })
}
```

## Extension

```ts
// src/lib/ResizableImageExtension.ts
import TiptapImage from '@tiptap/extension-image'
import { ReactNodeViewRenderer } from '@tiptap/react'
import ResizableImage from '../components/ResizableImage'

export const ResizableImageExtension = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: el => el.getAttribute('width') || null,
        renderHTML: attrs => (attrs.width ? { width: attrs.width } : {}),
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImage)
  },
})
```

## Node View (drag handles)

```tsx
// src/components/ResizableImage.tsx
export default function ResizableImage({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const { src, alt, title, width } = node.attrs

  function startResize(e: React.MouseEvent, corner: string) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX
    const startWidth = imgRef.current?.offsetWidth ?? (width ?? 300)
    const fromRight = corner === 'tr' || corner === 'br'

    function onMove(me: MouseEvent) {
      const delta = fromRight ? me.clientX - startX : startX - me.clientX
      updateAttributes({ width: Math.max(80, Math.round(startWidth + delta)) })
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <NodeViewWrapper style={width ? { width } : {}}>
      <img ref={imgRef} src={src} alt={alt} title={title}
           style={width ? { width, height: 'auto' } : {}} draggable="false" />
      {selected && ['tl','tr','bl','br'].map(c => (
        <div key={c} className={`handle ${c}`} onMouseDown={e => startResize(e, c)} />
      ))}
    </NodeViewWrapper>
  )
}
```

## Wire-up in Editor.tsx

```tsx
// Replace: import TiptapImage from '@tiptap/extension-image'
import { ResizableImageExtension } from '../lib/ResizableImageExtension'
import { compressImage } from '../lib/imageUtils'

// In extensions array — replace TiptapImage.configure(...)
ResizableImageExtension.configure({ inline: false }),

// Replace the raw FileReader upload handler
async function handleImageUpload(file: File) {
  if (!editor) return
  const src = await compressImage(file)
  editor.chain().focus().setImage({ src }).run()
}
```

## Gotchas

- **`draggable="false"` on img** — without this, browser native drag-and-drop hijacks the corner drag and moves the whole image instead of resizing it.
- **`e.stopPropagation()` on mousedown** — prevents Tiptap from deselecting the node while dragging.
- **`document` listeners, not element listeners** — mouse can exit the handle while dragging fast; attach `mousemove`/`mouseup` to `document`, clean up on `mouseup`.
- **Left/right corners compute delta differently** — right corners: `clientX - startX`; left corners: `startX - clientX`. Both keep the image growing rightward visually.
- **`width` stored as number in `updateAttributes`** but rendered as HTML attribute string — `renderHTML` casts cleanly; `parseHTML` returns string, so store consistently as number if you want arithmetic.
- **Text-align + resize handles require two wrapper layers** — if you make `NodeViewWrapper` full-width (`display: block; width: 100%`) to support `textAlign`, handles positioned `absolute` will spread to the full page width. Fix: nest an `inline-block` inner wrapper sized to the image; put `position: relative` and the handles on the inner wrapper, `textAlign` on the outer. Structure: `NodeViewWrapper (block, 100%, textAlign) → div.imgWrap (inline-block, relative, sized to image) → img + handles`.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
