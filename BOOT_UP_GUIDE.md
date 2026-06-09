# big skrbl — Boot-Up Guide (office session, ~37 players)

A run-this-before-the-session checklist. Keep your laptop awake and on power the whole time — if it sleeps, the game dies for everyone.

> **Read this first (37 players):** at this size, two things change vs a small game —
> 1. **Don't put 37 in one room.** One round = 37 turns ≈ **47 minutes**, with everyone idle ~46 min waiting for their turn. **Split into ~4 rooms of ~9–10.**
> 2. **Don't rely on ngrok free.** Its **1,000-requests/day** cap gets tight with 37 people loading + reconnecting. If everyone's in the office, use **LAN mode** (below) — no limits, no warning page. See "Which infra?" below.

---

## TL;DR — fastest path

1. Open **PowerShell** in this folder (`big_skrbl`).
2. Run:
   ```powershell
   .\start-game.ps1
   ```
3. It prints a link like `https://xxxx.ngrok-free.dev` (and copies it to your clipboard). Paste it in the office group chat.
4. You (host): open the link → enter your name → **Create private room** → set the options below → wait for everyone → **Start game**.
5. After the session: `.\stop-game.ps1`

> First time only: if `.\start-game.ps1` is blocked by Windows, run this once in the same PowerShell:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` → press `Y`.

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

## Which infra? (37 players — pick before the session)

The game server itself handles 37 connections easily (Node + Socket.IO does thousands). The bottleneck is **how people reach it**.

- **Everyone in the office, same WiFi → use LAN mode.** Best choice at this size: no ngrok limits, no warning page, lowest latency. Jump to "Alternative: LAN mode" below. This is the recommended path.
- **Some/all remote → ngrok free is risky at 37.** Hard limits (from ngrok's docs):
  - **1,000 requests/day** — the binding constraint. ~37 page loads + reconnects/refreshes can approach it; if people reload on flaky WiFi it can blow past mid-session.
  - **1 GB/month bandwidth** — drawing data is tiny, a session is fine here.
  - **~2-hour session cap**, then the tunnel drops and the URL changes on restart.
  - **Interstitial warning page** per browser — 37 people each click "Visit Site" once.
  It *can* work for a single short session, but don't count on it for a smooth 37-person event.
- **Remote and want it reliable → deploy to a free always-on host** (Render / Railway free tier). No request cap, stable URL, survives your laptop sleeping. Ask me to set this up — it's ~10 min and removes every ngrok caveat.

**Bottom line:** in-office → LAN. Remote → deploy to a free host. ngrok free is fine for testing or a tiny group, but marginal for 37.

## Pre-session checklist (run ~10 min before)

- [ ] Laptop plugged in; sleep/screensaver disabled (Windows → Settings → Power → "Screen and sleep" → set to Never while gaming).
- [ ] `.\start-game.ps1` runs and prints a working link.
- [ ] You opened the link yourself and clicked through the **ngrok "Visit Site"** warning page once — confirm the game loads.
- [ ] Created a room and the room code shows top-right.
- [ ] Sent the link to the group with a heads-up (see "Message to send" below).

---

## Message to send your colleagues

> 🎨 Main tebak-gambar yuk! Buka link ini: **<paste link>**
> Pertama kali bakal ada halaman abu-abu ngrok → klik tombol **"Visit Site"** sekali.
> Terus isi nama → klik **Join** → masukin room code: **<your code>**
> Tunggu aba-aba start ya.

(The **copy link** button inside the game already bakes in the room code, so you can share that instead of dictating the code.)

---

## During the game

- **Host controls Start.** Need ≥ 2 players; for 19, wait until most have joined — latecomers can still join mid-game (they get the current canvas + can guess the next turns).
- One person draws, everyone else types guesses in chat. Faster correct guess = more points.
- The drawer and people who already guessed correctly chat in a **separate channel** so they can't leak the word.
- After every player has drawn (1 round), a **final scoreboard** shows, then it drops back to the lobby — you can immediately start another game.

---

## Troubleshooting

- **"Cannot run script" / ExecutionPolicy error** → run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, then retry.
- **No link printed** → open `http://localhost:4040` in your browser; the ngrok URL is shown there. Or check the minimized ngrok window.
- **Port 3000 already in use** → an old server is still running. Run `.\stop-game.ps1` first, then `.\start-game.ps1` again.
- **Friends see a blank/forbidden page** → make sure they clicked through the ngrok "Visit Site" warning. It appears once per browser.
- **Link stopped working mid-session** → laptop probably slept, or ngrok dropped. Re-run `.\start-game.ps1` — note the link will be **different**, so re-share it.
- **Laggy drawing** → only the active drawer's strokes are sent (1 → 18 fanout, which is fine), but a weak/slow uplink can still bottleneck. If the office is on the same WiFi, use **LAN mode** below — it's smoother.

---

## Alternative: LAN mode (everyone in the same office WiFi)

If all 19 are physically in the office on the **same network**, skip ngrok entirely — it's faster, no warning page, no bandwidth through your home uplink:

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

Mix is fine too: in-office folks use the LAN address, remote folks use the ngrok link — same game, same rooms.

---

## Limits to keep in mind

- **In-memory state** — restarting the server wipes all rooms. Don't restart mid-session.
- **ngrok free hard limits** — 1,000 requests/day, 1 GB/month, ~2-hour session cap, random URL each restart, one-time warning page per browser. Fine for testing; marginal for 37 people (see "Which infra?").
- **No moderation** — it's invite-only by design; only share the link with people you trust.
