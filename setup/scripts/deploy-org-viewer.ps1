# Deploy a new org-viewer build to the org root.
# Usage: .\deploy-org-viewer.ps1 [-SkipQA]
# Expects: org-viewer-dev/src-tauri/target/release/org-viewer.exe (relative to org root)

param(
    [switch]$SkipQA
)

$orgRoot   = Split-Path $PSScriptRoot -Parent | Split-Path -Parent
$devRoot   = Join-Path (Split-Path $orgRoot -Parent) "org-viewer-dev"
$buildSrc  = Join-Path $devRoot "src-tauri\target\release\org-viewer.exe"
$stableDst = Join-Path $orgRoot "org-viewer.exe"
$prevDst   = Join-Path $orgRoot "org-viewer-prev.exe"

if (-not (Test-Path $buildSrc)) {
    Write-Error "Build not found: $buildSrc"
    exit 1
}

# --- QA Hard Gate ---
if (-not $SkipQA) {
    Write-Host ""
    Write-Host "=== QA CHECK ===" -ForegroundColor Cyan

    # Static checks
    Write-Host "Running tsc --noEmit..." -ForegroundColor Yellow
    $tscResult = & npx tsc --noEmit --project (Join-Path $devRoot "tsconfig.json") 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "TSC FAILED:" -ForegroundColor Red
        $tscResult | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Write-Error "Deploy blocked: TypeScript errors. Fix tsc errors and rebuild before deploying."
        exit 1
    }
    Write-Host "tsc: PASS" -ForegroundColor Green

    Write-Host "Running cargo check..." -ForegroundColor Yellow
    $cargoResult = & cargo check --manifest-path (Join-Path $devRoot "src-tauri\Cargo.toml") 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CARGO CHECK FAILED:" -ForegroundColor Red
        $cargoResult | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Write-Error "Deploy blocked: Rust errors. Fix cargo errors and rebuild before deploying."
        exit 1
    }
    Write-Host "cargo check: PASS" -ForegroundColor Green

    # Build freshness check
    Write-Host "Checking build freshness..." -ForegroundColor Yellow
    $exeTime = (Get-Item $buildSrc).LastWriteTime
    $srcFiles = Get-ChildItem -Path $devRoot -Recurse -Include "*.ts","*.tsx","*.rs" |
        Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.FullName -notmatch "\\target\\" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($srcFiles -and $srcFiles.LastWriteTime -gt $exeTime) {
        $staleSecs = [int]($srcFiles.LastWriteTime - $exeTime).TotalSeconds
        Write-Host "STALE BUILD: $($srcFiles.Name) modified $staleSecs seconds after exe was built." -ForegroundColor Red
        Write-Host "  Source: $($srcFiles.LastWriteTime)  Exe: $exeTime" -ForegroundColor Red
        Write-Error "Deploy blocked: Build is stale. Run 'npm run tauri build' before deploying."
        exit 1
    }
    Write-Host "Build freshness: FRESH" -ForegroundColor Green

    # Manual verification confirmation
    Write-Host ""
    Write-Host "Static checks passed. Have you manually verified the feature works at runtime?" -ForegroundColor Cyan
    Write-Host "(Run the qa-reviewer agent for a checklist if needed)" -ForegroundColor DarkCyan
    Write-Host ""
    $confirm = Read-Host "Did QA pass? (y/n)"
    if ($confirm -ne "y") {
        Write-Host "Deploy cancelled. Fix the issues and re-run when QA passes." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "QA confirmed. Deploying..." -ForegroundColor Green
    Write-Host ""
}

# Rotate any existing prev out of the way using a timestamped name (avoids lock issues)
if (Test-Path $prevDst) {
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $archiveName = "org-viewer-old-$ts.exe"
    Write-Host "Archiving: org-viewer-prev.exe -> $archiveName"
    Rename-Item -Path $prevDst -NewName $archiveName -ErrorAction SilentlyContinue
    if (Test-Path $prevDst) {
        Write-Warning "Could not archive org-viewer-prev.exe - it may be in use. Continuing anyway."
        Remove-Item $prevDst -Force -ErrorAction SilentlyContinue
    }
}

# Rename current stable -> prev (Windows allows rename of running exe)
if (Test-Path $stableDst) {
    Write-Host "Rotating: org-viewer.exe -> org-viewer-prev.exe"
    Rename-Item -Path $stableDst -NewName "org-viewer-prev.exe" -ErrorAction Stop
}

# Copy new build into stable slot
Write-Host "Deploying new build -> org-viewer.exe"
Copy-Item $buildSrc $stableDst -ErrorAction Stop

Write-Host "Done. Restart org-viewer.exe to use the new build."
Write-Host "Rollback: rename org-viewer-prev.exe to org-viewer.exe"
