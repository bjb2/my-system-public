---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [org-viewer, tiptap, markdown]
---

# TipTap: Markdown Tables Collapse on Save

TipTap's markdown serializer drops pipe separators on round-trip. Any table — not just those with links — gets flattened to a single line of concatenated cell text when the file is saved through the WYSIWYG editor.

**Root cause**: TipTap's internal table model doesn't serialize back to GFM pipe-table syntax. On save, cells run together with no delimiter.

**Safe alternatives:**

```markdown
<!-- breaks on save -->
| Field | Value | Notes |
|---|---|---|
| Genre | indie rock | dominant first |

<!-- works: definition list style -->
**Field** — Value — Notes
**Genre** — indie rock — dominant first

<!-- works: bullet list -->
- **Genre**: indie rock (dominant first)
- **Mood**: melancholic

<!-- works: bold + em dash (for two-column lookups) -->
**The Killers** — theatrical male vocals, shimmering synth pads, 125 BPM
```

**Rule**: Never use markdown pipe tables in knowledge articles that will be viewed/edited in org-viewer. Use bullet lists instead.

**Second gotcha**: Consecutive `**bold**` lines without list syntax also collapse — TipTap merges them into one paragraph. Wrap them in a bullet list too:

```markdown
<!-- breaks -->
**Field A**: value
**Field B**: value

<!-- works -->
- **Field A**: value
- **Field B**: value
```

**Safe formats in org-viewer**: bullet lists, numbered lists, code blocks, headings, inline bold/em within a sentence. Everything else: test before trusting.
