---
type: knowledge
created: 2026-04-19
updated: 2026-04-20
tags: [security, devops, sovereignty, powershell]
---

# PowerShell SecretManagement Vault

Local secrets vault using DPAPI + master password. No cloud, no external dependencies.

## Setup (one-time)

```powershell
Install-Module Microsoft.PowerShell.SecretManagement -Scope CurrentUser
Install-Module Microsoft.PowerShell.SecretStore -Scope CurrentUser

Register-SecretVault -Name "dev-vault" -ModuleName Microsoft.PowerShell.SecretStore -DefaultVault
Set-SecretStoreConfiguration -Authentication Password -Interaction Prompt -Scope CurrentUser
```

Vault blob stored at `~\AppData\Local\Microsoft\PowerShell\secretmanagement\`.

## Injection module

`~/.vault/vault.psm1` — import in PS profile:

```powershell
Import-Module $HOME\.vault\vault.psm1
```

Key functions:
- `Unlock-Vault` — unlock once per session
- `Set-SessionSecrets @("KEY_NAME")` — inject into current session env
- `Invoke-WithSecrets @("KEY_NAME") { command }` — inject for one command, then clean up
- `Get-VaultSecretPlain "KEY_NAME"` — get plaintext value

## Never use `cat` / `Read` to verify secret-containing files

When verifying an `.env` file was written correctly, check existence and line count only — never print contents:
```powershell
(Get-Item C:\path\.env).Length   # file size
(Get-Content C:\path\.env).Count # line count
```
Using `cat` or Python `print(repr(...))` on a secrets file exposes values in conversation history.

## PS 5.1 gotcha — Get-Secret returns SecureString

`Get-Secret -AsPlainText` is **PowerShell 7+ only**. In PS 5.1 (Windows PowerShell), `Get-Secret` returns a `SecureString`. Use `Get-VaultSecretPlain` from `vault.psm1` instead — it handles the conversion internally.

If you need raw conversion without the module:
```powershell
$ss = Get-Secret -Name MY_KEY
$plain = [System.Net.NetworkCredential]::new('', $ss).Password
```

**Correct pattern for writing an .env from vault:**
```powershell
Unlock-Vault
$pw = Get-VaultSecretPlain "MY_KEY"
"VAR=$pw" | Out-File -Encoding utf8 path\to\.env
```

## Common workflows

**Dev server (Node.js/Vite):**
```powershell
Unlock-Vault
Set-SessionSecrets -SecretNames @("ANTHROPIC_API_KEY", "SUPABASE_SERVICE_KEY")
npm run dev
```

**Tauri dev:**
```powershell
Set-SessionSecrets -SecretNames @("ANTHROPIC_API_KEY")
npm run tauri dev
```

**One-shot script:**
```powershell
Invoke-WithSecrets -SecretNames @("TIME_KEY") -Command { python script.py }
```

**Rotate a key:**
```powershell
Set-Secret -Name "KEY_NAME" -Secret "new-value"
# Update rotation date in ~/.vault/secrets.catalog.md
```

## Architecture rule

Secret *values* live exactly one place — inside SecretStore's encrypted blob. Projects declare only secret *names*. `.env` files contain only non-secret config.

## .gitignore additions (all projects)

```
.env.local
.env.*.local
load-secrets.ps1
secrets.json
*.key
*.secret
```

## Catalog

Names tracked (no values) at `~/.vault/secrets.catalog.md`.

## When is ANTHROPIC_API_KEY actually needed?

Not for Claude Code (handles its own auth) or org-viewer (uses `claude --print` subprocess). You need it when:
- Building deployed server-side tools that call the Anthropic SDK directly
- CI/CD pipelines running Claude-powered scripts
- Client-facing AI consulting tools
- Any context where `claude --print` isn't available

## See also

Full architecture: `inbox/decisions/local-secrets-management-platform.md`
