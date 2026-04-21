---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [powershell, encoding, gotcha, windows]
---

# PowerShell 5.1: UTF-8 Multi-byte Characters Break String Parsing

## The Bug

PowerShell 5.1 (Windows PowerShell, not pwsh/7) reads script files as **Windows-1252** by default, not UTF-8. This causes silent, confusing parse failures when scripts contain non-ASCII characters.

## The Specific Failure Mode

The UTF-8 em-dash `—` (U+2014) encodes as bytes `E2 80 94`. In Windows-1252:
- `0x94` = RIGHT DOUBLE QUOTATION MARK (`"`)

So PowerShell reads `"...—..."` as `"..."` followed by `"..."` — the em-dash's last byte **closes the string**. Everything after it is unparsed, causing errors like:

```
The string is missing the terminator: ".
```

The error appears on a *later* line (wherever the next real `"` appears), making it very hard to trace back to the em-dash.

## Why It's Hard to Diagnose

- `Format-Hex` in PS 5.1 may show `3F 3F 3F` for the em-dash bytes in the ASCII column (non-ASCII → `?`), masking the actual bytes
- The Read tool may still render the em-dash as `—`, so the file looks correct in editors
- The parse error points to a completely different line

## Fix

**Never use non-ASCII characters in PowerShell 5.1 scripts.** Replace:
- Em-dash `—` → hyphen `-`  
- Smart quotes `"` `"` → straight quotes `"`
- Ellipsis `…` → `...`

Or save the script with explicit UTF-8 BOM encoding, which tells PS 5.1 to use UTF-8.

## Affected Characters (Windows-1252 byte collisions)

| UTF-8 bytes | Character | CP-1252 last byte reads as |
|-------------|-----------|---------------------------|
| `E2 80 94`  | em-dash — | `0x94` = `"` (breaks strings) |
| `E2 80 9C`  | left `"` | `0x9C` = `œ` (harmless) |
| `E2 80 9D`  | right `"` | `0x9D` = harmless |

## Discovered

Debugging `deploy-org-viewer.ps1` which had an em-dash in a `Write-Warning` string.

## Related

- [[powershell-match-array-vs-scalar]] — PS 5.1 `-match` behavior on arrays vs scalars
- [[windows-unicode-filenames-bash-vs-ps]] — Bash mangles Unicode filenames; PS handles them correctly
