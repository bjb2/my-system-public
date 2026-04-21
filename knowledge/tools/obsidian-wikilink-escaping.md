---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [#gotcha, obsidian, wikilinks, org-system, markdown]
---

# Obsidian Escapes Wikilinks as `\[\[...\]\]`

## #gotcha

When Obsidian writes or edits markdown files containing `[[wikilinks]]`, it escapes the brackets as `\[\[...\]\]`. This breaks two things in this org system:

1. **Wikilink parser** (`documents.rs`) — the WIKILINK_RE regex matches `\[\[([^\]]+)\]\]`, so it will not match `\[\[filename\]\]` with literal backslashes in the file.
2. **Grep** — searching for `\[\[` fails with "Invalid regular expression" because the shell or grep interprets the escaped brackets as regex syntax.

## How It Manifests

Files look correct in Obsidian (it renders them fine). But in any other tool (org-viewer graph, shell grep, Python scripts), the links appear as literal `\[\[...\]\]` text and generate zero edges.

The corruption pattern after a failed sed fix:
```
]]filename\]\]   ← leading [ removed, trailing ] still escaped
```

## Fix

Use the Edit tool (not sed) to replace corrupted patterns. Find the exact corrupted string first with Read, then use Edit with that exact string as `old_string`. sed on Windows/bash can double-interpret backslashes unpredictably.

Correct form for all wikilinks in this system:
```
[[filename]]        ← no backslashes, always
```

## Prevention

Avoid opening and saving org files in Obsidian if wikilinks matter for graph health. If you do use Obsidian, run a sweep after: `Grep "\\[\\[" knowledge/` to find files with literal backslash-bracket sequences.

## Related

- [[tauri-webview-api-gotchas]] — other tooling gotchas in the org-viewer stack

<!-- orphan: 0 inbound links as of 2026-04-20 -->
