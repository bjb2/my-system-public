---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [obsidian, markdown, graph]
---

# Graph Shows No Edges (Obsidian + org-viewer)

Both Obsidian and org-viewer report 40 nodes, 0 edges. Both likely only parse `[[wikilinks]]` — standard markdown links `[text](path)` are invisible to both graph engines.

**Both tools appear to require `[[wikilinks]]`.** Standard markdown links `[text](path)` are invisible to both graph engines.

**Conversion pattern:** Use `[[filename]]` — no extension, no path. Obsidian resolves by filename search across the vault. Works for cross-folder links (e.g., `context/voice.md` → `[[voice]]`).

**Subset converted (2026-04-16):** `context/voice.md`, `context/projects.md`, `knowledge/tools/obsidian-graph-no-edges.md`, `knowledge/tools/svg-to-png-windows.md`, `knowledge/tools/claude-code-hook-output-schema.md` — ## Related sections only. Check graph for edges before doing full conversion.

**Trade-off:** `[[wikilinks]]` are non-standard markdown — files become less portable outside Obsidian/org-viewer. Acceptable if this system is the primary viewer.

## Related

- [[obsidian-workflow-patterns]]
