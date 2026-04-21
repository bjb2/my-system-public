---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [react, images, caching, patterns]
---

# React Thumbnail Cache-Busting with Version Prop

## Problem

A `ThumbImage` component loads a file from disk and caches it in `useState`. When the underlying file is overwritten (e.g. saved from an editor), the component doesn't re-fetch because `path` hasn't changed — so stale thumbnails persist after save.

## Solution

Add a `version` prop (tied to a parent `refreshKey`) to the `useEffect` dependency array. When the parent increments `refreshKey` after a save, all thumbnails re-fetch.

```tsx
function ThumbImage({ path, theme, version }: { path: string; theme: Theme; version?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);   // clear stale image immediately
    setError(false);
    invoke<string>("read_file_base64", { path })
      .then(b64 => { /* ... set src */ })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [path, version]); // <-- version triggers re-fetch
```

Usage:

```tsx
// Parent increments refreshKey after any save
const [refreshKey, setRefreshKey] = useState(0);
onSaved={() => setRefreshKey(k => k + 1)}

// Pass down to thumbnails
<ThumbImage path={asset.path} theme={theme} version={refreshKey} />
```

## Notes

- `setSrc(null)` + `setError(false)` at the top of the effect prevents flash of stale image
- Works for both grid thumbnails and detail panel preview — pass the same `refreshKey` to both
- The `version` prop is intentionally a number, not a timestamp — simpler diffing

## Related

- \[\[tauri-local-image-display\]\] — how to read local files into the webview via base64 command