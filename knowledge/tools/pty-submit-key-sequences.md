---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [pty, terminal, xterm, codex, keyboard, gotcha]
---

# PTY Submit Key Sequences

When writing directly to a PTY via `invoke("pty_write", ...)`, the bytes you send must match what the CLI tool expects — not what a human keyboard would produce in normal mode.

## Enter vs Shift+Enter

- **Enter**: `\r\n` (carriage return + newline)
- **Shift+Enter**: `\x1b[13;2u` (kitty keyboard protocol)

The kitty keyboard protocol is what modern CLI tools (Codex, etc.) use when they distinguish Shift+Enter from Enter. The sequence `\x1b[13;2u` means: key=13 (Return), modifier=2 (Shift).

## When this matters

Codex CLI has a mode (`shiftEnterToSend`) where Enter = newline and Shift+Enter = submit. If org-viewer sends `\r\n` as the initial message submit, Codex receives it as a newline inside the input box — not a submission. Must send `\x1b[13;2u` instead.

## org-viewer implementation

`submitKey` field on `AgentConfig` / `TileConfig`:

- `"enter"` (default) → sends `\r\n`
- `"shift+enter"` → sends `\x1b[13;2u`

Configured per-agent in `org.config.json`. Codex has `"submitKey": "shift+enter"`.

Logic in `AgentTile.tsx`:

```ts
const submitSeq = tile.submitKey === "shift+enter" ? "\x1b[13;2u" : "\r\n";
```

Applied to both `promptOverride` and `taskPath` injection paths.

## Related

- \[\[pty-readline-race-condition\]\] — sending input before readline is ready causes silent discard