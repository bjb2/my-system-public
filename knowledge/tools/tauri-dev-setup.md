---
type: knowledge
created: 2026-04-16
updated: 2026-04-17
tags: [tauri, rust, react, tooling]
---

# Tauri 2 Dev Setup Gotchas

## devUrl is required for dev mode

Without `devUrl` in `tauri.conf.json`, Tauri loads `frontendDist` even during `cargo tauri dev` — showing a blank page if dist is a stub. Always add:

```json
"build": {
  "frontendDist": "../dist",
  "devUrl": "http://localhost:1420",
  "beforeDevCommand": "npm run dev",
  "beforeBuildCommand": "npm run build"
}
```

## generate_context!() requires dist to exist at compile time

`cargo check` (and any Rust compile) will panic if `frontendDist` doesn't exist on disk. Create a stub before checking:

```powershell
New-Item -ItemType Directory -Force dist
Set-Content dist/index.html '<html></html>'
```

## protocol-asset feature conflict

If `Cargo.toml` lists `tauri = { features = ["protocol-asset"] }` but it's not in `tauri.conf.json` allowlist, build fails. Remove the feature from Cargo.toml or add it to the conf.

## cargo check false failure via PowerShell 2&gt;&1

PowerShell's `2>&1` redirect treats cargo's stderr progress output as an error, reporting exit code 1 even when compilation succeeds. Check the output for "Finished" to confirm actual success.

## current_exe() is wrong in dev mode

In dev, `current_exe().parent()` points to `target/debug/`, not your data directory. Env vars also don't reliably propagate through `npm run tauri dev` on Windows.

**Robust fix**: auto-detect by searching for a signature file (`CLAUDE.md` or similar). Search order: exe ancestors (works in production), then walk cwd ancestors checking siblings at each level (works in dev regardless of how deep the process cwd is).

**Critical gotcha**: checking only ONE level of cwd siblings is not enough. If Tauri's dev process cwd is `target/debug`, parent is `target`, whose siblings are other items inside `src-tauri` — none of which contain CLAUDE.md. Must walk the full ancestor chain, checking siblings at every level, until a sibling directory with CLAUDE.md is found.

```rust
fn find_data_root() -> PathBuf {
    // Exe ancestors — works in production (exe dropped into data folder)
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().unwrap_or(&exe).to_path_buf();
        loop {
            if dir.join("CLAUDE.md").exists() { return dir; }
            match dir.parent() { Some(p) => dir = p.to_path_buf(), None => break }
        }
    }
    // Walk cwd ancestors; at each level check the dir itself and all its siblings.
    // Handles dev where cwd may be deep (target/debug) while data dir is a distant sibling.
    if let Ok(cwd) = std::env::current_dir() {
        let mut dir = cwd.clone();
        loop {
            if dir.join("CLAUDE.md").exists() { return dir.clone(); }
            if let Some(parent) = dir.parent() {
                for entry in std::fs::read_dir(parent).into_iter().flatten().flatten() {
                    let p = entry.path();
                    if p.is_dir() && p != dir && p.join("CLAUDE.md").exists() { return p; }
                }
                dir = parent.to_path_buf();
            } else { break; }
        }
    }
    std::env::current_exe().ok()
        .and_then(|e| e.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}
```

Priority: CLI arg → `ORG_ROOT` env var → auto-detect.

## xterm.js: rendering quality in embedded terminals

Default canvas renderer looks pixelated/blocky. Use WebGL + proper font stack:

```tsx
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";

const terminal = new Terminal({
  fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'Courier New', monospace",
  fontSize: 13,
  lineHeight: 1.0,      // exact 1:1 — gaps at >1.0 break box-drawing / TUI art
  letterSpacing: 0,
  minimumContrastRatio: 1,  // don't auto-adjust colors
  allowProposedApi: true,
});

// Unicode11 — must load before open()
const unicode11 = new Unicode11Addon();
terminal.loadAddon(unicode11);
terminal.unicode.activeVersion = "11";

// WebGL — must load AFTER open() since it needs the DOM
terminal.open(container);
try {
  const webgl = new WebglAddon();
  webgl.onContextLoss(() => webgl.dispose());
  terminal.loadAddon(webgl);
} catch { /* canvas fallback */ }
```

Key points:

- `lineHeight: 1.0` is critical for Claude Code / TUI apps — any gap breaks box-drawing characters
- Cascadia Code (ships with Windows 11 + VS Code) renders cleanly at all DPIs
- WebGL must load after `open()`, Unicode11 must load before
- Set `TERM_PROGRAM=xterm` in the PTY environment to suppress PSReadLine shell-integration sequences

## xterm.js: PSReadLine OSC sequences leak as visible text

PowerShell with PSReadLine emits OSC escape sequences to report the working directory and shell state. If xterm.js doesn't handle them, they render as literal garbage text (e.g. the path appearing after the first prompt).

**Fix**: register OSC handlers that swallow the sequences, and delay `terminal.focus()` so the focus-in escape (`\e[I]`) doesn't arrive during the initial prompt draw.

```tsx
const terminal = new Terminal({ allowProposedApi: true, ... });

// Suppress PSReadLine / shell integration sequences before they render as text
terminal.parser.registerOscHandler(7,   () => true); // working dir (PSReadLine)
terminal.parser.registerOscHandler(133, () => true); // shell integration  
terminal.parser.registerOscHandler(633, () => true); // VS Code shell integration

// In the mount effect — delay focus to avoid PSReadLine re-rendering prompt
useEffect(() => {
  terminal.open(container);
  fitAddon.fit();
  const t = setTimeout(() => terminal.focus(), 80); // don't send \e[I during startup
  return () => clearTimeout(t);
}, [activeTabId]);
```

## Tauri 2 invoke() parameter naming: always camelCase

Rust command parameters use `snake_case` but Tauri 2 applies `#[serde(rename_all = "camelCase")]` automatically. JS invoke keys must match the **camelCase** version:

```rust
// Rust
pub fn pty_write(pty_id: u32, data: String, ...) {}
pub fn pty_resize(pty_id: u32, rows: u16, cols: u16, ...) {}
```

```tsx
// JS — correct
invoke("pty_write",  { ptyId: id, data });
invoke("pty_resize", { ptyId: id, rows, cols });

// JS — WRONG (silently fails — Tauri returns an error, Promise rejects)
invoke("pty_write",  { pty_id: id, data });
```

No warning is emitted when a key is wrong — Tauri just returns an error response. If you don't `.catch()` the invoke, it fails silently, making this very hard to diagnose. Always match camelCase.

**Exception**: single-word params (`shell`, `cwd`, `data`, `rows`, `cols`) are unchanged.

## Optional Rust parameters from JS

For `Option<T>` params, pass `null` (not `undefined`) to be unambiguous:

```tsx
// Good — explicit null
invoke("pty_create", { shell, args: null, cwd });

// Risky — undefined is omitted from JSON.stringify, Tauri may reject
invoke("pty_create", { shell, args: undefined, cwd });
```

## Always-mount pattern for views with live state (terminals, WebSockets)

Conditional rendering (`{show && <View />}`) unmounts the component on hide, killing terminals and PTY sessions. Use CSS visibility instead:

```tsx
// Wrong — unmounts on hide, kills PTY
{view === "swarm" && <SwarmView ... />}

// Right — always mounted, just hidden
<div style={{
  position: "absolute", inset: 0,
  visibility: view === "swarm" ? "visible" : "hidden",
  pointerEvents: view === "swarm" ? "auto" : "none",
}}>
  <SwarmView ... />
</div>
```

`visibility: hidden` keeps the element in the layout (real dimensions), so xterm.js FitAddon can still compute rows/cols correctly when it reappears.

## CRITICAL: Always use `npm run tauri build` for release — never `cargo build --release`

`cargo build --release` directly will produce a broken exe that shows ERR_CONNECTION_REFUSED (WebView tries `devUrl`/`localhost:1420` instead of embedded assets).

**Root cause**: `tauri-build` emits `cargo:rustc-cfg=dev` when `devUrl` is present in `tauri.conf.json` unless the build is invoked via the Tauri CLI. The Tauri CLI sets internal flags that suppress `cfg(dev)` for release builds. Raw `cargo build` does not.

**Diagnostic**: two competing build cache dirs can coexist under `target/release/build/org-viewer-*/` — one clean, one poisoned. The poisoned one wins if Cargo picks it. Check all: `grep -r "rustc-cfg=dev" target/release/build/org-viewer-*/output` — any hit means the deployed exe uses devUrl. The correct release output has `cargo:rustc-check-cfg=cfg(dev)` but NOT `cargo:rustc-cfg=dev`. Exe size is NOT a reliable indicator when both builds are ~15MB (size difference can be <200KB).

**Fix if stale dev cache is present**: delete the org-viewer build dirs with the dev flag, then run `npm run tauri build`.

**This breaks silently** when `Cargo.lock` is regenerated (e.g., after adding/removing a Cargo.toml dependency) — the new `tauri-build` binary may change behavior. Always verify exe size after a rebuild.

```powershell
# CORRECT
cd org-viewer-dev
npm run tauri build   # builds frontend + Rust, bundles installer

# WRONG — produces devUrl-mode exe even with --release flag
cd org-viewer-dev/src-tauri
cargo build --release
```

## PowerShell 5.1 deploy script gotcha: `->` in strings

The `->` token inside a double-quoted string in a `.ps1` file causes PS 5.1 to throw a parse error ("string missing terminator"). Replace with plain prose — e.g., `"rename X to Y"` instead of `"rename X -> Y"`.

## Related

- \[\[org-viewer-dev/README\]\]