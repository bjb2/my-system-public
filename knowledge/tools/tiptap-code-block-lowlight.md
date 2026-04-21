---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, frontend, syntax-highlighting, #gotcha]
---

# Tiptap: Code Block with Syntax Highlighting + Language Selector

## Stack

`@tiptap/extension-code-block-lowlight` + `lowlight` + `ReactNodeViewRenderer`. Lowlight applies hljs token classes as ProseMirror decorations (not innerHTML replacement), so the code remains directly editable in the NodeView.

## Install Gotcha

```bash
# Fails with peer dep conflict on mixed Tiptap versions:
npm install @tiptap/extension-code-block-lowlight lowlight

# Fix:
npm install @tiptap/extension-code-block-lowlight lowlight --legacy-peer-deps
```

## Extension Setup

Register specific languages (tree-shaking) rather than `all` to keep bundle size reasonable:

```ts
import { createLowlight } from 'lowlight'
import javascript from 'highlight.js/lib/languages/javascript'
// ... other languages
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'

const lowlight = createLowlight()
lowlight.register({ javascript, typescript, python, bash, ... })

export const CodeBlockExtension = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent)
  },
}).configure({ lowlight, defaultLanguage: 'auto' })
```

In `StarterKit`, disable the built-in codeBlock:

```ts
StarterKit.configure({ history: false, codeBlock: false }),
CodeBlockExtension,
```

## NodeView Pattern

`NodeViewContent as="code"` preserves the editable region while decorations (token classes) are applied by lowlight. The language selector calls `updateAttributes({ language })` — lowlight re-highlights on the next render cycle automatically.

```tsx
export default function CodeBlock({ node, updateAttributes }: NodeViewProps) {
  const language = node.attrs.language ?? 'auto'

  return (
    <NodeViewWrapper className={s.wrap}>
      <div className={s.bar}>
        <span className={s.langLabel}>{displayLang}</span>
        <select value={language} onChange={e => updateAttributes({ language: e.target.value === 'auto' ? null : e.target.value })}>
          {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <button onClick={handleCopy}>{copied ? '✓' : 'Copy'}</button>
      </div>
      <NodeViewContent as="code" />  {/* editable + decorated by lowlight */}
    </NodeViewWrapper>
  )
}
```

## Global editor styles will override your component background #gotcha

If the editor stylesheet has `.editor :global(pre)` or `.editor :global(code)` rules with a `background`, they will beat your CSS module styles — even with higher specificity selectors — because both are scoped to `.editor` and the global rules are typically declared after component styles. Result: dark component background reverts to white; token colors become invisible.

Fix: add `!important` on `background`, `border`, and `color` in the NodeView component's CSS:

```css
.wrap { background: #1e1e2e !important; border: none !important; }
.code { background: #1e1e2e !important; border: none !important; color: #cdd6f4 !important; }
```

## Token CSS

Lowlight adds `hljs-*` classes as decorations. Scope token styles inside `.wrap :global(.hljs-keyword)` etc. (CSS modules need `:global` to reach decoration-injected classes). Catppuccin Mocha palette works well on `#1e1e2e` background.

Key token groups:
- Keywords/tags: `hljs-keyword`, `hljs-built_in`, `hljs-tag` → purple `#cba6f7`
- Strings/types: `hljs-string`, `hljs-type`, `hljs-addition` → green `#a6e3a1`
- Numbers/vars: `hljs-number`, `hljs-variable`, `hljs-meta` → orange `#fab387`
- Functions: `hljs-function`, `hljs-params` → blue `#89b4fa`
- Comments: `hljs-comment` → muted `#6c7086`
- Deletions/regex: `hljs-deletion`, `hljs-regexp` → red `#f38ba8`

## Copy Button

Read `code.textContent` from the NodeViewWrapper ref — **not** `innerHTML` (which would include hljs span markup):

```ts
const text = preRef.current?.querySelector('code')?.textContent ?? ''
await navigator.clipboard.writeText(text)
```

<!-- orphan: 0 inbound links as of 2026-04-20 -->
