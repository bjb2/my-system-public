---
type: knowledge
created: 2026-04-17
updated: 2026-04-20
tags: [tauri, rust, pty, windows]
---

# Windows PTY: Can't Spawn .cmd Scripts Directly

## Problem

`portable_pty` (and most PTY libraries) spawn raw executables. On Windows, npm global packages like `claude`, `npx`, `tsc` are installed as `.cmd` wrapper scripts, not `.exe` binaries. Invoking them by name fails silently or with a spawn error.

```rust
// FAILS on Windows — claude is claude.cmd, not claude.exe
CommandBuilder::new("claude")
```

## Fix

Always spawn `powershell` (which understands `.cmd` files), then write the command into the PTY as input:

```typescript
// Spawn PowerShell
invoke("pty_create", { shell: "powershell", args: ["-NoLogo"], cwd })

// After PS prompt appears (~600ms), write the command
setTimeout(() => {
  invoke("pty_write", { ptyId: id, data: "claude --dangerously-skip-permissions\r\n" });
}, 600);
```

## Timing for multi-step sequences

When you need to prime an interactive CLI after it loads:

```typescript
setTimeout(() => invoke("pty_write", { data: "claude --dangerously-skip-permissions\r\n" }), 600);  // start claude
setTimeout(() => invoke("pty_write", { data: taskPrompt + "\n" }), 4000);  // prime after claude loads
```

4s is conservative but safe. If claude hasn't loaded, the message sits in the PTY buffer and appears when it does.

## Affected commands

Any npm global: `claude`, `npx`, `tsc`, `eslint`, `prettier`, etc. Native executables (`powershell`, `node`, `git`, `cargo`) work fine directly.

## Non-PTY: synchronous output capture from Rust

For one-shot, non-interactive output capture (e.g. AI draft generation), use `std::process::Command` via PowerShell — not `CommandBuilder`. This is synchronous and does not require a PTY:

```rust
let escaped = prompt.replace('\'', "'\\''");
let output = std::process::Command::new("powershell")
    .args(["-Command", &format!("claude --print '{}'", escaped)])
    .output()
    .map_err(|e| e.to_string())?;
let response = String::from_utf8_lossy(&output.stdout).to_string();
```

`Command::new("claude")` fails silently on Windows because `claude` is `claude.cmd`. Routing through `powershell -Command` works because PowerShell resolves `.cmd` files.

`--print` mode exits after the response — the `.output()` call blocks until claude finishes, making it safe to use in a Tauri command handler.

**Do not use this for interactive sessions** — PTY spawning (the fix above) is required for interactive Claude Code. This pattern is only for fire-and-forget `--print` invocations.

See [[canvas-sidecar-json-pattern]] for an example of sequential Rust-side AI generation using this pattern.
