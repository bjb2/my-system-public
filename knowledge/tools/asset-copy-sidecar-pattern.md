---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [#pattern, assets, media, org-viewer]
---

# Asset Copy Sidecar Pattern

## Problem

Binary files (images, video) can't carry structured metadata inside themselves without specialized tooling. But you often need structured text associated with a specific file — ad copy, captions, alt text, notes — that travels with the asset and survives duplication.

## Solution

Place a `.copy.md` file next to the binary with the same stem:

```
identity-v1.jpg
identity-v1.copy.md   ← sidecar
```

The sidecar carries YAML frontmatter for machine-readable fields and markdown sections for human-editable content.

## Format

```yaml
---
type: asset-copy
asset: identity-v1.jpg
platform: facebook
created: 2026-04-18
updated: 2026-04-18
---
```

```markdown
## Primary Texts

1. ...
2. ...

## Headlines

1. ...

## Description

...

## Notes

...
```

## Why This Works

- **Travels with the asset** — copy and image are in the same directory; moving one moves the other
- **Duplicate-safe** — cloning the image file also clones the sidecar; the org viewer does this automatically
- **Editable anywhere** — any text editor, the org viewer, or directly via Claude
- **No database** — pure filesystem, fits the sovereignty principle
- **Extensible** — add any markdown sections you want without changing the parser

## Org Viewer Integration

AssetsView loads `<asset-stem>.copy.md` when an asset is selected. Shows:
- Copy section in detail panel (count summary + first primary text)
- "Edit copy" / "Add copy" button opens CopyEditForm
- "Duplicate for iteration" clones the sidecar alongside the image

Key functions: `sidecarPath()`, `parseCopySidecar()`, `buildCopySidecar()` in `AssetsView.tsx`.

## Generalizing

The pattern works for any binary + structured text pairing:
- `photo.jpg` + `photo.caption.md` (social media captions)
- `video.mp4` + `video.brief.md` (production notes)
- `design.fig` + `design.specs.md` (handoff specs)

The file extension convention (`.copy.md`, `.caption.md`) makes the relationship explicit and allows tools to detect sidecars by glob: `*.copy.md`.

## Related

- [[projects/outgoing-world/README.md]]
- [[tasks/completed/outgoing-asset-copy-sidecar.md]]
