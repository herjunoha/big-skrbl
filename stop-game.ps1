# stop-game.ps1 — stops the game server + ngrok tunnel after a session.
# NOTE: this stops ALL node and ngrok processes on this machine. If you run
# other node apps at the same time, close them via their own windows instead.
Get-Process node  -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process ngrok -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  Stopped game server + ngrok tunnel." -ForegroundColor Yellow
