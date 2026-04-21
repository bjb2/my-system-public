---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [org-viewer-dev, swarm, localstorage, pty, react]
---

# Swarm Tile localStorage Persistence

Pattern for serializing swarm tile layout to localStorage and re-spawning PTY-backed tiles on mount.

## Serialize on every update

Write tile state to localStorage any time the tile array changes:

```ts
useEffect(() => {
  const toSave = tiles.filter(t => t.taskPath && !t.promptOverride);
  localStorage.setItem("swarmTiles", JSON.stringify(toSave));
}, [tiles]);
```

**Only persist task-linked tiles** — observer tiles and `promptOverride` tiles are PTY-bound. The PTY is gone after restart; persisting them leaves ghost tiles with stale state. See [[swarm-agent-print-mode]] for filtering details.

## Restore on mount (with position clamping)

```ts
const [tiles, setTiles] = useState<SwarmTile[]>(() => {
  try {
    const raw = localStorage.getItem("swarmTiles");
    if (!raw) return [];
    const parsed: SwarmTile[] = JSON.parse(raw);
    return parsed
      .filter(t => t.taskPath && !t.promptOverride)
      .map(t => ({
        ...t,
        x: Math.max(0, Math.min(t.x, window.innerWidth - 100)),
        y: Math.max(0, Math.min(t.y, window.innerHeight - 60)),
      }));
  } catch {
    return [];
  }
});
```

Position clamping prevents off-screen tiles when the viewport size differs from the last session (e.g., window resized, different display resolution).

## Re-spawn PTYs on mount

Restored tiles have `taskPath` set but no live PTY. The AgentTile component handles re-spawn: its mount effect always creates a new PTY regardless of whether the tile was just created or restored from localStorage. No extra logic needed in the container — mount equals spawn.

For task-linked tiles, the priming message uses the stored `taskPath`:

```ts
const msg = `Read ${tile.taskPath} for your task. Project context is in ${tile.projectRoot}/CLAUDE.md. Begin working immediately.`;
invoke("pty_write", { ptyId: id, data: msg })
  .then(() => invoke("pty_write", { ptyId: id, data: submitSeq }));
```

This means task context is re-sent on every mount — Claude picks up the task fresh each session.

## Reset positions escape hatch

Add a "reset positions" button that snaps all tiles back to the cascaded grid:

```ts
const resetPositions = () => {
  setTiles(prev => prev.map((t, i) => ({
    ...t,
    x: 40 + i * 30,
    y: 40 + i * 30,
  })));
};
```

Useful when tiles land off-screen due to display config changes.

## What NOT to persist

- `promptOverride` tiles — bound to a one-time agent invocation; PTY is gone after restart
- Observer tiles (identified by `title === "observer"`) — same reason
- `ptyId` — always regenerated on spawn
- Any ephemeral UI state (collapsed, focused)

## Related

- [[swarm-agent-print-mode]] — full agent tile launch pattern, localStorage position gotcha, observer tile filtering
- [[pty-claude-ready-detection]] — how PTYs detect Claude ready state before sending the task message
- [[react-stable-refs-for-closures]] — why `sendTaskMsgRef` / `taskSentRef` pattern works across StrictMode
