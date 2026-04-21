---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tiptap, prosemirror, #research]
---

# Tiptap: Embedded Interactive Widget Node

Pattern for embedding a fully interactive React component (spreadsheet, chart, kanban, etc.) inside a Tiptap document as a non-editable atom node.

## Architecture

```
Tiptap document
  └── paragraph
  └── spreadsheet  ← atom node, rendered by ReactNodeViewRenderer
  └── paragraph
```

The key: `atom: true` makes Tiptap treat the node as a single opaque unit — cursor jumps over it, can't enter it via ProseMirror. All interactivity is handled inside the React component.

## Node Definition

```typescript
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import MyWidget from '../components/MyWidget'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    myWidget: { insertMyWidget: () => ReturnType }
  }
}

export const MyWidgetNode = Node.create({
  name: 'myWidget',
  group: 'block',
  atom: true,       // single opaque unit — no cursor inside
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      data: { default: {} },  // all widget state lives here
    }
  },

  parseHTML()  { return [{ tag: 'div[data-type="my-widget"]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'my-widget' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MyWidget)
  },

  addCommands() {
    return {
      insertMyWidget: () => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs: { data: {} } }),
    }
  },
})
```

## React Component Skeleton

```tsx
import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

export default function MyWidget({ node, updateAttributes, selected }: NodeViewProps) {
  const { data } = node.attrs

  function save(newData: typeof data) {
    updateAttributes({ data: newData })
  }

  return (
    <NodeViewWrapper>
      <div
        tabIndex={0}
        contentEditable={false}
        suppressContentEditableWarning
        onKeyDown={e => e.stopPropagation()}  // CRITICAL: prevent Tiptap from stealing keys
        style={{ border: selected ? '2px solid #4f46e5' : '1px solid #d1d5db' }}
      >
        {/* widget UI here */}
      </div>
    </NodeViewWrapper>
  )
}
```

**Critical details:**

- `contentEditable={false}` — prevents browser from treating inner content as editable
- `e.stopPropagation()` on keydown — prevents ProseMirror from stealing arrow keys, Enter, etc.
- `tabIndex={0}` — makes the container focusable so it receives keyboard events
- `selected` prop — true when ProseMirror node-selects the block (click on it); use for visual selection ring

## State Management

Widget state (all mutable data) lives in node `attrs`. To update:

```typescript
updateAttributes({ data: { ...data, someField: newValue } })
```

Tiptap triggers re-render + undo history entry. For rapid updates (e.g., per-keystroke cell editing), batch changes: edit local state during interaction, call `updateAttributes` only on commit (Tab/Enter/blur).

## HyperFormula Integration (Spreadsheet)

```typescript
import { HyperFormula, DetailedCellError } from 'hyperformula'

// Rebuild on data change (stringify for deep comparison)
useEffect(() => {
  const prev = hfRef.current
  hfRef.current = HyperFormula.buildFromArray(data, { licenseKey: 'gpl-v3' })
  if (prev) prev.destroy()
}, [JSON.stringify(data)])

useEffect(() => () => { hfRef.current?.destroy() }, [])

function getDisplay(row: number, col: number): string {
  const v = hfRef.current?.getCellValue({ sheet: 0, row, col })
  if (v instanceof DetailedCellError) return `#${v.type}`  // #DIV/0!, #REF!, etc.
  return v === null ? '' : String(v)
}
```

HyperFormula supports 380+ Excel-compatible functions (IF, VLOOKUP, COUNTIF, SUMIF, TODAY, ROUND, CONCATENATE, ...). License key `'gpl-v3'` enables free use.

## Formula Autocomplete in a Widget Input

Pattern for showing filtered suggestions as the user types a formula function name. Works in any controlled `<input>`, not just spreadsheets.

**Token detection** — extract the trailing alpha sequence after `=`, filtering out cell-reference contexts:

```typescript
function getFormulaToken(val: string): string | null {
  if (!val.startsWith('=')) return null
  const match = val.match(/([A-Za-z]*)$/)
  if (!match) return null
  const before = val.slice(0, val.length - match[1].length)
  // Don't trigger after alphanumeric (cell ref like A1 or a number)
  if (before.length > 0 && /[A-Za-z0-9]$/.test(before)) return null
  return match[1].toUpperCase()  // '' for bare '=', 'SU' for '=SU', 'SU' for '=A1+SU'
}
```

**Catalog + filtering:**

```typescript
const token = editCell ? getFormulaToken(editVal) : null
const suggestions = token === null ? [] :
  token === '' ? TOP_FORMULAS  // show defaults when only '=' typed
               : CATALOG.filter(f => f.name.startsWith(token))
const showAC = suggestions.length > 0
```

**Keyboard interception** — autocomplete must intercept *before* normal handlers:

```typescript
function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
  e.stopPropagation()
  if (showAC) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggIdx(i => Math.min(i+1, suggestions.length-1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSuggIdx(i => Math.max(i-1, 0)); return }
    if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); applysuggestion(suggestions[suggIdx].name); return }
    // Escape falls through to cancel edit
  }
  // Normal handlers below ...
}
```

**Completion** — replace the partial token with the full name + `(`:

```typescript
function applysuggestion(name: string) {
  const newVal = editVal.slice(0, editVal.length - (token?.length ?? 0)) + name + '('
  setEditVal(newVal)
  setSuggIdx(0)
  inputRef.current?.focus()
}
```

**Reset suggestion index** when token changes (new keystroke changes the filter):

```typescript
useEffect(() => { setSuggIdx(0) }, [token])
```

**Dropdown positioning** — `position: absolute; top: <formula-bar-height>` on a `position: relative` container overlays the grid cleanly. Use `onMouseDown` (not `onClick`) on items so the input doesn't lose focus before the handler fires:

```tsx
<div onMouseDown={e => { e.preventDefault(); applySelection(s.name) }}>
```

**Visual** — highlight typed prefix in bold dark, autocomplete suffix in accent color (VS Code convention). Active item gets a left border accent:

```tsx
<span style={{ fontWeight: 700, color: '#111' }}>{name.slice(0, token.length)}</span>
<span style={{ fontWeight: 600, color: '#4f46e5' }}>{name.slice(token.length)}</span>
```

## Live Cell Reference Highlighting

When editing a formula, parse referenced cells/ranges from the live input and apply per-ref colored borders. Each distinct ref gets a color from a rotating palette; ranges highlight the whole block.

```typescript
const REF_COLORS = ['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#be185d']

function buildHighlightMap(formula: string): Map<string, string> {
  const map = new Map<string, string>()
  if (!formula.startsWith('=')) return map
  let idx = 0
  const re = /([A-Za-z]+\d+)(?::([A-Za-z]+\d+))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(formula)) !== null) {
    const ref = m[2]
      ? `${m[1].toUpperCase()}:${m[2].toUpperCase()}`
      : m[1].toUpperCase()
    if (!map.has(ref)) map.set(ref, REF_COLORS[idx++ % REF_COLORS.length])
  }
  return map
}
```

Apply in the cell render (no extra state — computed from `editVal` every render):

```typescript
const highlightMap = editCell ? buildHighlightMap(editVal) : new Map()
// per cell:
const hlColor = !isEdit ? getCellHighlight(r, c, highlightMap) : null
// border: hlColor ? `2px solid ${hlColor}` : '1px solid #e5e7eb'
// background: hlColor ? `${hlColor}14` : '#fff'   // 14 = ~8% opacity hex
```

Exclude the editing cell itself from highlighting so it doesn't clash with the selection border.

## AC token detection: the `)` gotcha

`getFormulaToken('=SUM(A1:C3)')` returns `''` (trailing alpha match is empty, preceding char `)` is not alphanumeric) — which triggers the top-functions dropdown and hijacks Enter. Fix: explicitly return `null` after `)` or `]`:

```typescript
function getFormulaToken(val: string): string | null {
  if (!val.startsWith('=')) return null
  const match = val.match(/([A-Za-z]*)$/)
  if (!match) return null
  const token = match[1]
  const before = val.slice(0, val.length - token.length)
  if (!before) return null
  const last = before[before.length - 1]
  if (/[A-Za-z0-9]/.test(last)) return null   // cell ref or number
  if (last === ')' || last === ']') return null  // completed expression ← KEY FIX
  return token.toUpperCase()
}
```

Rule: autocomplete only fires when cursor is positioned to start a new function name (after `=`, operator, or comma) — never after a closed expression.

## Related

- [[tiptap-page-break-overlay-pattern]] — visual page breaks alongside embedded widgets

## Per-Cell Formatting (bold, italic, align, font size, number format)

Store formatting as a `styles: Record<string, CellStyle>` attr keyed by `"row,col"`. Sparse map — only styled cells have entries, so it doesn't need resizing when rows/cols are added.

```typescript
type CellStyle = {
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right'
  fontSize?: number
  numFormat?: 'general' | 'currency' | 'percent' | 'number' | 'integer'
}

function updateStyle(row: number, col: number, patch: Partial<CellStyle>) {
  const key = `${row},${col}`
  updateAttributes({ styles: { ...styles, [key]: { ...styles[key], ...patch } } })
}
```

Apply in cell render:

```tsx
const cs = styles[`${r},${c}`] ?? {}
// display div:
fontWeight: cs.bold ? 700 : 400,
fontStyle: cs.italic ? 'italic' : 'normal',
fontSize: cs.fontSize ?? 13,
justifyContent: cs.align ? { left:'flex-start', center:'center', right:'flex-end' }[cs.align] : defaultAlign,
```

Number formatting — apply after HF evaluation in `getDisplay()`:

```typescript
function applyNumFormat(raw: string, fmt: CellStyle['numFormat']): string {
  const n = parseFloat(raw)
  if (isNaN(n)) return raw
  switch (fmt) {
    case 'currency': return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    case 'percent':  return (n / 100).toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 1 })
    case 'number':   return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    case 'integer':  return Math.round(n).toLocaleString('en-US')
    default: return raw
  }
}
```

**Toolbar gotcha**: add `onMouseDown={e => e.preventDefault()}` to the toolbar container — otherwise clicking a toolbar button steals focus from the grid and the selected cell loses its highlight before the style update fires.

## #gotcha: `height: 100%` inside `<td>` doesn't work

A child `<div style={{ height: '100%' }}>` inside a `<td>` won't stretch to fill the row unless the `<td>` itself has an explicit height. The `<tr style={{ height: ROW_H }}>` sets the row height but doesn't make the td's height explicit for the child's percentage calculation.

Fix: add `height: ROW_H` directly to the `<td>` style (alongside `verticalAlign: 'middle'`).

## HyperFormula Latency Fix: Optimistic setCellContents

Rebuilding HF from scratch on every `updateAttributes` causes visible delay: user presses Enter → `updateAttributes` → Tiptap/Yjs round-trip → React re-render → `buildFromArray` → display updates. Fix: call `hf.setCellContents()` immediately in the commit handler before `updateAttributes`, then skip the full rebuild on the resulting data-key change.

```typescript
const skipRebuildRef = useRef(false)

// HF rebuild effect — skip when commit already applied optimistically
useEffect(() => {
  if (skipRebuildRef.current) { skipRebuildRef.current = false; return }
  const prev = hfRef.current
  hfRef.current = HyperFormula.buildFromArray(padData(data, rows, cols), { licenseKey: 'gpl-v3' })
  if (prev) prev.destroy()
}, [dataKey, rows, cols])

// In commit():
if (hfRef.current) {
  try {
    hfRef.current.setCellContents({ sheet: 0, row, col }, [[val]])
    skipRebuildRef.current = true
  } catch { /* full rebuild will happen on next cycle */ }
}
updateAttributes({ data: nd })
```

Since `hfRef` is a ref (not state), `getDisplay()` already sees the updated instance during the re-render triggered by `setEditCell(null)` / `setSel()` — the display snaps immediately without waiting for `updateAttributes` to complete.

## Gotchas

- **Key events**: Without `e.stopPropagation()`, arrow keys inside the widget trigger ProseMirror navigation and move the cursor out of the widget.
- **HF destroy on unmount**: HyperFormula instances hold memory; always call `hf.destroy()` in cleanup.
- **Data persistence**: `attrs` serialize to JSON in the Tiptap document. Works with Supabase jsonb. Survives undo/redo.
- **Undo granularity**: Every `updateAttributes` call creates an undo step. For cell-by-cell editing, only call it on commit (Tab/Enter), not on every keystroke.
- **atom vs non-atom**: `atom: true` means the whole node is one undo unit and cursor can't enter it. Use `atom: false` (with `addNodeView`) if you need Tiptap-controlled sub-content inside the widget (rare).
<!-- orphan: 0 inbound links as of 2026-04-20 -->
