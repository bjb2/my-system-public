---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [#gotcha, #org-viewer, #markdown]
---

# Org Viewer Markdown Table Linter Collapses Tables

The org-viewer pipeline has a linter that strips pipe characters and newlines from markdown tables, collapsing them into a single run-on line.

## Symptom

Write a valid markdown table:
```
| Col A | Col B |
|-------|-------|
| foo   | bar   |
```

After save, it becomes:
```
Col ACol Bfoobar
```

## Workaround

Use bullet lists instead of markdown tables when the content needs to survive the linter:

```markdown
- **Col A value** — Col B value. Notes.
- **Col A value** — Col B value. Notes.
```

Same information, immune to the table-collapsing behavior.

## Related

- [org-viewer-markdown-limitations.md](org-viewer-markdown-limitations.md)
