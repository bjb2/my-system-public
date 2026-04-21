---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, docx, portability, yjs, supabase, #research]
---

# Tiptap DOCX Portability & Real-Time Collaboration Stack

## DOCX Portability

**Export** (Tiptap → Word/GDocs):
- `prosemirror-docx` converts ProseMirror JSON → DOCX
- Handles: headings, paragraphs, bold/italic/underline, lists, links, code blocks
- Limitation: merged table cells, tracked changes, and custom styles don't survive
- Fidelity: excellent for basic prose (90% of real-world use)

**Import** (Word/GDocs → Tiptap):
- `mammoth.js` converts DOCX → HTML
- Tiptap parses HTML natively
- Round-trip ~95% faithful for basic formatting

**Google Docs interchange**:
- Google Docs imports DOCX natively with high fidelity — no GDocs API needed
- DOCX is the universal interchange format; treat it as the target, not GDocs-specific formats

## Real-Time Collaboration

**Yjs + Supabase Realtime** is the right transport for Supabase-backed apps:
- Tiptap has first-class Yjs support: `@tiptap/extension-collaboration` + `@tiptap/extension-collaboration-cursor`
- Supabase Realtime handles Yjs awareness/update broadcast (channel per document)
- Persist Y.Doc snapshots to Postgres on idle (debounced, ~5s after last change)
- CRDT merging eliminates last-write-wins conflicts; offline edits sync on reconnect

**When to skip Yjs**: solo use or small teams with low concurrent edit probability — optimistic last-write-wins (auto-save every 2s) is simpler and sufficient.

## Supabase Free Tier Sizing (100 users)

| Resource | Limit | Expected |
|----------|-------|----------|
| Database | 500MB | ~50MB JSON content |
| Realtime connections | 200 concurrent | ~20 peak |
| Auth MAU | 50k | 100 |
| Storage | 1GB | attachments |

**Verdict**: 5-10x headroom on all constraints at 100 users.

## Related

- [[tiptap-table-links-collapse]] — Tiptap table/link gotchas from org-viewer
- [[privacy-first-docs-app]] — full proposal using this stack

<!-- orphan: 0 inbound links as of 2026-04-20 -->
