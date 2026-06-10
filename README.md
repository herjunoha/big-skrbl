# big skrbl

A self-hosted [skribbl.io](https://skribbl.io)-style draw-and-guess game — **private rooms only, no player limit**.

A group of players (4 by default) all draw the **same predetermined phrase** on **one shared canvas at once** — chaotic and fast — while everyone else races to guess it in chat. Faster guesses score more, and every drawer in the group shares the drawing bonus. Letter hints reveal over time. After every group has drawn the configured number of rounds, a final scoreboard shows.

## Run

```bash
npm install
npm start          # → http://localhost:3000
```

Open the page, enter a name, **Create private room**, then share the room code or the **copy link** button with friends. Anyone with the code joins the same room — there is no maximum.

To play across devices on your LAN, share `http://<your-LAN-ip>:3000/?room=<CODE>`. For the public internet, put it behind a tunnel (e.g. `ngrok http 3000`) or any host that runs Node.

## How it works

- **`server.js`** — Express static server + Socket.IO. Holds all room/game state in memory (rooms vanish when empty). Owns the turn lifecycle: group + phrase pick → short "get ready" reveal → shared-canvas drawing + timer + letter hints → guess scoring → round/game end.
- **`words.js`** — default phrase bank (two-word phrases). Rooms can override it with a custom comma-separated list in the lobby (≥ 3 phrases).
- **`public/`** — vanilla HTML/CSS/JS client. Canvas strokes are sent as line segments scaled to a fixed 900×640 buffer, so every player sees the same drawing regardless of screen size. Mid-game joiners get a canvas replay.

## Settings (host, in the lobby)

- **Rounds** — how many times each player draws (1–10).
- **Draw time** — seconds per turn (20–240).
- **Letter hints** — letters auto-revealed to guessers as the timer runs down (0–5).
- **Drawers per turn** — how many players draw the same phrase at once (1–8; default 4). `1` = classic one-drawer play.
- **Custom phrases** — optional; replaces the default bank.

## Notes / limits

- State is in-memory — a server restart drops all rooms. Fine for casual play; add a store if you need persistence.
- No accounts, no rate limiting, no spam protection — it assumes you only share the room code with people you trust (it's private-only by design).
- Minimum 5 players to start a game (and always more players than drawers, so someone can guess).
