---
type: knowledge
created: 2026-04-20
updated: 2026-04-20
tags: [powershell, #gotcha, automation]
---

# PowerShell: `-match` on Array vs Scalar

## The Gotcha

In PowerShell 5.1, `-match` behaves differently on arrays vs scalars:

- **Scalar**: `$str -match 'pattern'` → returns `$true`/`$false`, populates `$Matches`
- **Array**: `$arr -match 'pattern'` → returns filtered array of matching elements, `$Matches` is NOT reliably populated

When `claude --print ... 2>&1` captures output, it returns an **array of objects** (strings + ErrorRecord), not a single string. Using `-match` directly on that result won't populate `$Matches`.

## Fix

Join to a scalar string first before matching:

```powershell
$rawOutput = claude --print ... 2>&1
$text = if ($rawOutput -is [array]) {
    ($rawOutput | Where-Object { $_ -is [string] }) -join "`n"
} else { "$rawOutput" }

if ($text -match '(\[[^\]]+\])') {
    $extracted = $Matches[1]  # now reliably populated
}
```

## Related: Regex Normalization on Structured Strings

Don't apply a "quote unquoted words" regex to already-structured strings — subword matches corrupt the output. Example: `(?<!")([a-z][\w-]+)(?!")` on `"inbox-age-report"` matches `age` and `report` as subwords.

Safe normalization targets only token boundaries:

```powershell
# Only quotes tokens immediately after [ or ,
$normalized = $extracted -replace '(?<=[\[,]\s*)([a-z][\w-]*)(?=\s*[,\]])', '"$1"'
```

Better: try direct `ConvertFrom-Json` first, normalize only on catch.

## Applied In

- `setup/scripts/run-observer.ps1` — plan JSON parse (2026-04-20)

## Related

- \[\[powershell-utf8-string-parsing\]\] — PS 5.1 encoding gotcha that also corrupts string handling
- \[\[windows-unicode-filenames-bash-vs-ps\]\] — Bash mangles Unicode filenames; use PS for file ops