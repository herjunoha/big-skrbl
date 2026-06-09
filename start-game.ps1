# start-game.ps1 — boots big skrbl + Cloudflare Tunnel, prints the public link.
# Usage: right-click → Run with PowerShell, or:  .\start-game.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "  big skrbl — starting up..." -ForegroundColor Cyan

# --- resolve cloudflared (bundled binary in this folder, then PATH) ---
$cf = $null
$local = Join-Path $root "cloudflared.exe"
if (Test-Path $local) { $cf = $local }
if (-not $cf) { $cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source }
if (-not $cf) {
    Write-Host "  cloudflared.exe not found in this folder." -ForegroundColor Red
    Write-Host "  Download it once with:" -ForegroundColor Red
    Write-Host '    Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile .\cloudflared.exe' -ForegroundColor Yellow
    return
}

# 1. install npm deps if missing
if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "  Installing dependencies (first run only)..." -ForegroundColor DarkGray
    npm install | Out-Null
}

# 2. game server (own minimized window)
Write-Host "  Launching game server on port 3000..." -ForegroundColor DarkGray
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $root -WindowStyle Minimized
Start-Sleep -Seconds 2

# 3. Cloudflare quick tunnel — capture its output to scan for the public URL
$log = Join-Path $env:TEMP "big-skrbl-cloudflared.log"
$errLog = Join-Path $env:TEMP "big-skrbl-cloudflared.err.log"
Remove-Item $log, $errLog -ErrorAction SilentlyContinue
Write-Host "  Launching Cloudflare tunnel..." -ForegroundColor DarkGray
Start-Process -FilePath $cf `
    -ArgumentList "tunnel", "--url", "http://localhost:3000" `
    -WindowStyle Minimized `
    -RedirectStandardOutput $log -RedirectStandardError $errLog

# 4. poll the logs for the trycloudflare.com URL
$url = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $text = ""
    if (Test-Path $log)    { $text += Get-Content $log -Raw -ErrorAction SilentlyContinue }
    if (Test-Path $errLog) { $text += Get-Content $errLog -Raw -ErrorAction SilentlyContinue }
    $m = [regex]::Match($text, "https://[a-z0-9-]+\.trycloudflare\.com")
    if ($m.Success) { $url = $m.Value; break }
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
    Write-Host "  Could not read the tunnel URL automatically." -ForegroundColor Red
    Write-Host "  Check the tunnel log for a *.trycloudflare.com line:" -ForegroundColor Red
    Write-Host "    $errLog" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  To stop everything after the session, run:  .\stop-game.ps1" -ForegroundColor DarkGray
Write-Host ""
