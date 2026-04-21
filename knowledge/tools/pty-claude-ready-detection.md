---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [pty, claude-code, xterm, gotcha, org-viewer-dev]
---

# Claude Code Ready Detection in PTY

How to reliably detect when Claude Code's interactive prompt is ready before sending the priming task message.

## The problem with fixed timers

Claude Code startup time is not constant — it loads `CLAUDE.md`, runs start hooks, and processes context. As context files grow, startup takes longer. A fixed 5-second timer was too short in practice: the priming message arrived before readline was active and was silently discarded.

This extends [[pty-readline-race-condition]] with the Claude-specific solution.

## Pattern: ANSI-strip + prompt-character detection + 15s fallback

```ts
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;

const taskSentRef = useRef(false);
const sendTaskMsgRef = useRef<(() => void) | null>(null);

// Register the send function before the output listener fires
const sendTaskMsg = () => {
  if (taskSentRef.current) return;
  taskSentRef.current = true;
  invoke("pty_write", { ptyId: id, data: primeText })
    .then(() => invoke("pty_write", { ptyId: id, data: "\r" }));
};
sendTaskMsgRef.current = sendTaskMsg;

// 15s fallback — fires if the ready indicator is missed for any reason
setTimeout(sendTaskMsg, 15000);

// In the PTY output listener:
const plain = payload.data.replace(ANSI_RE, "");
if (sendTaskMsgRef.current && !taskSentRef.current && /◆|^[>❯]\s/m.test(plain)) {
  sendTaskMsgRef.current();
}
```

## Ready indicators to watch for (after ANSI-stripping)

- `◆` — Claude Code's diamond input prompt character (most reliable; appears only when Claude is waiting for input)
- `>` or `❯` at line start — fallback; also appears in PS prompt, so ANSI stripping is critical to avoid false positives

## Why ANSI stripping is required

Raw PTY output fragments prompt characters with escape sequences. The `◆` may arrive as:
```
\x1b[38;5;214m◆\x1b[0m
```

The regex `/◆/` won't match that raw string — strip first, then test.

The ANSI_RE pattern covers both CSI sequences (`\x1b[...m`) and OSC sequences (`\x1b]...\x07`).

## taskSentRef — preventing double-send

`sendTaskMsgRef` holds a stable reference to `sendTaskMsg` accessible across two effect closures (spawn effect and output listener effect). `taskSentRef` is the guard — once set, all subsequent calls to `sendTaskMsg` are no-ops. This handles:

- Output listener fires, sets flag, sends message → 15s fallback is a no-op
- 15s fallback fires before output-based detection → sets flag, sends → listener is a no-op
- React StrictMode double-mount: second effect sets `sendTaskMsgRef` to a new closure with the correct PTY id, so only the live PTY ever receives the message

## Sending Enter separately

Always chain Enter as a second `invoke` call, not appended to the text string:

```ts
invoke("pty_write", { ptyId: id, data: primeText })
  .then(() => invoke("pty_write", { ptyId: id, data: "\r" }));
```

See [[pty-readline-race-condition]] and [[pty-submit-key-sequences]] for why.

## Related

- [[pty-readline-race-condition]] — general ready-signal pattern for interactive CLIs
- [[swarm-agent-print-mode]] — full agent tile launch pattern using this detection
- [[windows-pty-cmd-scripts]] — why claude must be launched via PowerShell PTY
