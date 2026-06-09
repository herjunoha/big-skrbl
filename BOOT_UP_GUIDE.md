# big skrbl — Boot-Up Guide (office session, ~37 players)

A run-this-before-the-session checklist. Keep your laptop awake and on power the whole time — if it sleeps, the game dies for everyone.

> **Read this first (37 players):**
> 1. **Don't put 37 in one room.** One round = 37 turns ≈ **47 minutes**, with everyone idle ~46 min waiting for their turn. **Split into ~4 rooms of ~9–10.** See "Recommended setup".
> 2. **How people connect:** in-office on the same WiFi → **LAN mode** (best). Anyone remote → **Cloudflare Tunnel** via `start-game.ps1`. See "Which infra?".

---

## TL;DR — fastest path (Cloudflare Tunnel)

1. Open **PowerShell** in this folder (`big_skrbl`).
2. Run:
   ```powershell
   .\start-game.ps1
   ```
3. It prints a link like `https://random-words.trycloudflare.com` (and copies it to your clipboard). Paste it in the office group chat. **No warning page** — people open it and play directly.
4. You (host): open the link → enter your name → **Create private room** → set the options below → wait for everyone → **Start game**.
5. After the session: `.\stop-game.ps1`

> First time only: if `.\start-game.ps1` is blocked by Windows, run this once in the same PowerShell:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` → press `Y`.
> The tunnel binary (`cloudflared.exe`) is already in this folder — nothing to install.

---

## Recommended setup for 37 players

### Split into ~4 rooms (do this)
37 in one room means 37 turns per round — ~47 min of mostly waiting. Instead:
- Pick **4 co-hosts**. Each opens the link and clicks **Create private room** → gets their own room code.
- Split people ~9–10 per room (e.g. by team/floor). Each co-host shares their room code to their group.
- All rooms run off the **same link/server** — only the room code differs.
- Per room: **1 round ≈ 12–13 min**, everyone draws once, snappy. Run a 2nd round if people want more.

### Lobby settings (each room/host)
- **Rounds: 1** (2 only if the room is small and people are keen).
- **Draw time: 50–60s.**
- **Letter hints: 2–3.**
- **Custom words: optional** — comma-separated, need ≥ 3.

**Time math per room (~10 people):** 10 turns × (~55s draw + ~10s pick + ~6s scoreboard) ≈ **12 min/round.**

### If you insist on one big room of 37
Drop **draw time to 35–40s** and keep **rounds: 1** — still ~30+ minutes and lots of idle time. Not recommended, but it works.

---

## Which infra? (pick before the session)

The game server itself handles 37 connections easily (Node + Socket.IO does thousands). The bottleneck is **how people reach it**.

- **Everyone in the office, same WiFi → use LAN mode.** Best at this size: lowest latency, no internet round-trip, nothing to share but a `http://...:3000` address. Jump to "Alternative: LAN mode".
- **Some/all remote → Cloudflare Tunnel** (what `start-game.ps1` uses). Free, no account, no credit card, **no warning page**, and **no daily request cap** (the reason we moved off ngrok). Supports the WebSocket traffic the game needs. Trade-offs:
  - **Your laptop must stay awake** the whole session — the tunnel runs from it.
  - The URL is **random and changes** every time you start it, so share the current one.
- **Why not a hosted platform (Render/Railway)?** We tried Render — its free tier required a card that couldn't be validated. Most "free" hosts (Render, Railway, Fly) now require a verified card. Cloudflare Tunnel sidesteps that entirely. If you later get a working card, a host would remove the "laptop must stay on" constraint; ask me to set it up then.

**Bottom line:** in-office → LAN. Remote → `start-game.ps1` (Cloudflare Tunnel).

---

## Pre-session checklist (run ~10 min before)

- [ ] Laptop plugged in; sleep/screensaver disabled (Windows → Settings → Power → "Screen and sleep" → set to Never while gaming).
- [ ] `cloudflared.exe` is present in this folder (it is, unless someone deleted it).
- [ ] `.\start-game.ps1` runs and prints a working `trycloudflare.com` link.
- [ ] You opened the link yourself and confirmed the game loads.
- [ ] Created a room and the room code shows top-right.
- [ ] Sent the link to the group with a heads-up (see "Message to send" below).

---

## Message to send your colleagues

> 🎨 Main tebak-gambar yuk! Buka link ini: **<paste link>**
> Isi nama → klik **Join** → masukin room code: **<your code>**
> Tunggu aba-aba start ya.

(The **copy link** button inside the game already bakes in the room code, so you can share that link instead of dictating the code.)

---

## During the game

- **Host controls Start.** Need ≥ 2 players; wait until most have joined — latecomers can still join mid-game (they get the current canvas + can guess the next turns).
- One person draws, everyone else types guesses in chat. Faster correct guess = more points.
- The drawer and people who already guessed correctly chat in a **separate channel** so they can't leak the word.
- After every player has drawn (1 round), a **final scoreboard** shows, then it drops back to the lobby — you can immediately start another game.

---

## Troubleshooting

- **"Cannot run script" / ExecutionPolicy error** → run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then retry.
- **No link printed** → the tunnel may still be warming up. Check the log it writes:
  `%TEMP%\big-skrbl-cloudflared.err.log` — look for a `https://....trycloudflare.com` line. Give it ~10–15s.
- **`cloudflared.exe not found`** → re-download it into this folder:
  `Invoke-WebRequest "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile .\cloudflared.exe`
- **Port 3000 already in use** → an old server is still running. Run `.\stop-game.ps1` first, then `.\start-game.ps1` again.
- **People get a 502 / "tunnel error" right after you share the link** → the edge needs ~10s to warm up after the URL appears. Wait a few seconds and refresh.
- **Link stopped working mid-session** → laptop probably slept, or the tunnel dropped. Re-run `.\start-game.ps1` — the link will be **different**, so re-share it.
- **Laggy drawing** → only the active drawer's strokes are sent (1 → ~36 fanout, which is fine), but a weak/slow uplink can still bottleneck. If the office is on the same WiFi, use **LAN mode** below — it's smoother.

---

## Alternative: LAN mode (everyone in the same office WiFi)

If all 37 are physically in the office on the **same network**, skip the tunnel entirely — it's faster and there's nothing external in the path:

1. Run just the server:
   ```powershell
   npm start
   ```
2. Share this address (verify the IP — your likely office IP is `10.225.107.200`):
   ```
   http://10.225.107.200:3000
   ```
   To re-check your IP: `ipconfig` → look at the IPv4 of your active Wi-Fi adapter.
3. First connection may trigger a **Windows Firewall** popup → click **Allow access** (tick *Private networks*).

Mix is fine too: in-office folks use the LAN address, remote folks use the tunnel link — same game, same rooms.

---

## Limits to keep in mind

- **In-memory state** — restarting the server wipes all rooms. Don't restart mid-session.
- **Cloudflare quick tunnel** — free and no request cap, but the URL is random each run and there's no uptime guarantee; it lives only while `start-game.ps1`'s tunnel process (and your laptop) stays up.
- **No moderation** — it's invite-only by design; only share the link with people you trust.
