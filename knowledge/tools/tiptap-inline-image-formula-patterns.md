---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, privacy-docs, #gotcha]
---

## Markdown Export — Turndown with Custom Table Rule

`turndown` (HTML → GFM markdown) is the simplest path for Tiptap markdown export. `editor.getHTML()` gives clean HTML; turndown handles headings, lists, bold/italic, code blocks. Tables require a custom rule because turndown's default doesn't produce GFM pipe syntax reliably.

```typescript
import TurndownService from 'turndown'

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })

td.addRule('table', {
  filter: 'table',
  replacement: (_content, node) => {
    const rows: string[][] = []
    ;(node as HTMLElement).querySelectorAll('tr').forEach(tr => {
      const cells: string[] = []
      tr.querySelectorAll('th, td').forEach(cell =>
        cells.push((cell as HTMLElement).innerText.replace(/\n/g, ' ').trim())
      )
      rows.push(cells)
    })
    if (!rows.length) return ''
    const sep = rows[0].map(() => '---')
    const fmt = (r: string[]) => '| ' + r.join(' | ') + ' |'
    return '\n\n' + [fmt(rows[0]), fmt(sep), ...rows.slice(1).map(fmt)].join('\n') + '\n\n'
  },
})

export function toMarkdown(editor: Editor): string {
  return td.turndown(editor.getHTML())
}
```

**Download .md**:
```typescript
const blob = new Blob([toMarkdown(editor)], { type: 'text/markdown' })
const url = URL.createObjectURL(blob)
Object.assign(document.createElement('a'), { href: url, download: `${title}.md` }).click()
URL.revokeObjectURL(url)
```

**Lossy**: colors, font sizes, highlights stripped — no markdown equivalent. Everything structural (headings, tables, lists, links, code) converts cleanly.

---

# Tiptap: Inline Image Upload and Formula Cells

## Image Upload — Supabase Storage (correct approach)

Upload to a Supabase Storage bucket and store the public URL in the document. Base64 looks simpler but hits Supabase's ~1MB REST payload limit on any real image and also blows the ydoc encode call stack (see `tiptap-collab-yjs-supabase.md` gotcha). Use storage.

```typescript
async function handleImageUpload(file: File) {
  if (!editor) return
  const compressed = await compressImage(file)            // canvas → JPEG, max 1920px
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`
  const blob = await fetch(compressed).then(r => r.blob())
  const { error } = await supabase.storage.from('doc-images').upload(path, blob, { contentType: blob.type })
  if (error) { console.error('Image upload failed:', error.message); return }
  const { data } = supabase.storage.from('doc-images').getPublicUrl(path)
  editor.chain().focus().setImage({ src: data.publicUrl }).run()
}
```

**Bucket setup** (one-time, Supabase dashboard):
- Storage → New bucket → name: `doc-images`, Public: on
- RLS policies (or via SQL editor):
  ```sql
  create policy "authenticated users can upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'doc-images');

  create policy "public read access"
  on storage.objects for select
  using (bucket_id = 'doc-images');
  ```

**`compressImage` is still useful** before upload — reduces bandwidth and storage cost before the file ever leaves the browser.

**RLS gotcha — broad SELECT triggers Supabase warning**: A `for select using (bucket_id = 'doc-images')` policy lets any authenticated user list all files in the bucket. Supabase flags this. Scope it to each user's own folder instead:

```sql
drop policy if exists "public read access" on storage.objects;

create policy "users can read own images"
on storage.objects for select to authenticated
using (
  bucket_id = 'doc-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

This works because files are uploaded to `{userId}/{uuid}.ext` — `foldername(name)[1]` extracts the first path segment. Public bucket URLs still load in the browser without auth (the public bucket setting handles that); the SELECT policy only governs API list/read calls.

**Why not base64**: base64 embeds the image in the document JSON. A single 500KB JPEG becomes ~670KB of base64 that gets included in every `ydoc_state` save. `String.fromCharCode(...bytes)` crashes at ~65k bytes (call stack limit); the chunked fix helps but you're still storing images as document payload where they don't belong.

---

## Formula Cells in Tables — ProseMirror Plugin Approach

A Tiptap `Extension` with a ProseMirror plugin can evaluate spreadsheet-style formulas on Tab out of a table cell.

**Pattern**: User types `=SUM(A1:C1)` in a cell. On Tab, the plugin evaluates it (→ `300`) and replaces the cell content.

```typescript
export const FormulaExtension = Extension.create({
  name: 'formula',
  addProseMirrorPlugins() {
    return [new Plugin({
      key: new PluginKey('formula'),
      props: {
        handleKeyDown(view, event) {
          if (event.key !== 'Tab') return false
          const { $from } = view.state.selection

          // Walk up to tableCell/tableHeader
          let depth = $from.depth
          while (depth > 0) {
            const name = $from.node(depth).type.name
            if (name === 'tableCell' || name === 'tableHeader') break
            depth--
          }
          if (depth === 0) return false

          const cellNode = $from.node(depth)
          if (!cellNode.textContent.trim().startsWith('=')) return false

          // Walk up to table, build grid, evaluate
          let td = depth - 1
          while (td > 0 && $from.node(td).type.name !== 'table') td--
          if (td === 0) return false

          const grid = buildGrid($from.node(td))
          const result = evalFormula(cellNode.textContent.trim(), grid)

          const cellStart = $from.before(depth)
          view.dispatch(
            view.state.tr.replaceWith(
              cellStart + 1,
              cellStart + cellNode.nodeSize - 1,
              view.state.schema.nodes.paragraph.create(
                {}, result ? view.state.schema.text(result) : undefined
              )
            )
          )
          return false // let Tab still navigate
        }
      }
    })]
  }
})
```

**Key insight**: `replaceWith(cellStart + 1, cellStart + cellNode.nodeSize - 1, newParagraph)` correctly replaces the cell's inner content. `cellStart + 1` = inside the cell (before the paragraph), `cellStart + cellNode.nodeSize - 1` = just before the cell close token.

**Formula evaluator supports**:
- Range functions: `=SUM(A1:C3)`, `=AVG(B1:B5)`, `=MIN/MAX/COUNT(...)`
- Cell refs: `=A1+B1`, `=A2*0.1`
- Arithmetic: `=100*1.08`, `=(A1+B1)/2`
- Returns `#ERR` on exceptions

**Limitation**: Formula text is replaced by result on Tab. To re-edit, user deletes and retypes. A "show formula on focus" UX requires NodeViews (much more complex).

---

## Table Context Menu

Right-click on any `td`/`th` to insert/delete rows and columns. Use `editor.view.posAtCoords()` to position the cursor in the clicked cell before running table commands.

```tsx
function onContextMenu(e: MouseEvent) {
  if (!e.target.closest('.ProseMirror td, .ProseMirror th')) return
  e.preventDefault()
  const coords = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
  if (coords) editor.chain().focus().setTextSelection(coords.pos).run()
  setPos({ x: e.clientX, y: e.clientY })
}
```

Use `onMouseDown` (not `onClick`) on menu items so the action fires before the blur event closes the menu.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
