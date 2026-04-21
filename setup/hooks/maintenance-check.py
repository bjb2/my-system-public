#!/usr/bin/env python3
"""
Maintenance Check Hook - Runs before session ends.

Blocks stop and prompts Claude to evaluate the session for maintenance actions.
Uses a signal→action table so Claude knows exactly where each type of thing goes.
"""

import json
import sys
import os
import re
from datetime import datetime, timezone

TRIVIAL_SESSION_THRESHOLD = 15


def _decode_project_path(encoded: str) -> str | None:
    """
    Reverse Claude Code's project path encoding back to a filesystem path.
    Claude encodes project paths by replacing separators with dashes.
    Windows: C--Users-alice-my-org  ->  C:\\Users\\alice\\my-org
    Unix:    Users-alice-my-org     ->  /Users/alice/my-org
    """
    win = re.match(r'^([A-Za-z])--(.+)$', encoded)
    if win:
        drive, rest = win.groups()
        return drive + ':\\' + rest.replace('-', '\\')
    return '/' + encoded.replace('-', '/')


def find_org_dir(data: dict) -> str | None:
    """
    Detect the org root directory from multiple sources, in priority order:

    1. ORG_DIR environment variable (explicit override)
    2. Decoded from Claude's transcript path
    3. Current working directory (if it has a CLAUDE.md)
    4. Walk up from CWD looking for CLAUDE.md
    """
    # 1. Explicit env var — set in shell profile or settings.json env block
    env_dir = os.environ.get("ORG_DIR") or os.environ.get("CLAUDE_ORG_DIR")
    if env_dir:
        expanded = os.path.expandvars(os.path.expanduser(env_dir))
        if os.path.isdir(expanded):
            return expanded

    # 2. Derive from transcript path
    # transcript: ~/.claude/projects/<Encoded-Path>/transcript.jsonl
    transcript = data.get("transcript_path", "")
    if transcript:
        m = re.search(r'[/\\]projects[/\\]([^/\\]+)[/\\]', transcript)
        if m:
            candidate = _decode_project_path(m.group(1))
            if candidate and os.path.isfile(os.path.join(candidate, "CLAUDE.md")):
                return candidate

    # 3. Current working directory
    cwd = os.getcwd()
    if os.path.isfile(os.path.join(cwd, "CLAUDE.md")):
        return cwd

    # 4. Walk upward from CWD
    path = cwd
    for _ in range(6):
        parent = os.path.dirname(path)
        if parent == path:
            break
        path = parent
        if os.path.isfile(os.path.join(path, "CLAUDE.md")):
            return path

    return None


def allow_stop():
    print(json.dumps({"continue": True}))
    sys.exit(0)


def get_recent_org_changes(org_dir: str, minutes: int = 120) -> list[str]:
    """Return org files modified in the last N minutes."""
    changed = []
    cutoff = datetime.now(timezone.utc).timestamp() - (minutes * 60)
    for root, dirs, files in os.walk(org_dir):
        # Skip hidden dirs and build artifacts
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'target', 'dist', '__pycache__')]
        for fname in files:
            if not fname.endswith('.md'):
                continue
            path = os.path.join(root, fname)
            try:
                if os.path.getmtime(path) > cutoff:
                    rel = os.path.relpath(path, org_dir).replace('\\', '/')
                    changed.append(rel)
            except OSError:
                pass
    return sorted(changed)


def get_org_stats(org_dir: str) -> dict:
    """Quick scan of org state."""
    stats = {"active_tasks": 0, "inbox": 0, "knowledge": 0}
    for root, dirs, files in os.walk(org_dir):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('node_modules', 'target', 'dist')]
        for fname in files:
            if not fname.endswith('.md'):
                continue
            path = os.path.join(root, fname)
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read(500)
                if 'type: task' in content and 'status: active' in content:
                    stats["active_tasks"] += 1
                elif 'type: inbox' in content:
                    stats["inbox"] += 1
                elif 'type: knowledge' in content:
                    stats["knowledge"] += 1
            except OSError:
                pass
    return stats


def already_answered(content: str) -> bool:
    """Check if Claude explicitly said 'No maintenance needed' as a standalone response."""
    # Look only at the last 1000 chars, and require it to be a short standalone line
    recent = content[-1000:] if len(content) > 1000 else content
    lines = recent.strip().splitlines()
    for line in reversed(lines):
        stripped = line.strip()
        if stripped == "No maintenance needed.":
            return True
        # If we hit a non-empty line that isn't this phrase, stop looking
        if stripped and len(stripped) > 5:
            break
    return False


def main():
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, Exception):
        allow_stop()

    if data.get("stop_hook_active"):
        allow_stop()

    transcript_path = data.get("transcript_path")
    if not transcript_path or not os.path.exists(transcript_path):
        allow_stop()

    try:
        with open(transcript_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception:
        allow_stop()

    if content.count('\n') < TRIVIAL_SESSION_THRESHOLD:
        allow_stop()

    if already_answered(content):
        allow_stop()

    org_dir = find_org_dir(data)
    if not org_dir:
        allow_stop()

    # Gather context
    changed_files = get_recent_org_changes(org_dir)
    stats = get_org_stats(org_dir)

    # Build context block
    context_lines = []
    if changed_files:
        context_lines.append(f"  • Files modified this session: {', '.join(changed_files[:6])}{'...' if len(changed_files) > 6 else ''}")
    context_lines.append(f"  • Org state: {stats['active_tasks']} active tasks | {stats['inbox']} inbox | {stats['knowledge']} knowledge articles")

    context_block = "\n".join(context_lines)

    message = f"""MAINTENANCE VIGILANCE CHECK

Before stopping, evaluate this session:

| Signal                        | Action if Present                              |
|-------------------------------|------------------------------------------------|
| New reusable insight/pattern  | → knowledge/<subfolder>/<topic>.md             |
| Project status changed        | → Update context/current-state.md             |
| New task identified           | → tasks/<name>.md                             |
| Question worth preserving     | → queries/<question>.md                       |
| Cross-project pattern         | → Add instantiation to principle lattice      |
| Feature idea / future project | → inbox/ideas/<item>.md                       |
| Decision needed               | → inbox/decisions/<item>.md                   |
| Bug to investigate            | → inbox/investigations/<item>.md              |
| Quick unsorted capture        | → inbox/captures/<item>.md                    |
| KB file needs organization    | → Move to appropriate subfolder               |
| Friction / ADHD pain observed | → inbox/decisions/<enhancement-proposal>.md   |
| Repeated manual action        | → inbox/decisions/<automation-proposal>.md    |

Improvement scan (run every session):
- Did any workflow feel high-friction or require willpower to maintain?
- Was anything out-of-sight that should have been visible?
- Did any task get deferred due to aversion or activation energy?
- Is there state living in your head that should be externalized?
If yes to any: write a proposal to inbox/decisions/ now.

Session context:
{context_block}

If ANY apply: perform the maintenance NOW.
If NONE apply: state "No maintenance needed." and stop.

Be aggressive about capture — lost insights are unrecoverable."""

    print(json.dumps({"decision": "block", "reason": message}))
    sys.exit(0)


if __name__ == "__main__":
    main()
