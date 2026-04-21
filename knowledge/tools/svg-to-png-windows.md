---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [tooling, svg, node, windows]
---

# SVG to PNG Conversion on Windows

## Problem

Cairo-based tools (cairosvg, svglib/reportlab) fail on Windows without the native `libcairo-2.dll` installed. Most Python SVG→PNG libraries depend on Cairo.

## Solution

Use `@resvg/resvg-js` — Rust-based, compiled to WebAssembly, no native dependencies.

```bash
npm install @resvg/resvg-js
```

```js
// convert_logo.mjs
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'fs';

const svg = `<svg ...>...</svg>`;
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: 636 } });
const pngData = resvg.render();
writeFileSync('output.png', pngData.asPng());
```

## Handling CSS Variables in SVGs

SVGs exported from design tools often use `var(--color-name)` which won't render without a CSS context. Replace before conversion:

```js
// Target specific elements by their surrounding attributes to avoid wrong replacements
const svg = rawSvg
  .replace('clip-path="url(#mark)" fill="#FFFFFF"',   // accent mark → blue
           'clip-path="url(#mark)" fill="#3A39FF"')
  .replace('fill="#FFFFFF">',                          // outer fill → text color
           'fill="#0A0A0A">');
```

**Order matters**: fix inner overrides before changing the outer default fill, or your string matches will be wrong.

## outgoing.world Logo Files

- `C:\Users\bryan\Downloads\outgoing-logo-dark.png` — black text + blue mark
- `C:\Users\bryan\Downloads\outgoing-logo-white-blue.png` — white text + blue mark (for purple bg)
- Script: `C:\Users\bryan\Downloads\convert_logo.mjs`

## Related

- \[\[obsidian-workflow-patterns\]\]