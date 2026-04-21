---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, docx, export, #gotcha]
---

# Tiptap DOCX Export: Use `docx` directly, not `prosemirror-docx`

## The Pattern

Walk Tiptap's `editor.getJSON()` output manually and build a `Document` with the `docx` npm package. Do not use `prosemirror-docx`.

```ts
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

function inlineChildren(nodes): TextRun[] {
  return nodes.map(n => new TextRun({
    text: n.text ?? '',
    bold: n.marks?.some(m => m.type === 'bold'),
    italics: n.marks?.some(m => m.type === 'italic'),
    underline: n.marks?.some(m => m.type === 'underline') ? {} : undefined,
  }))
}

// Walk node types: paragraph, heading, listItem, codeBlock, blockquote
// For lists: flatten bulletList/orderedList → listItem children

const doc = new Document({ sections: [{ children: paragraphs }] })
const blob = await Packer.toBlob(doc)
// trigger download via URL.createObjectURL
```

## Why Not `prosemirror-docx`

- Uncertain API surface — exports vary by version, docs are sparse
- Dynamic import required (can't tree-shake cleanly)
- `docx` v8 is the underlying dependency anyway — use it directly

## Import Direction

DOCX → HTML → Tiptap: use `mammoth.js` (reliable, ~95% fidelity for basic formatting).

```ts
const result = await mammoth.convertToHtml({ arrayBuffer })
editor.commands.setContent(result.value)
```

## HeadingLevel Type

`HeadingLevel` is a const enum — use it as a value, not a type:

```ts
type DocxHeading = (typeof HeadingLevel)[keyof typeof HeadingLevel]
```

## List Items in docx v8

No `UnorderedList`/`OrderedList` classes. Apply `bullet: { level: 0 }` directly on `Paragraph`.

## Related

- [Tiptap table/links collapse gotcha](tiptap-table-links-collapse.md)
- [[tiptap-markdown-wysiwyg]] — base editor setup (frontmatter round-trip, auto-save)
