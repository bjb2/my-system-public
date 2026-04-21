---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [react, tauri, debugging]
---

# React Detail Pane Stale Content

## The bug

Master/detail layout: clicking item A shows its content, clicking item B still shows A's content.

Root cause: `useState(prop)` only initializes from the prop **on first mount**. When the same component instance receives new props (React reuses it since it's at the same position in the tree), the state is not reset.

```tsx
// BUG: content stays stale when `doc` prop changes
function DocViewer({ doc }) {
  const [content, setContent] = useState(doc.content); // only runs once
  ...
}
```

## The fix

Add `key={item.id}` on the detail component. React treats a changed `key` as a different element and unmounts/remounts, so `useState` reinitializes cleanly.

```tsx
{selected && <DocViewer key={selected.path} doc={selected} ... />}
```

No `useEffect` needed. One prop, zero logic.

## Related

- [[react-strictmode-double-effect]] — other React lifecycle gotcha
- [[react-stable-refs-for-closures]] — related: long-lived closures seeing stale state
