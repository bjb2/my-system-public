---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [fabric, canvas, json, ai-gen, gotcha, org-viewer-dev]
---

# Canvas Sidecar JSON Pattern

Saving a `.canvas.json` sidecar alongside every exported PNG for round-trip editing and AI generation.

See [[fabric-js-vite-tauri]] for the full sidecar format, save/load implementation, and `loadFromJSON` zoom reset gotcha.

## Sidecar file naming

`identity-card-v1.png` → `identity-card-v1.png.canvas.json`

Append `.canvas.json` (don't strip the `.png` extension). Keeps the association obvious from a directory listing.

## AI generation loop must be sequential

When an AI draft generation step writes JSON back into a Fabric canvas, run only one generation at a time. Concurrent writes cause canvas state races:

- Two `loadFromJSON` calls can interleave — the second may start before the first callback fires, leaving the canvas in a partially applied state
- Fabric's internal `_objects` array is not synchronized; concurrent mutations corrupt z-order and layer state

**Pattern:**

```ts
const [aiGenerating, setAiGenerating] = useState(false);

async function generateAiDraft() {
  if (aiGenerating) return;  // block re-entry
  setAiGenerating(true);
  try {
    const result = await invoke<string>("generate_canvas_draft", { prompt, context });
    const parsed = JSON.parse(result);
    await new Promise<void>(resolve => {
      fc.loadFromJSON(parsed.canvas, () => {
        reapplyZoom();
        syncLayers();
        resolve();
      });
    });
  } finally {
    setAiGenerating(false);
  }
}
```

Never call `generateAiDraft` from a polling loop or from effects without a guard — each call must complete before the next starts.

## Sidecar size

`toJSON()` serializes dropped photos as inline data URLs. A canvas with one dropped photo can produce a sidecar file of several MB. This is acceptable for desktop/local use; don't serialize these to a database or sync endpoint.

Cap undo history at ~20 snapshots for the same reason.

## Rust-side AI generation (spawning claude --print)

See [[windows-pty-cmd-scripts]] for why `std::process::Command::new("claude")` fails on Windows. For non-interactive AI draft generation from Rust:

```rust
let output = std::process::Command::new("powershell")
    .args(["-Command", &format!("claude --print '{}'", escaped_prompt)])
    .output()?;
let response = String::from_utf8_lossy(&output.stdout).to_string();
```

This is synchronous — the Tauri command blocks until claude exits. Fine for one-at-a-time AI gen; do not call in a tight loop.

## Related

- [[fabric-js-vite-tauri]] — full sidecar format, loadFromJSON implementation, zoom reset after load
- [[windows-pty-cmd-scripts]] — why Rust must use powershell for claude invocation
- [[fabric-canvas-clear-fires-object-removed]] — related canvas state race with clear/load
