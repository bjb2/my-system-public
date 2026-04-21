---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, yjs, supabase, collaboration, #gotcha]
---

# Tiptap: Real-Time Collaboration via Yjs + Supabase Realtime

## Pattern: SupabaseProvider for Yjs

Supabase Realtime broadcast channels work as a Yjs transport. Write a custom provider instead of using `y-websocket` (requires separate server).

```typescript
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'
import { supabase } from './supabase'

export class SupabaseProvider {
  ydoc: Y.Doc
  awareness: Awareness
  private channel: RealtimeChannel

  constructor(ydoc: Y.Doc, docId: string, user: { name: string; color: string }) {
    this.ydoc = ydoc
    this.awareness = new Awareness(ydoc)
    this.awareness.setLocalStateField('user', user)

    this.channel = supabase.channel(`doc:${docId}`, {
      config: { broadcast: { self: false } }  // don't echo back to sender
    })

    this.channel
      .on('broadcast', { event: 'ydoc' }, ({ payload }) => {
        Y.applyUpdate(ydoc, new Uint8Array(payload.update), 'remote')
      })
      .on('broadcast', { event: 'awareness' }, ({ payload }) => {
        applyAwarenessUpdate(this.awareness, new Uint8Array(payload.update), 'remote')
      })
      .subscribe()

    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote') return  // avoid echo loop
      this.channel.send({ type: 'broadcast', event: 'ydoc', payload: { update: Array.from(update) } })
    })

    this.awareness.on('update', ({ added, updated, removed }) => {
      const update = encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed])
      this.channel.send({ type: 'broadcast', event: 'awareness', payload: { update: Array.from(update) } })
    })
  }

  destroy() {
    this.awareness.destroy()
    supabase.removeChannel(this.channel)
  }
}
```

## Tiptap Editor Setup

```typescript
// disable StarterKit history — Collaboration handles it
StarterKit.configure({ history: false }),
Collaboration.configure({ document: ydoc }),
CollaborationCursor.configure({ provider, user: { name, color } }),
```

CollaborationCursor reads `provider.awareness` — the custom provider exposes this directly.

## #gotcha: Initial Content Population

When Collaboration extension is active, `editor.commands.setContent()` routes through Yjs. Check if the Y.Doc XML fragment is empty before setting:

```typescript
const fragment = ydoc.getXmlFragment('default')  // 'default' is the Collaboration field name
if (fragment.length === 0 && hasExistingContent) {
  editor.commands.setContent(savedJSON)  // this works, goes through Yjs
}
```

## Persistence: Store ydoc_state

Persist Y.Doc state alongside JSON content so late-joining users get current state:

```typescript
// Decode on load:
const bytes = Uint8Array.from(atob(ydocState), c => c.charCodeAt(0))
Y.applyUpdate(ydoc, bytes)
```

### #gotcha: `String.fromCharCode(...largeArray)` Stack Overflow

`btoa(String.fromCharCode(...Y.encodeStateAsUpdate(ydoc)))` crashes with "Maximum call stack size exceeded" once the ydoc state exceeds ~65k bytes — which happens any time images are embedded as base64. The spread operator passes all bytes as individual function arguments, blowing the call stack.

**Fix**: chunk the array:

```typescript
const bytes = Y.encodeStateAsUpdate(ydoc)
let binary = ''
const chunk = 8192
for (let i = 0; i < bytes.length; i += chunk) {
  binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
}
const ydocState = btoa(binary)
```

This is silent — the `await supabase...update()` call simply never returns if the `btoa()` throws, leaving the UI stuck at "Saving…" with no error in the console (the exception is thrown synchronously before the async chain begins).

## #gotcha: Tiptap Version Peer Dependency Conflicts

All Tiptap packages must be the same major version. `@tiptap/extension-underline@3.x` alongside `@tiptap/core@2.x` causes npm peer dependency errors when installing any new `@2` package. Fix: `npm install @tiptap/extension-underline@^2` before installing other v2 packages.

## Packages

```
yjs y-protocols
@tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

## Related

- [Supabase RLS gotchas](./supabase-rls-insert-gotcha.md)
- [Tiptap DOCX export pattern](./tiptap-docx-export-pattern.md)

<!-- orphan: 0 inbound links as of 2026-04-20 -->
