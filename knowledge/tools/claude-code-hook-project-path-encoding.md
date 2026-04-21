---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [claude-code, hooks, gotcha]
---

# Claude Code Hook: Project Path Encoding

## The Problem

Hooks run as separate processes with no direct access to the Claude session's working directory. The Stop hook receives only `{"transcript_path": "...", "stop_hook_active": bool}`. The transcript path is at:

```
~/.claude/projects/<EncodedPath>/transcript.jsonl
```

The `<EncodedPath>` is the project directory path with separators replaced by dashes:
- Windows: `C:\Users\bryan\enclave\my-org` → `C--Users-bryan-enclave-my-org`
- Unix/Mac: `/Users/bryan/enclave/my-org` → `Users-bryan-enclave-my-org`

## The Pattern

Decode the path from the transcript_path field:

```python
import re, os

def _decode_project_path(encoded: str) -> str | None:
    win = re.match(r'^([A-Za-z])--(.+)$', encoded)
    if win:
        drive, rest = win.groups()
        return drive + ':\\' + rest.replace('-', '\\')
    return '/' + encoded.replace('-', '/')

def find_org_dir(data: dict) -> str | None:
    transcript = data.get("transcript_path", "")
    if transcript:
        m = re.search(r'[/\\]projects[/\\]([^/\\]+)[/\\]', transcript)
        if m:
            candidate = _decode_project_path(m.group(1))
            if candidate and os.path.isfile(os.path.join(candidate, "CLAUDE.md")):
                return candidate
    # Fallback: CWD
    cwd = os.getcwd()
    if os.path.isfile(os.path.join(cwd, "CLAUDE.md")):
        return cwd
    return None
```

## Caveats

- Folder names with dashes in them will decode ambiguously (a dash in the original path looks the same as a separator). Mitigate by verifying a sentinel file (CLAUDE.md) exists at the candidate path.
- SessionStart hook receives `{"cwd": "...", "session_id": "..."}` — use `data.get("cwd")` directly instead of decoding.
- `ORG_DIR` env var is a reliable explicit override for both hook types.
