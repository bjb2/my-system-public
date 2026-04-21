---
type: knowledge
created: 2026-04-19
updated: 2026-04-19
tags: [security, devops, powershell, sovereignty]
---

# PowerShell SecretManagement: Local Secrets Injection Pattern

## The Pattern

One central vault outside all project repos. Projects declare secret *names*, never values. Secrets flow: vault → env var → process at runtime. Nothing touches disk, shell history, or git.

## Setup

```powershell
Install-Module Microsoft.PowerShell.SecretManagement -Scope CurrentUser
Install-Module Microsoft.PowerShell.SecretStore -Scope CurrentUser

# Register vault with master password (DPAPI + password = two factors)
Register-SecretVault -Name "dev-vault" -ModuleName Microsoft.PowerShell.SecretStore -DefaultVault
Set-SecretStoreConfiguration -Authentication Password -Interaction Prompt -Scope CurrentUser

# Store a secret (only time you type the value)
Unlock-SecretStore -Password (Read-Host -AsSecureString "Vault password")
Set-Secret -Name "ANTHROPIC_API_KEY" -Secret "sk-ant-..."
```

## vault.psm1 (place at `~/.vault/vault.psm1`)

```powershell
function Unlock-Vault {
    Unlock-SecretStore -Password (Read-Host -AsSecureString "Vault password")
}

# Inject named secrets into current session env vars
function Set-SessionSecrets {
    param([Parameter(Mandatory)][string[]]$SecretNames)
    foreach ($name in $SecretNames) {
        Set-Item -Path "env:$name" -Value (Get-Secret -Name $name -Vault "dev-vault" -AsPlainText)
    }
    Write-Host "Injected: $($SecretNames -join ', ')" -ForegroundColor DarkGray
}

# Inject secrets for a single command only, then clean up
function Invoke-WithSecrets {
    param(
        [Parameter(Mandatory)][string[]]$SecretNames,
        [Parameter(Mandatory)][scriptblock]$Command
    )
    $saved = @{}
    try {
        foreach ($name in $SecretNames) {
            $saved[$name] = [System.Environment]::GetEnvironmentVariable($name)
            [System.Environment]::SetEnvironmentVariable($name, (Get-Secret -Name $name -Vault "dev-vault" -AsPlainText))
        }
        & $Command
    } finally {
        foreach ($name in $SecretNames) {
            [System.Environment]::SetEnvironmentVariable($name, $saved[$name])
        }
    }
}

Export-ModuleMember -Function Unlock-Vault, Set-SessionSecrets, Invoke-WithSecrets
```

Add `Import-Module $HOME\.vault\vault.psm1` to `$PROFILE`.

## Usage

```powershell
# Before a dev server or claude session
Unlock-Vault
Set-SessionSecrets -SecretNames @("ANTHROPIC_API_KEY", "TODOIST_API_TOKEN")
npm run dev   # or: claude

# One-shot script
Invoke-WithSecrets -SecretNames @("TIME_KEY") -Command { python script.py }
```

## .env convention (safe to commit)

```
# .env — commit this
VITE_SUPABASE_URL=https://yourproject.supabase.co
# Secret keys injected at runtime — never stored here
```

## #gotcha — vault needs unlock per session

SecretStore requires `Unlock-SecretStore` (or `Unlock-Vault`) once per PS session when configured with `-Authentication Password`. If you get "vault is locked" errors, run `Unlock-Vault` first.

## #gotcha — rotation is in-place

`Set-Secret -Name "KEY" -Secret "new-value"` overwrites. No other files change. This is by design — the name is stable, only the encrypted value changes.

## Threat model coverage

| Threat | Status |
|--------|--------|
| Secret in git | Prevented — values never in project files |
| Secret in shell history | Prevented — always read from vault, never typed |
| Secret in .env in repo | Prevented — .env only has non-secret config |
| Vault breach | Mitigated — DPAPI + master password, rotation discipline |

<!-- orphan: 0 inbound links as of 2026-04-20 -->
