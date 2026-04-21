---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tauri, rust, images, base64, assets]
---

# Tauri: Displaying Local Images in the Webview

## The Problem

Tauri's webview cannot directly load local file paths (`file:///...`) — it uses a custom content scheme. Displaying local images requires either the asset protocol or a Rust command bridge.

## Option A: `read_file_base64` Command (Simpler)

Add a Rust command that reads file bytes and returns standard base64:

```rust
#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(&bytes))
}
```

Frontend constructs a data URL from the result:

```typescript
const b64 = await invoke<string>("read_file_base64", { path });
const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
const src = `data:${mime};base64,${b64}`;
```

**Tradeoff:** Entire file loaded into memory as a string. Fine for thumbnails and small images. Avoid for large videos or bulk loading hundreds of images.

## Option B: Asset Protocol (More Complex)

Requires enabling in `capabilities/default.json`:
```json
"core:asset:allow-read-asset"
```

Then use `convertFileSrc` from `@tauri-apps/api/core`. Requires scoping the allowed directories. More setup, but streams from disk instead of loading into memory.

## Pattern: Lazy Thumbnail Loading

For a thumbnail grid, load images on mount with cancellation:

```typescript
function ThumbImage({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);
  
  useEffect(() => {
    let cancelled = false;
    invoke<string>("read_file_base64", { path })
      .then(b64 => {
        if (!cancelled) setSrc(`data:image/jpeg;base64,${b64}`);
      });
    return () => { cancelled = true; };
  }, [path]);
  
  if (!src) return <div>loading...</div>;
  return <img src={src} className="w-full h-full object-cover" />;
}
```

The `cancelled` flag prevents state updates after unmount (view switch while images are loading).

## Used In

- `AssetsView.tsx` — ad creative thumbnail grid in org-viewer

## Related

- [[react-thumbnail-cache-busting]] — version prop pattern to force thumbnail re-fetch after save
