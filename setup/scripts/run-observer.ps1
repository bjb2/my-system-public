#Requires -Version 5.1
<#
.SYNOPSIS
    Observer Dream Cycle — delta-gated active maintenance agent.
    Reads last-run state, scans for changes, plans actions via Opus, executes via Sonnet.
    Designed to be registered as a Windows scheduled task.
.NOTES
    Logs to setup/logs/observer-YYYY-MM-DD.log
    Run manually: .\setup\scripts\run-observer.ps1
    Register: see schtasks command at bottom of this file
#>

$ORG_DIR      = if ($env:ORG_ROOT) { $env:ORG_ROOT } else { Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
$LOG_DIR      = "$ORG_DIR\setup\logs"
$OBSERVER_DIR = "$ORG_DIR\setup\observer"
$RECIPES_DIR  = "$ORG_DIR\setup\recipes"
$PLAN_FILE    = "$OBSERVER_DIR\plan.json"
$LAST_RUN_FILE = "$OBSERVER_DIR\last-run.json"
$LOG_FILE     = "$LOG_DIR\observer-$(Get-Date -Format 'yyyy-MM-dd').log"
$TODAY        = Get-Date -Format 'yyyy-MM-dd'
$NOW          = Get-Date
$DAILY_BUDGET = 8
$COOLDOWN_HOURS = 2

foreach ($dir in @($LOG_DIR, $OBSERVER_DIR)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

function Write-Log {
    param([string]$Message)
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $Message"
    Write-Host $line
    Add-Content -Path $LOG_FILE -Value $line -Encoding utf8
}

Write-Log "=== Observer cycle starting ==="

# Verify claude CLI
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Log "ERROR: claude CLI not found. Ensure Claude Code is installed."
    exit 1
}

# Load last-run state
$lastRun = if (Test-Path $LAST_RUN_FILE) {
    Get-Content $LAST_RUN_FILE -Raw | ConvertFrom-Json
} else {
    [PSCustomObject]@{
        lastRunTime  = (Get-Date).AddDays(-2).ToString('o')
        lastGitHash  = ""
        actionsToday = 0
        actionsDate  = ""
    }
}

# Cooldown check
$lastRunTime = [datetime]::Parse($lastRun.lastRunTime)
$elapsedHours = ($NOW - $lastRunTime).TotalHours
if ($elapsedHours -lt $COOLDOWN_HOURS) {
    Write-Log "Cooldown active: last run was $([math]::Round($elapsedHours, 1))h ago (min ${COOLDOWN_HOURS}h). Exiting."
    exit 0
}

# Budget check
$actionsToday = if ($lastRun.actionsDate -eq $TODAY) { [int]$lastRun.actionsToday } else { 0 }
if ($actionsToday -ge $DAILY_BUDGET) {
    Write-Log "Daily budget exhausted: $actionsToday/$DAILY_BUDGET actions used. Exiting."
    exit 0
}

$remainingBudget = $DAILY_BUDGET - $actionsToday
Write-Log "Budget: $actionsToday/$DAILY_BUDGET used, $remainingBudget remaining"

# Delta scan
Set-Location $ORG_DIR
$currentGitHash = (git rev-parse HEAD 2>$null) -replace '\s', ''
$inboxLatest = Get-ChildItem "$ORG_DIR\inbox" -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
$tasksLatest = Get-ChildItem "$ORG_DIR\tasks" -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

$hasGitDelta   = $currentGitHash -and ($currentGitHash -ne $lastRun.lastGitHash)
$hasInboxDelta = $inboxLatest -and ($inboxLatest.LastWriteTime -gt $lastRunTime)
$hasTasksDelta = $tasksLatest -and ($tasksLatest.LastWriteTime -gt $lastRunTime)
$hasDelta      = $hasGitDelta -or $hasInboxDelta -or $hasTasksDelta
$isDailyCatchAll = $elapsedHours -ge 24

Write-Log "Delta scan: git=$hasGitDelta inbox=$hasInboxDelta tasks=$hasTasksDelta | catchall=$isDailyCatchAll"

# Planning pass — Opus decides action list
$planningPrompt = @"
Observer planning pass - $TODAY $(Get-Date -Format 'HH:mm')

Delta since last run ($([math]::Round($elapsedHours,1))h ago):
- Git changes: $hasGitDelta (prev: $($lastRun.lastGitHash) -> now: $currentGitHash)
- New inbox items: $hasInboxDelta
- Task changes: $hasTasksDelta
- Meaningful delta: $hasDelta
- 24hr catch-all: $isDailyCatchAll
- Budget remaining: $remainingBudget/$DAILY_BUDGET actions

HEAVY RECIPES (run only if hasDelta=True OR isDailyCatchAll=True):
- knowledge-gap-scan: scan completed tasks past 7d for missing KB articles, write drafts
- knowledge-consolidation: find and merge near-duplicate KB articles
- inbox-triage: process inbox items older than 7 days
- project-health: audit active tasks for stale/blocked/shadow-completed
- orphan-scan: find KB articles with 0 inbound links, propose cross-links

LIGHT ACTIONS (always eligible):
- inbox-age-report: list inbox items by age tier (fast, read-only output)
- completed-task-harvest: flag recently completed tasks needing KB articles (fast)
- frontmatter-lint: find files missing required frontmatter fields (fast)
- kb-link-density: tag KB orphans with a comment (fast, additive only)
- kb-readme-reconcile: check knowledge subfolder README counts (fast)

RULES:
- Always include at minimum: ["inbox-age-report", "completed-task-harvest"]
- Include heavy recipes only if hasDelta=True OR isDailyCatchAll=True
- Prioritize heavy recipes: knowledge-gap-scan > inbox-triage > project-health > orphan-scan > knowledge-consolidation
- Never exceed remaining budget of $remainingBudget actions
- If budget is 1-2, only run light actions

Output ONLY a valid JSON array of quoted action names, nothing else.
Example: ["inbox-age-report","completed-task-harvest","knowledge-gap-scan"]
"@

Write-Log "Planning pass (Opus)..."
$planOutput = claude --print --model claude-opus-4-7 $planningPrompt 2>&1
Write-Log "Plan output: $planOutput"

# Parse plan — join array output to scalar, extract [...] block, parse JSON
$plan = @("inbox-age-report", "completed-task-harvest")
$planText = if ($planOutput -is [array]) { ($planOutput | Where-Object { $_ -is [string] }) -join "`n" } else { "$planOutput" }
if ($planText -match '(\[[^\]]+\])') {
    $extracted = $Matches[1]
    try {
        # Direct parse first (Opus returns valid JSON)
        $parsed = $extracted | ConvertFrom-Json
        if ($parsed -is [array] -and $parsed.Count -gt 0) {
            $plan = $parsed
            Write-Log "Plan parsed: $($plan -join ', ')"
        }
    } catch {
        try {
            # Fallback: quote bare tokens between [ , ]
            $normalized = $extracted -replace '(?<=[\[,]\s*)([a-z][\w-]*)(?=\s*[,\]])', '"$1"'
            $parsed = $normalized | ConvertFrom-Json
            if ($parsed -is [array] -and $parsed.Count -gt 0) {
                $plan = $parsed
                Write-Log "Plan parsed (normalized): $($plan -join ', ')"
            }
        } catch {
            Write-Log "Plan parse error, using defaults: $($plan -join ', ')"
        }
    }
}

# Persist plan
$plan | ConvertTo-Json | Set-Content $PLAN_FILE -Encoding utf8

# Execute actions
$actionsRun = 0
foreach ($action in $plan) {
    if ($actionsToday + $actionsRun -ge $DAILY_BUDGET) {
        Write-Log "Budget exhausted mid-cycle. Stopping."
        break
    }

    # Resolve recipe path (check heavy first, then light/)
    $recipePath = "$RECIPES_DIR\$action.md"
    if (-not (Test-Path $recipePath)) {
        $recipePath = "$RECIPES_DIR\light\$action.md"
    }
    if (-not (Test-Path $recipePath)) {
        Write-Log "Recipe not found for action '$action'. Skipping."
        continue
    }

    $recipePrompt = Get-Content $recipePath -Raw -Encoding utf8
    Write-Log "--- Action: $action ---"

    $result = claude --print --model claude-sonnet-4-6 $recipePrompt 2>&1
    $result | Add-Content -Path $LOG_FILE -Encoding utf8
    Write-Log "Action '$action' complete."
    $actionsRun++
}

# Update last-run state
$newState = [PSCustomObject]@{
    lastRunTime  = $NOW.ToString('o')
    lastGitHash  = $currentGitHash
    actionsToday = $actionsToday + $actionsRun
    actionsDate  = $TODAY
}
$newState | ConvertTo-Json | Set-Content $LAST_RUN_FILE -Encoding utf8

Write-Log "=== Cycle complete: $actionsRun actions run ($($actionsToday + $actionsRun)/$DAILY_BUDGET today) ==="

<#
--- REGISTRATION COMMAND ---

Run once (as your user account, no elevation needed):

schtasks /Create /TN "ClaudeOrg\ObserverAgent" /TR "powershell.exe -NonInteractive -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-observer.ps1`"" /SC DAILY /ST 09:00 /F

To verify:   schtasks /Query /TN "ClaudeOrg\ObserverAgent" /V /FO LIST
To run now:  schtasks /Run /TN "ClaudeOrg\ObserverAgent"
To remove:   schtasks /Delete /TN "ClaudeOrg\ObserverAgent" /F
#>
