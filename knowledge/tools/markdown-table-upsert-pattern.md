---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [#gotcha, markdown, tables, file-editing]
---

# Markdown Table Upsert Pattern

Patching a GFM pipe table in a text file by a key column — insert-or-update without a full parse/serialize round-trip.

## Use case

A `index.md` file contains a pipe table where each row represents a file's metadata (campaign, status, notes, etc.). When the user edits one asset, write back only that row without touching the rest of the document.

## Implementation

```typescript
function upsertIndexRow(content: string, meta: AssetMeta): string {
  const HEADER = "| Filename | Campaign | Ad Set | Format | Status | Notes |";
  const SEP    = "| --- | --- | --- | --- | --- | --- |";
  const row    = `| ${meta.filename} | ${meta.campaign} | ${meta.adSet} | ${meta.format} | ${meta.status} | ${meta.notes} |`;

  const lines = content.split("\n");
  let headerIdx = -1, sepIdx = -1, existingIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("|") && t.toLowerCase().includes("filename")) headerIdx = i;
    if (headerIdx >= 0 && sepIdx < 0 && t.match(/^\|[-| :]+\|$/)) sepIdx = i;
    if (sepIdx >= 0 && t.startsWith("|")) {
      const cells = t.split("|").map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
      if (cells[0] === meta.filename) { existingIdx = i; break; }
    }
  }

  if (existingIdx >= 0) {         // patch in place
    lines[existingIdx] = row;
    return lines.join("\n");
  }
  if (headerIdx >= 0 && sepIdx >= 0) { // insert after separator
    lines.splice(sepIdx + 1, 0, row);
    return lines.join("\n");
  }
  // no table yet — append
  return content.trimEnd() + `\n\n${HEADER}\n${SEP}\n${row}\n`;
}
```

## Three cases to handle

| Scenario | Detection | Action |
| --- | --- | --- |
| Row exists | `cells[0] === key` after separator | Replace that line in-place |
| Table exists, no row | `headerIdx >= 0 && sepIdx >= 0` | `splice(sepIdx + 1, 0, row)` |
| No table at all | fallthrough | Append full header + sep + row |

## Gotchas

- **Separator detection**: match `/^\|[-| :]+\|$/` — covers `| --- |`, `| :--- |`, `| ---: |`. A simple `includes("---")` will also match frontmatter dividers.
- **Header detection**: match on a column name (`filename`) rather than exact text — user may have different column order or spacing.
- **Key column stripping**: `String.prototype.replace(/\*/g, "")` needed if header has bold markers like `**Filename**`.
- **Empty file**: `read_file` may throw on a missing `index.md` — catch and pass `""` as `existing`; the no-table branch handles it.
- **Frontmatter**: `content.trimEnd()` before appending avoids a double blank-line if file ends with frontmatter block and no trailing newline.

## Related

- `AssetsView.tsx` — `upsertIndexRow` + `saveEdit` handler (read → upsert → write_file)
- Tauri `read_file` / `write_file` commands (plain text, already registered in lib.rs)

<!-- orphan: 0 inbound links as of 2026-04-20 -->
