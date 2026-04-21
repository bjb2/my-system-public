---
type: knowledge
created: 2026-04-16
updated: 2026-04-20
tags: [org-viewer-dev, swarm, claude-code, pty, observer]
---

# Swarm Agent Tile Launch Pattern

## Current Approach: Interactive Claude + Output-Watching Priming

Agent tiles use interactive `claude` so the session stays open for visibility and follow-up.

Two-step launch via PowerShell PTY, with output-watching for the priming message:

```ts
// Component-level refs — bridge between spawn effect and output listener effect
const taskSentRef = useRef(false);       // prevents double-send
const sendTaskMsgRef = useRef<(() => void) | null>(null);

// In the PTY spawn effect:
// Step 1: start claude at 600ms (claude is a .cmd script — must route through PS PTY)
setTimeout(() => {
  invoke("pty_write", { ptyId: ptyIdRef.current!, data: "claude\r\n" });
}, 600);

// Step 2: unified sendTaskMsg with 15s fallback timer
if (tile.promptOverride || tile.taskPath) {
  const sendTaskMsg = () => {
    if (taskSentRef.current) return;
    taskSentRef.current = true;
    if (tile.promptOverride) {
      invoke("pty_write", { ptyId: id, data: tile.promptOverride! })
        .then(() => invoke("pty_write", { ptyId: id, data: submitSeq }));
    } else {
      const msg = `Read ${tile.taskPath} for your task. Project context is in ${tile.projectRoot}/CLAUDE.md. Begin working immediately.`;
      invoke("pty_write", { ptyId: id, data: msg })
        .then(() => invoke("pty_write", { ptyId: id, data: submitSeq }));
    }
  };
  sendTaskMsgRef.current = sendTaskMsg;
  setTimeout(sendTaskMsg, 15000); // fallback — fires if ready-indicator is missed
}

// In the PTY output listener effect (ANSI_RE already defined there):
const plain = payload.data.replace(ANSI_RE, "");
if (sendTaskMsgRef.current && !taskSentRef.current && /◆|^[>❯]\s/m.test(plain)) {
  sendTaskMsgRef.current(); // fires exactly when Claude is ready
}
```

### Why output-watching, not a fixed timer

Claude Code startup time varies: it loads `CLAUDE.md`, runs maintenance start hooks, and initializes context. As `CLAUDE.md` and `current-state.md` grow, startup takes longer. A fixed 5s timer was too short — the priming message arrived before Claude's readline was active and was swallowed.

**Ready indicators to watch for** (ANSI-stripped):
- `◆` — Claude Code's input prompt diamond (most reliable)
- `>` or `❯` at start of a line — fallback, also appears in PS prompt so ANSI strip is critical

**Why ANSI stripping is required**: Raw PTY data contains escape sequences that fragment the text; `◆` may arrive as `\x1b[...m◆\x1b[0m` with codes around it. Strip first, then test.

**ANSI_RE** (already in AgentTile's output listener):
```ts
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;
```

### promptOverride — for agents with no task file

When you want to spawn an agent from a hardcoded/generated prompt string (e.g. the observer agent, or any button-triggered agent), set `promptOverride` instead of `taskPath`:

```ts
addTile(null, "observer", orgRoot, undefined, buildObserverPrompt())
// or directly:
{ taskPath: null, promptOverride: buildObserverPrompt(), title: "observer", ... }
```

The title bar and kaomoji animation both key off `!!(taskPath || promptOverride)` — so prompt-override tiles get the same accented appearance as task tiles.

**Why this over `--print`**: `--print` gives no visibility into what the agent is doing. Interactive mode lets you watch progress and send follow-up messages.

## Alternative: --print for Hands-Off Auto-Close

If you want fire-and-forget tiles that auto-close on completion, use `--print`:

```ts
setTimeout(() => {
  const msg = `claude --print 'Read ${tile.taskPath} for your task...'`;
  invoke("pty_write", { ptyId: id, data: msg + "\r\n" });
}, 600);
```

Detect completion by watching PTY output for PS prompt returning (ANSI-stripped):

```ts
const stripped = stripAnsi(outputBuf);
if (/(?:\r?\n)PS [A-Za-z]:/.test(stripped)) { /* claude exited */ }
```

Tradeoff: loses interactivity entirely — can't watch progress or ask follow-ups.

## localStorage Position Persistence Gotcha

Tile x/y is persisted to localStorage on every change. On restore, the viewport may differ — a tile can land fully off-screen (count shows 1, nothing visible).

**Fix on restore** — clamp positions during `useState` initializer:
```ts
return tiles.map(t => ({
  ...t,
  x: Math.max(0, Math.min(t.x, window.innerWidth - 100)),
  y: Math.max(0, Math.min(t.y, window.innerHeight - 60)),
}));
```

**Live escape hatch** — "reset positions" button in the swarm toolbar snaps all tiles back to the cascaded origin grid.

## Don't Persist promptOverride / Observer Tiles

Observer tiles and any `promptOverride` tiles are PTY-bound — the PTY is gone after restart. Persisting them to localStorage leaves a ghost tile with `title === "observer"`, which makes `observerRunning = true` and permanently disables the trigger button.

**Fix on restore** — filter before clamping positions:
```ts
const restored = tiles.filter(t => t.title !== "observer" && !t.promptOverride);
```

## Claude Code Stop Hook Does Not Fire for Non-Claude Agents #gotcha

Claude Code's stop hook (`stopHook` in settings.json) is a **Claude Code session lifecycle event** — it fires when `claude` (the CLI) terminates, not when a PTY process closes.

Non-claude agent tiles (codex, copilot, gemini) run as plain PTY processes. The Claude Code runtime has no visibility into them. When a codex tile closes, **no stop hook fires** — so maintenance checks, session summaries, or any other stop-hook logic are silently skipped.

**Implications:**
- The org maintenance vigilance check only runs after Claude Code sessions
- Multi-agent workflows that mix claude and codex/copilot tiles will have inconsistent maintenance coverage
- Any stop-hook side effects (memory saves, context captures) are claude-only

**Fix direction:** Either wire a synthetic "session end" event from org-viewer's PTY close path to trigger maintenance, or add a Settings tab button ("Run maintenance check") as a manual trigger for non-claude sessions. See task `org-viewer-fix-maintenance-hooks-non-claude.md`.

## StrictMode Race Fix

The `sendTaskMsg` function captures `id` directly by closure (defined inside `.then(id => {...})`), so it always writes to the correct PTY regardless of StrictMode double-mount. The previous timer-only approach used `ptyIdRef.current` as a workaround — the closure approach is cleaner and avoids the ref race entirely.
