---
type: knowledge
created: 2026-04-16
updated: 2026-04-16
tags: [claude-code, hooks, configuration]
---

# Stop Hook: Displaying Custom System Messages

To show arbitrary text to the user when Claude finishes a response, use a Stop hook that outputs JSON with a `systemMessage` field:

```json
{
  "type": "command",
  "command": "echo '{\"systemMessage\": \"your text here\"}'"
}
```

**Unicode / non-ASCII characters** must be escaped as `\uXXXX` sequences inside the JSON string, since the shell `echo` approach doesn't handle raw multibyte chars reliably:

```json
"command": "echo '{\"systemMessage\": \"\\u30fd\\u254c\\u0cbe\\u0644\\u035c\\u0cbe\\u254c\\uff89\"}'"
```

That renders as: `ヽ༼ຈل͜ຈ༽ﾉ`

**Multiple Stop hooks** coexist fine — add to the existing `hooks` array in the same hook group. Each hook's stdout is parsed independently.
