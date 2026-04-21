---
type: knowledge
created: 2026-04-17
updated: 2026-04-17
tags: [pty, xterm, readline, tauri, gotcha]
---

# PTY Readline Race Condition

## Problem

Writing to a PTY before an interactive CLI's readline is initialized causes input to be silently discarded. The text appears on screen (xterm renders whatever the PTY emits) but the application never receives it as input.

**Symptom**: programmatic input shows in the terminal buffer but the CLI doesn't act on it.

**Why**: interactive CLIs (claude, python REPL, etc.) set their terminal to raw mode and install a readline handler. Characters sent *before* this setup lands in the kernel's TTY line discipline buffer, which readline discards or ignores when it takes over.

## Wrong approach — fixed delay

```typescript
// UNRELIABLE — 4000ms might not be enough, and even if it is,
// characters sent mid-setup are still discarded
setTimeout(() => {
  invoke("pty_write", { ptyId: id, data: "task prompt\r\n" });
}, 4000);
```

## Right approach — watch output for ready signal

Listen to the PTY output stream and send input only after the application signals it's ready:

```typescript
// Claude Code emits ✻ in its startup banner — unique, reliable signal
// Then waits for "> " (the prompt) before sending input

listen("pty-output", ({ payload }) => {
  if (payload.pty_id !== ptyIdRef.current) return;
  terminalRef.current?.write(payload.data);

  if (taskSentRef.current) return;

  if (!claudeReadyRef.current && payload.data.includes("✻")) {
    claudeReadyRef.current = true;
  }
  if (claudeReadyRef.current && payload.data.includes("> ")) {
    taskSentRef.current = true;
    invoke("pty_write", { ptyId: ptyIdRef.current, data: taskMsg + "\r\n" });
  }
});
```

## Caveat: ANSI escape codes break literal string matching

Raw PTY data is not plain text. Prompts arrive surrounded by cursor-positioning and color codes:

```
\x1b[2K\x1b[1G> \x1b[0m
```

This means `payload.data.includes("> ")` often **fails** even when the prompt is visually present. The `> `substring isn't there — the ANSI codes break it.

**More reliable approach — timer after banner**:

```typescript
setTimeout(() => {
  invoke("pty_write", { ptyId: id, data: "claude\r\n" }).catch(() => {});
  // 5s gives readline plenty of time to initialize after banner appears
  setTimeout(() => {
    if (taskSentRef.current || !ptyIdRef.current) return;
    taskSentRef.current = true;
    // IMPORTANT: use ptyIdRef.current (the live ref), NOT the closed-over `id`.
    // React StrictMode double-mounts effects: Effect 1 spawns PTY id=1, cleanup
    // kills it, Effect 2 spawns id=2. Both timers fire — the first wins the
    // taskSentRef flag but writes to id=1 (killed), the second skips. Using the
    // ref always writes to whichever PTY is currently live.
    invoke("pty_write", { ptyId: ptyIdRef.current, data: taskMsg + "\r\n" }).catch(() => {});
  }, 5000);
}, 600);
```

Strip ANSI codes before matching if you need output-based detection:

```typescript
const plain = payload.data.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
if (plain.includes("> ")) { ... }
```

## Sending Enter to a PTY

In terminal raw mode, the Enter key is `\r` (carriage return), **not** `\r\n`. Sending `\r\n` causes readline to receive `\n` as a second character which may cause unexpected behavior.

**Critical**: send Enter as a *separate* PTY write, chained after the text write. Appending `\r` to the same string is unreliable — readline may not process it when it arrives as part of a longer buffer. Splitting the writes mirrors how user keystrokes actually arrive (one write per key):

```typescript
const ptyId = ptyIdRef.current;
invoke("pty_write", { ptyId, data: "my prompt text" })
  .then(() => invoke("pty_write", { ptyId, data: "\r" }))
  .catch(() => {});
```

## General pattern

Each interactive CLI has a unique ready signal:

- **Claude Code**: `✻` in banner (but match against ANSI-stripped data), or use 5s timer after launch
- **Python REPL**: `>>>`
- **Node REPL**: `>`
- **PowerShell**: `PS C:\...>`

## Related

- [[pty-submit-key-sequences]] — which byte sequence to send for Enter vs Shift+Enter