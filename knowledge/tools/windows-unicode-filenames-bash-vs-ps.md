---
type: knowledge
created: 2026-04-18
updated: 2026-04-18
tags: [windows, powershell, bash, unicode, gotcha, #gotcha]
---

# Windows Unicode Filenames: Bash vs PowerShell

**Bash `mv` mangles Unicode filenames** on Windows (via Git Bash / MSYS2). Characters like `→` (U+2192) and `'` (U+2019 curly apostrophe) get corrupted in the path string, causing "No such file or directory" even when the file clearly exists.

**PowerShell handles them correctly** — but only if you match the exact Unicode character in the string literal. Since curly quotes are easy to get wrong, use wildcard matching instead:

```powershell
# WRONG — straight apostrophe won't match curly apostrophe on disk
Rename-Item "See what's happening →.png" "new-name.png"

# RIGHT — wildcard sidesteps the character encoding problem
Get-ChildItem "C:\path\See*.png" | ForEach-Object {
    Rename-Item $_.FullName "new-name.png"
}
```

**Root cause**: Files created on Windows by apps (browsers, ad tools) often use typographic Unicode — curly quotes (`'` U+2019), arrows (`→` U+2192). Bash on Windows runs through a UTF-8/ANSI translation layer that breaks these. PowerShell uses .NET's Unicode-native file APIs and works correctly.

**Rule**: For any file rename involving special characters on Windows, use PowerShell `Rename-Item` with wildcard-based `Get-ChildItem` matching.

## Related

- [[powershell-utf8-string-parsing]] — PS 5.1 encoding gotcha; non-ASCII in scripts also causes silent failures
- [[powershell-match-array-vs-scalar]] — PS 5.1 `-match` array vs scalar behavior
