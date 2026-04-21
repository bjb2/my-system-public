---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [claude-code, hooks, configuration]
---

# Claude Code Hook Output Schema

Hook scripts write JSON to stdout. Wrong field names cause "Hook JSON output validation failed" errors.

## Stop Hook

```json
{ "continue": true }
```
to allow stop (boolean field — NOT `"decision": "continue"`, which is invalid).

```json
{ "decision": "block", "reason": "message shown to Claude" }
```
to block and prompt Claude with a message.

`decision` only accepts `"approve"` or `"block"`. There is no `"continue"` value for `decision`.

**Silent exit (no stdout) also causes a JSON parse error.** Always print valid JSON on every code path.

## Full Schema Reference

| Field | Type | Notes |
|-------|------|-------|
| `continue` | boolean | Allow stop/action |
| `suppressOutput` | boolean | Hide output |
| `stopReason` | string | |
| `decision` | `"approve" \| "block"` | |
| `reason` | string | Shown to Claude when blocking |
| `systemMessage` | string | Shown to user |
| `permissionDecision` | `"allow" \| "deny" \| "ask"` | |

## hookSpecificOutput

Only valid for `PreToolUse`, `UserPromptSubmit`, and `PostToolUse` — **not Stop**.

| Hook | Required fields |
|------|----------------|
| `PreToolUse` | `hookEventName: "PreToolUse"` |
| `UserPromptSubmit` | `hookEventName: "UserPromptSubmit"`, `additionalContext: string` |
| `PostToolUse` | `hookEventName: "PostToolUse"` |

## Related

- [[stop-hook-system-message]]
- [[maintenance-hook-design]] — patterns for building effective stop-hook maintenance prompts
