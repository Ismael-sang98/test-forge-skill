<#
.SYNOPSIS
    TestForge — Universal Global Installer for Windows (PowerShell)
    Supports: Google Antigravity (Full Plugin + 4 Hooks + Rules + Subagents),
              Claude Code, OpenAI Codex, Cursor, Windsurf, and Universal ~/.agents/skills
.PARAMETER Uninstall
    Removes TestForge global installations.
#>
param(
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PluginName = "test-forge"
$Skills = @(
    "test-auto",
    "test-security",
    "test-functional",
    "test-performance",
    "test-smoke-sanity",
    "test-parity",
    "test-resilience"
)
$Agents = @("test-red-team.md", "test-qa-runner.md")
$UserHome = [Environment]::GetFolderPath("UserProfile")

function Install-SkillsInto {
    param([string]$TargetDir, [string]$Label)
    if (-not (Test-Path $TargetDir)) {
        New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    }
    foreach ($skill in $Skills) {
        $dest = Join-Path $TargetDir $skill
        if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        Copy-Item -Recurse -Force (Join-Path $ScriptDir "skills\$skill") $dest
    }
    Write-Host "  [OK] Installed $($Skills.Count) TestForge skills for $Label -> $TargetDir" -ForegroundColor Green
}

function Install-AgentsInto {
    param([string]$TargetDir, [string]$Label)
    if (-not (Test-Path $TargetDir)) {
        New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    }
    foreach ($agent in $Agents) {
        Copy-Item -Force (Join-Path $ScriptDir "agents\$agent") (Join-Path $TargetDir $agent)
    }
    Write-Host "  [OK] Installed $($Agents.Count) TestForge subagents for $Label -> $TargetDir" -ForegroundColor Green
}

function Install-ScriptsInto {
    param([string]$TargetDir)
    if (-not (Test-Path $TargetDir)) {
        New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
    }
    $dest = Join-Path $TargetDir "scripts"
    if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
    Copy-Item -Recurse -Force (Join-Path $ScriptDir "scripts") $dest
}

function Uninstall-SkillsFrom {
    param([string]$TargetDir, [string]$Label)
    if (Test-Path $TargetDir) {
        foreach ($skill in $Skills) {
            $dest = Join-Path $TargetDir $skill
            if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
        }
        Write-Host "  [OK] Removed TestForge skills from $Label ($TargetDir)" -ForegroundColor Yellow
    }
}

function Uninstall-AgentsFrom {
    param([string]$TargetDir, [string]$Label)
    if (Test-Path $TargetDir) {
        foreach ($agent in $Agents) {
            $dest = Join-Path $TargetDir $agent
            if (Test-Path $dest) { Remove-Item -Force $dest }
        }
        Write-Host "  [OK] Removed TestForge subagents from $Label ($TargetDir)" -ForegroundColor Yellow
    }
}

$AgyPluginDir = Join-Path $UserHome ".gemini\config\plugins\$PluginName"

if ($Uninstall) {
    Write-Host "Uninstalling $PluginName..." -ForegroundColor Cyan
    if (Get-Command agy -ErrorAction SilentlyContinue) {
        try { agy plugin uninstall $PluginName | Out-Null } catch {}
    }
    if (Test-Path $AgyPluginDir) {
        Remove-Item -Recurse -Force $AgyPluginDir
    }
    Write-Host "  [OK] Removed Antigravity global plugin ($AgyPluginDir)" -ForegroundColor Yellow

    Uninstall-SkillsFrom (Join-Path $UserHome ".claude\skills") "Claude Code"
    Uninstall-AgentsFrom (Join-Path $UserHome ".claude\agents") "Claude Code"
    $claudeData = Join-Path $UserHome ".claude\$PluginName"
    if (Test-Path $claudeData) { Remove-Item -Recurse -Force $claudeData }

    Uninstall-SkillsFrom (Join-Path $UserHome ".codex\skills") "OpenAI Codex"
    Uninstall-SkillsFrom (Join-Path $UserHome ".cursor\skills") "Cursor"
    Uninstall-SkillsFrom (Join-Path $UserHome ".codeium\windsurf\skills") "Windsurf"
    Uninstall-SkillsFrom (Join-Path $UserHome ".agents\skills") "Universal Agent Skills"
    $agentsData = Join-Path $UserHome ".agents\$PluginName"
    if (Test-Path $agentsData) { Remove-Item -Recurse -Force $agentsData }

    Write-Host "Done! Restart your AI IDE / CLI to complete removal." -ForegroundColor Cyan
    exit 0
}

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  TestForge v1.0.0 — Autonomous QA & Security Testing Installer" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

$InstalledViaCli = $false
if (Get-Command agy -ErrorAction SilentlyContinue) {
    try {
        agy plugin install $ScriptDir | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $InstalledViaCli = $true
            Write-Host "  [OK] Installed full Antigravity plugin via 'agy plugin install'" -ForegroundColor Green
        }
    } catch {}
}

if (-not $InstalledViaCli) {
    if (Test-Path $AgyPluginDir) { Remove-Item -Recurse -Force $AgyPluginDir }
    New-Item -ItemType Directory -Force -Path $AgyPluginDir | Out-Null
    foreach ($item in @("plugin.json", "hooks.json", "assets", "rules", "agents", "scripts", "skills", "README.md")) {
        Copy-Item -Recurse -Force (Join-Path $ScriptDir $item) (Join-Path $AgyPluginDir $item)
    }
    Write-Host "  [OK] Installed full Antigravity plugin -> $AgyPluginDir" -ForegroundColor Green
}

Install-SkillsInto (Join-Path $UserHome ".agents\skills") "Universal Agent Skills (Codex/CLI)"
Install-ScriptsInto (Join-Path $UserHome ".agents\$PluginName")

if (Test-Path (Join-Path $UserHome ".claude")) {
    Install-SkillsInto (Join-Path $UserHome ".claude\skills") "Claude Code"
    Install-AgentsInto (Join-Path $UserHome ".claude\agents") "Claude Code"
    Install-ScriptsInto (Join-Path $UserHome ".claude\$PluginName")
}
if (Test-Path (Join-Path $UserHome ".codex")) {
    Install-SkillsInto (Join-Path $UserHome ".codex\skills") "OpenAI Codex"
}
if (Test-Path (Join-Path $UserHome ".cursor")) {
    Install-SkillsInto (Join-Path $UserHome ".cursor\skills") "Cursor"
}
if (Test-Path (Join-Path $UserHome ".codeium\windsurf")) {
    Install-SkillsInto (Join-Path $UserHome ".codeium\windsurf\skills") "Windsurf"
}

Write-Host ""
Write-Host "TestForge v1.0.0 is installed globally!" -ForegroundColor Green
Write-Host "-> Restart Antigravity / your AI IDE so the plugin, hooks, subagents, and skills load."
Write-Host "-> Standalone & 100% conflict-free with SpecForge (works with or without SpecForge)."
Write-Host "-> Try in any project: 'Use test-auto to test and audit my project'"
