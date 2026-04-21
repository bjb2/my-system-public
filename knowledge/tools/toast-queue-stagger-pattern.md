---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [#gotcha, react, notifications, tauri]
---

# Toast Queue Stagger Pattern

## Problem

Multiple toast notifications arriving simultaneously (e.g., on app startup) stack up all at once, creating visual noise and slowing perceived startup.

In org-viewer: Todoist check looped and called `addToast` N times synchronously; reminder events also arrived in a burst. Result: 10 toasts at once.

## Fix: Two-part solution

### 1. Batch at the source (Todoist)

Instead of one toast per task, collect into arrays and emit 1–2 summary toasts:

```ts
const overdue: string[] = [];
const dueToday: string[] = [];
// ...collect...
if (overdue.length > 0) {
  const preview = overdue.slice(0, 3).join(" · ");
  addToast(
    `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}`,
    overdue.length > 3 ? `${preview} +${overdue.length - 3} more` : preview,
  );
}
```

### 2. Queue drain with stagger (all sources)

Replace direct `setToasts` in `addToast` with a ref-based queue drained at 700ms intervals:

```ts
const toastQueueRef = useRef<{ title: string; body: string }[]>([]);
const toastDrainRef = useRef<ReturnType<typeof setInterval> | null>(null);

const addToast = useCallback((title: string, body: string) => {
  toastQueueRef.current.push({ title, body });
  if (!toastDrainRef.current) {
    const drain = () => {
      const next = toastQueueRef.current.shift();
      if (next) {
        setToasts(prev => [...prev, { id: newToastId(), title: next.title, body: next.body }]);
      }
      if (toastQueueRef.current.length === 0) {
        clearInterval(toastDrainRef.current!);
        toastDrainRef.current = null;
      }
    };
    drain();
    toastDrainRef.current = setInterval(drain, 700);
  }
}, []);
```

**Why refs, not state**: the queue and drain timer are mutable side-effect state, not render state. Using refs avoids stale closure issues and unnecessary re-renders.

**Why 700ms**: at 6s auto-dismiss, 700ms spacing means even 8 toasts are staggered across ~5s without visible overlap at the top of the stack.

## Files

- `src/App.tsx` — queue refs + `addToast` + Todoist batching
- `src/components/ToastContainer.tsx` — render-only, no queue logic needed there

<!-- orphan: 0 inbound links as of 2026-04-20 -->
