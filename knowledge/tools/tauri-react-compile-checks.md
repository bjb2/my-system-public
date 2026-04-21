---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [tauri, react, typescript, rust, testing, workflow]
---

# Tauri + React: Compile Checks Before Delivery

## Rule

Run these two checks after every change before reporting done. No exceptions.

```bash
# TypeScript — catches type errors, missing imports, bad refs (~5s)
cd <path-to-org-viewer-dev>
npx tsc --noEmit

# Rust — catches compile errors without a full build (~15s)
cd <path-to-org-viewer-dev>/src-tauri
cargo check
```

## Starting the dev server (logic or UI changes)

```powershell
$env:ORG_ROOT = "<path-to-org-root>"
cd <path-to-org-viewer-dev>
npm run tauri dev
```

Must reach a running window without terminal errors. For behavioral changes (PTY timing, event flow), state explicitly what can and can't be verified without user interaction.

## What these checks catch

- `tsc --noEmit`: type errors, bad imports, missing props, wrong ref types
- `cargo check`: Rust compile errors, missing trait impls, lifetime issues
- Dev server: runtime panics, Tauri command mismatches, white-screen crashes

## What they don't catch

Behavioral correctness for async/PTY/timing logic (e.g. swarm context injection). For those, state the limitation rather than claiming success.
