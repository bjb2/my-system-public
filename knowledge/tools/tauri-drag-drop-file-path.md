---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [tauri, drag-drop, react, gotcha]
---

# Tauri Drag-and-Drop: File Path Access

## The pattern

In Tauri 2 WebView2 (Windows), `File` objects from drag-drop do NOT have a `.path` property — that's Electron-specific. Instead, read file bytes via `FileReader` and write them via a Rust command:

```typescript
const handleDrop = async (e: React.DragEvent) => {
  e.preventDefault();
  for (const file of Array.from(e.dataTransfer.files)) {
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.substring(dataUrl.indexOf(",") + 1));
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    await invoke("write_file_bytes", { path: `${destDir}/${file.name}`, b64 });
  }
};
```

```rust
#[tauri::command]
fn write_file_bytes(path: String, b64: String) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose};
    let bytes = general_purpose::STANDARD.decode(&b64).map_err(|e| e.to_string())?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())
}
```

**Why not `(file as any).path`?** That property is injected by Electron/Node.js into its WebView. Tauri's WebView2 does not inject it. `(file as any).path` will always be `undefined` → "path unavailable" error.

## Reliable enter/leave tracking with dragCounterRef

`dragenter`/`dragleave` fire on every child element, causing flickering if you toggle state naively. Use a counter:

```typescript
const dragCounterRef = useRef(0);

const handleDragEnter = (e: React.DragEvent) => {
  e.preventDefault();
  dragCounterRef.current += 1;
  if (e.dataTransfer.types.includes("Files")) setDragging(true);
};

const handleDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  dragCounterRef.current -= 1;
  if (dragCounterRef.current === 0) setDragging(false);
};

const handleDrop = (e: React.DragEvent) => {
  e.preventDefault();
  dragCounterRef.current = 0; // reset on drop
  setDragging(false);
  // ...
};
```

## Drop overlay pattern

Position overlay `inset: 0` with `pointerEvents: "none"` so it doesn't interfere with drop event bubbling to the parent:

```tsx
{dragging && (
  <div style={{
    position: "absolute", inset: 0, zIndex: 50,
    background: `${theme.accent}22`,
    border: `2px dashed ${theme.accent}`,
    pointerEvents: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
  }}>
    Drop files here
  </div>
)}
```

## Rust copy_file command

```rust
#[tauri::command]
fn copy_file(src: String, dst: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dst).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&src, &dst).map(|_| ()).map_err(|e| e.to_string())
}
```

## Refresh after copy

Add a `refreshKey` state; increment it after a successful copy to re-trigger the `useEffect` that scans files:

```typescript
const [refreshKey, setRefreshKey] = useState(0);
// in useEffect deps: [assetIndexDocs, refreshKey]
// after copy:
setRefreshKey(k => k + 1);
```

## Filter on `.path` check

Not all drag sources provide `.path` (e.g., drag from browser tab). Always check before invoking:

```typescript
if (!srcPath) {
  errors.push(`${file.name}: path unavailable`);
  continue;
}
```

## Critical: `dragDropEnabled: false` required in tauri.conf.json

**Gotcha**: Tauri 2 intercepts OS-level file drag-drop events by default and converts them to Tauri-internal events. React's `onDrop` / `onDragEnter` / `onDragLeave` handlers **never fire** unless you disable this interception.

Fix — add to the window config in `tauri.conf.json`:

```json
{
  "app": {
    "windows": [
      {
        "label": "main",
        "dragDropEnabled": false
      }
    ]
  }
}
```

With `dragDropEnabled: false`, drops pass through to the DOM as native browser events and React's synthetic event system picks them up normally. The `.path` property on `File` objects is still injected by WebView2.

## Context

Used in org-viewer-dev AssetsView — drop images/videos directly into the asset grid; destination dir resolves from current project/platform filters.

<!-- orphan: 0 inbound links as of 2026-04-20 -->
