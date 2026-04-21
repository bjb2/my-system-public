---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, prosemirror, search, #gotcha]
---

# ProseMirror: Custom Search Highlight Extension (Tiptap)

Tiptap has no free search/replace extension. Implement via ProseMirror decorations.

## Core Pattern

```typescript
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'

const searchKey = new PluginKey('search')

function buildDecorations(doc: Node, term: string, caseSensitive: boolean): DecorationSet {
  if (!term) return DecorationSet.empty
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi')
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    re.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = re.exec(node.text)) !== null) {
      decorations.push(
        Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
          class: 'search-highlight'
        })
      )
    }
  })
  return DecorationSet.create(doc, decorations)
}
```

## Plugin State

```typescript
new Plugin({
  key: searchKey,
  state: {
    init(_, { doc }) { return buildDecorations(doc, '', false) },
    apply(tr, old, _, newState) {
      // Rebuild on doc change; map existing decorations on pure selection changes
      if (tr.docChanged) {
        return buildDecorations(newState.doc, term, caseSensitive)
      }
      return old.map(tr.mapping, tr.doc)
    }
  },
  props: {
    decorations(state) { return searchKey.getState(state) }
  }
})
```

## #gotcha: Storage Access in Plugin `apply`

The plugin `apply` is a static function — it can't access `this.storage` directly. Store the term reference via closure from the Extension's `addProseMirrorPlugins()`:

```typescript
addProseMirrorPlugins() {
  const ext = this  // capture Extension instance
  return [new Plugin({
    state: {
      apply(tr, old, _, newState) {
        const { term, caseSensitive } = ext.storage  // access via closure
        if (tr.docChanged) return buildDecorations(newState.doc, term, caseSensitive)
        return old.map(tr.mapping, tr.doc)
      }
    }
  })]
}
```

## Replace Implementation

Walk text nodes in position order, collect ranges, apply transaction with offset tracking:

```typescript
replaceAll: (replacement) => ({ editor, tr, dispatch }) => {
  const ranges: Array<{ from: number; to: number }> = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    // ... collect ranges
  })

  let offset = 0
  for (const { from, to } of ranges) {
    tr.replaceWith(from + offset, to + offset, editor.schema.text(replacement))
    offset += replacement.length - (to - from)  // adjust for length change
  }
  dispatch(tr)
}
```

## CSS

```css
.search-highlight {
  background: #fef08a;  /* yellow */
  border-radius: 2px;
}
```

## Related

- [Tiptap collab/Yjs pattern](./tiptap-collab-yjs-supabase.md)

<!-- orphan: 0 inbound links as of 2026-04-20 -->
