# stop-game.ps1 — stops the game server + Cloudflare tunnel after a session.
# NOTE: this stops ALL node and cloudflared processes on this machine. If you run
# other node apps at the same time, close them via their own windows instead.
Get-Process node        -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  Stopped game server + Cloudflare tunnel." -ForegroundColor Yellow
