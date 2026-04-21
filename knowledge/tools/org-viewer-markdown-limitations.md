---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [org-viewer, markdown, gotcha]
---

# Org-Viewer Markdown Limitations

#gotcha

## GFM Tables Not Supported

The org-viewer markdown renderer does not support GitHub-Flavored Markdown (GFM) tables. Pipe-delimited tables render as plain text with pipe characters stripped, bleeding all cell content together inline.

**Symptom:** `LayerTypical Performance SwingWhat It Controls**Concept**2x–5x...`

**Fix:** Convert tables to bold-label bullet lists:

```markdown
- **Label A** (qualifier) — description
- **Label B** (qualifier) — description
```

This renders correctly in any parser and is nearly as scannable as a table for most use cases.

**Affected files:** Any knowledge article with GFM tables needs this conversion before it's readable in org-viewer.

## Related

- [[org-viewer-markdown-table-linter]] — the linter in the pipeline that collapses the tables

<!-- orphan: 0 inbound links as of 2026-04-20 -->
