# Installs repo-local git hooks from .githooks/
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

git config core.hooksPath .githooks
Write-Host "Git hooks installed (core.hooksPath = .githooks)"
Write-Host "Pre-commit will run: bun scripts/check-secrets.ts --staged"
