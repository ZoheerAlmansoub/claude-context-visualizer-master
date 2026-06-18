# Agent Context Visualizer — local dev launcher (Windows)
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

function Resolve-Bun {
    $globalBun = Get-Command bun -ErrorAction SilentlyContinue
    if ($globalBun) { return $globalBun.Source }

    $localBun = Join-Path $Root "node_modules\.bin\bun.cmd"
    if (Test-Path $localBun) { return $localBun }

    throw "Bun not found. Run: npm install"
}

function Ensure-Dependencies {
    if (-not (Test-Path (Join-Path $Root "node_modules"))) {
        Write-Host "Installing backend dependencies..."
        npm install --package-lock=false
    }
    if (-not (Test-Path (Join-Path $Root "web\node_modules"))) {
        Write-Host "Installing frontend dependencies..."
        Push-Location (Join-Path $Root "web")
        npm install --package-lock=false
        Pop-Location
    }
}

function Stop-PortListener([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $conn) { return }
    $procId = $conn.OwningProcess
    if ($procId -and $procId -ne 0) {
        Write-Host "Stopping process on port $Port (PID $procId)..."
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

Ensure-Dependencies
$bun = Resolve-Bun

Stop-PortListener 5174
Stop-PortListener 5173

Write-Host "Starting API on http://localhost:5174 ..."
$serverJob = Start-Job -ScriptBlock {
    param($BunPath, $WorkDir)
    Set-Location $WorkDir
    & $BunPath server/index.ts 2>&1
} -ArgumentList $bun, $Root

Write-Host "Starting web UI on http://localhost:5173 ..."
$webJob = Start-Job -ScriptBlock {
    param($WorkDir)
    Set-Location (Join-Path $WorkDir "web")
    npm run dev 2>&1
} -ArgumentList $Root

$deadline = (Get-Date).AddSeconds(45)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $health = Invoke-WebRequest -Uri "http://localhost:5174/api/health" -UseBasicParsing -TimeoutSec 2
        if ($health.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Write-Host "Server output:"
    Receive-Job $serverJob -Keep | Select-Object -Last 20
    Write-Host "Web output:"
    Receive-Job $webJob -Keep | Select-Object -Last 20
    throw "Backend did not become ready on port 5174."
}

Start-Process "http://localhost:5173"
Write-Host ""
Write-Host "Agent Context Visualizer is running."
Write-Host "  UI:  http://localhost:5173"
Write-Host "  API: http://localhost:5174"
Write-Host ""
Write-Host "Press Ctrl+C to stop."

try {
    while ($true) {
        if ((Get-Job -Id $serverJob.Id).State -eq "Failed") {
            Receive-Job $serverJob
            throw "API server stopped unexpectedly."
        }
        if ((Get-Job -Id $webJob.Id).State -eq "Failed") {
            Receive-Job $webJob
            throw "Web dev server stopped unexpectedly."
        }
        Start-Sleep -Seconds 2
    }
} finally {
    Stop-Job $serverJob, $webJob -ErrorAction SilentlyContinue
    Remove-Job $serverJob, $webJob -Force -ErrorAction SilentlyContinue
    Stop-PortListener 5174
    Stop-PortListener 5173
}
