# start-game.ps1 — boots big skrbl + ngrok tunnel, prints the public link.
# Usage: right-click → Run with PowerShell, or:  .\start-game.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "  big skrbl — starting up..." -ForegroundColor Cyan

# 1. install deps if missing
if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "  Installing dependencies (first run only)..." -ForegroundColor DarkGray
    npm install | Out-Null
}

# 2. game server (own minimized window so you can see logs / close it)
Write-Host "  Launching game server on port 3000..." -ForegroundColor DarkGray
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $root -WindowStyle Minimized

Start-Sleep -Seconds 2

# 3. ngrok tunnel
Write-Host "  Launching ngrok tunnel..." -ForegroundColor DarkGray
Start-Process -FilePath "ngrok" -ArgumentList "http 3000" -WindowStyle Minimized

# 4. poll ngrok's local API for the public URL
$url = $null
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
        $t = $resp.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
        if ($t) { $url = $t.public_url; break }
    } catch {}
}

Write-Host ""
if ($url) {
    Write-Host "  ===================================================================" -ForegroundColor Green
    Write-Host "    GAME IS ONLINE" -ForegroundColor Green
    Write-Host ""
    Write-Host "    Share this link with everyone:" -ForegroundColor Green
    Write-Host "    $url" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    (link copied to your clipboard — paste it in the group chat)" -ForegroundColor DarkGray
    Write-Host "  ===================================================================" -ForegroundColor Green
    try { Set-Clipboard -Value $url } catch {}
} else {
    Write-Host "  Could not read the ngrok URL automatically." -ForegroundColor Red
    Write-Host "  Open http://localhost:4040 in your browser to see the link." -ForegroundColor Red
}

Write-Host ""
Write-Host "  To stop everything after the session, run:  .\stop-game.ps1" -ForegroundColor DarkGray
Write-Host ""
