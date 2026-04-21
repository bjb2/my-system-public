---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [react, typescript, hooks, patterns]
---

# React: Stable Refs for Long-Lived Closures

## The Problem

Global event listeners (keydown, resize) registered in a `useEffect` capture the state values from the render cycle in which they ran. State updates don't re-register the listener, so it sees stale values forever.

```ts
// WRONG — tabs is stale inside the keydown handler
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const target = tabs.find(...); // always the initial `tabs`
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []); // empty deps — never re-registers
```

## The Fix: Mirror State into a Ref

```ts
const tabsRef = useRef(tabs);
useEffect(() => { tabsRef.current = tabs; }, [tabs]);

const activeTabIdRef = useRef(activeTabId);
useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const target = tabsRef.current.find(...); // always current
    const active = activeTabIdRef.current;    // always current
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, []); // safe — reads through ref, not closure
```

The ref update effects run synchronously after each render, so `tabsRef.current` is always in sync with the latest state without requiring the listener to re-register.

## When to Use

- Global `keydown`/`keyup` listeners that need to read component state
- `ResizeObserver` / `IntersectionObserver` callbacks
- `setInterval` ticks that read state
- Any long-lived closure where adding the value to deps would cause costly teardown/re-register

## Alternative: useCallback with deps

For short-lived or component-scoped handlers, adding the value to `useCallback` deps and rebuilding the handler is fine. The ref pattern is better when teardown is expensive (removing + re-adding a global listener) or when you want to guarantee a single stable handler identity.

## Related

- [[react-detail-pane-stale-state]] — related: `useState(prop)` stale initialization in master/detail layouts
