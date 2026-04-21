---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [pty, claude-code, logging, tauri, rust, org-viewer-dev]
---

# PTY Structured Log Pattern (Permission Prompt JSONL)

Observation-only pattern for capturing Claude Code permission prompts from PTY output and appending to a JSONL log via Tauri. Used to build allowlist candidates from live data.

## Pattern overview

1. Strip ANSI from raw PTY output
2. Pattern-match for Claude permission prompt signatures
3. Append a structured JSONL record via Tauri command

## Frontend: detect and log

```ts
const ANSI_RE = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;

// Permission prompt signatures (ANSI-stripped)
const PERMISSION_PATTERNS = [
  /Claude needs permission to/,
  /Allow this action\?/,
  /Do you want to allow/,
  /\[y\/n\]/i,
];

listen("pty-output", ({ payload }) => {
  const plain = payload.data.replace(ANSI_RE, "");
  const matched = PERMISSION_PATTERNS.find(p => p.test(plain));
  if (matched) {
    invoke("append_permission_log", {
      entry: JSON.stringify({
        ts: new Date().toISOString(),
        tileId: tile.id,
        taskPath: tile.taskPath ?? null,
        snippet: plain.trim().slice(0, 200),
      }) + "\n",
    });
  }
});
```

## Rust: append-only JSONL command

```rust
#[tauri::command]
fn append_permission_log(app: tauri::AppHandle, entry: String) -> Result<(), String> {
    let log_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("permission-log.jsonl");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    file.write_all(entry.as_bytes()).map_err(|e| e.to_string())
}
```

Append-only is intentional — never overwrite, never truncate. The log accumulates across sessions and is read offline to identify frequent prompts worth adding to the allowlist.

## Reading the log

The JSONL file is one JSON object per line. Parse offline to count most common prompt snippets:

```python
import json, collections
counts = collections.Counter()
with open("permission-log.jsonl") as f:
    for line in f:
        r = json.loads(line)
        counts[r["snippet"][:80]] += 1
for snippet, n in counts.most_common(20):
    print(n, snippet)
```

High-frequency prompts are allowlist candidates for `.claude/settings.json`.

## Observation-only — no auto-approval

This pattern only logs. It does not send keystrokes, does not auto-approve, and does not interfere with Claude's prompt. The user still responds manually in the terminal.

## Related

- [[claude-code-permissions-allowlist]] — how to add entries to the allowlist
- [[pty-claude-ready-detection]] — ANSI stripping pattern reused here
- [[swarm-agent-print-mode]] — PTY output listener structure
