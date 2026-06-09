import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WORDS } from "./words.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.static(join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Room state (in-memory). No player cap, private rooms only (join by code).
// ---------------------------------------------------------------------------
/** @type {Map<string, Room>} */
const rooms = new Map();

const DEFAULT_SETTINGS = { rounds: 3, drawTime: 80, hints: 2, customWords: [] };

// How long an empty room is kept before deletion, so a sole host's transient
// disconnect (tunnel/wifi blip) doesn't nuke the room before they reconnect.
const ROOM_GRACE_MS = 5 * 60 * 1000;

function makeRoomId() {
  let id;
  do {
    id = Math.random().toString(36).slice(2, 8).toUpperCase();
  } while (rooms.has(id));
  return id;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function wordBank(room) {
  return room.settings.customWords?.length >= 3 ? room.settings.customWords : WORDS;
}

function threeWords(room) {
  const bank = wordBank(room);
  const out = new Set();
  while (out.size < 3 && out.size < bank.length) out.add(pick(bank));
  return [...out];
}

function publicPlayers(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    score: p.score,
    isHost: p.id === room.hostId,
    guessed: room.guessed.has(p.id),
    drawing: p.id === room.currentDrawerId,
  }));
}

function snapshot(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    state: room.state,
    round: room.round,
    rounds: room.settings.rounds,
    drawTime: room.settings.drawTime,
    currentDrawerId: room.currentDrawerId,
    players: publicPlayers(room),
  };
}

function broadcastPlayers(room) {
  io.to(room.id).emit("players", publicPlayers(room));
}

// Build the masked hint string ("_ _ _ a _") shown to guessers.
function maskedWord(room) {
  return room.word
    .split("")
    .map((ch, i) => (ch === " " ? " " : room.revealed.has(i) ? ch : "_"))
    .join("");
}

// ---------------------------------------------------------------------------
// Turn lifecycle
// ---------------------------------------------------------------------------
function clearTimers(room) {
  if (room.tick) clearInterval(room.tick);
  if (room.between) clearTimeout(room.between);
  room.tick = null;
  room.between = null;
}

function startGame(room) {
  for (const p of room.players.values()) p.score = 0;
  room.round = 0;
  beginRound(room);
}

function beginRound(room) {
  room.round += 1;
  if (room.round > room.settings.rounds) return endGame(room);
  // Everyone present at round start draws once, in join order.
  room.drawOrder = [...room.players.keys()];
  room.turnIndex = -1;
  nextTurn(room);
}

function nextTurn(room) {
  clearTimers(room);
  room.turnIndex += 1;
  // Skip drawers who have since left.
  while (
    room.turnIndex < room.drawOrder.length &&
    !room.players.has(room.drawOrder[room.turnIndex])
  ) {
    room.turnIndex += 1;
  }
  if (room.turnIndex >= room.drawOrder.length) return beginRound(room);

  const drawerId = room.drawOrder[room.turnIndex];
  room.currentDrawerId = drawerId;
  room.word = null;
  room.guessed = new Set();
  room.revealed = new Set();
  room.canvasOps = [];
  room.state = "choosing";
  room.choices = threeWords(room);

  io.to(room.id).emit("turnStart", {
    drawerId,
    drawerName: room.players.get(drawerId).name,
    round: room.round,
    rounds: room.settings.rounds,
  });
  broadcastPlayers(room);
  io.to(drawerId).emit("choose", { choices: room.choices });

  // Auto-pick if the drawer dawdles.
  room.between = setTimeout(() => {
    if (room.state === "choosing") chooseWord(room, drawerId, pick(room.choices));
  }, 15000);
}

function chooseWord(room, drawerId, word) {
  if (room.state !== "choosing" || drawerId !== room.currentDrawerId) return;
  if (!room.choices.includes(word)) word = pick(room.choices);
  clearTimers(room);

  room.word = word;
  room.state = "drawing";
  room.timeLeft = room.settings.drawTime;
  room.guessers = [...room.players.keys()].filter((id) => id !== drawerId);

  io.to(room.id).emit("drawStart", {
    drawerId,
    wordLength: word.length,
    pattern: word.split("").map((c) => (c === " " ? " " : "_")).join(""),
    drawTime: room.settings.drawTime,
  });
  io.to(drawerId).emit("yourWord", { word });

  // Letter-reveal schedule: spread `hints` reveals across the back half of the timer.
  const lettersToReveal = Math.min(
    room.settings.hints,
    room.word.replace(/ /g, "").length - 1
  );
  const revealAt = [];
  for (let i = 1; i <= lettersToReveal; i++) {
    revealAt.push(Math.floor((room.settings.drawTime * i) / (lettersToReveal + 1)));
  }

  room.tick = setInterval(() => {
    room.timeLeft -= 1;
    const elapsed = room.settings.drawTime - room.timeLeft;
    if (revealAt.includes(elapsed)) revealLetter(room);
    io.to(room.id).emit("tick", { timeLeft: room.timeLeft });
    if (room.timeLeft <= 0) endTurn(room, "time");
  }, 1000);
}

function revealLetter(room) {
  const hidden = [];
  room.word.split("").forEach((ch, i) => {
    if (ch !== " " && !room.revealed.has(i)) hidden.push(i);
  });
  if (!hidden.length) return;
  room.revealed.add(pick(hidden));
  // Only guessers get the updated mask; drawer already has the full word.
  for (const id of room.guessers) {
    if (!room.guessed.has(id)) io.to(id).emit("hint", { mask: maskedWord(room) });
  }
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return d[m][n];
}

function handleGuess(room, player, text) {
  const guess = text.trim().toLowerCase();
  const answer = room.word.toLowerCase();

  if (guess === answer) {
    room.guessed.add(player.id);
    // Speed-scaled points: full-ish if instant, floor near the end.
    const frac = room.timeLeft / room.settings.drawTime;
    const points = Math.round(50 + 350 * frac);
    player.score += points;
    player.lastGain = points;

    io.to(room.id).emit("system", {
      text: `${player.name} guessed the word!`,
      kind: "correct",
    });
    io.to(player.id).emit("youGuessed", { word: room.word });
    broadcastPlayers(room);

    if (room.guessers.every((id) => room.guessed.has(id))) endTurn(room, "allGuessed");
    return;
  }

  // "close" nudge, only to the guesser.
  if (levenshtein(guess, answer) <= 1) {
    io.to(player.id).emit("system", { text: `"${text}" is close!`, kind: "close" });
  }
  // Normal chat (also visible to everyone, including the drawer).
  io.to(room.id).emit("chat", { name: player.name, text, id: player.id });
}

function endTurn(room, reason) {
  if (room.state !== "drawing") return;
  clearTimers(room);
  room.state = "turnEnd";

  // Drawer earns the average of what guessers earned, scaled by hit rate.
  const drawer = room.players.get(room.currentDrawerId);
  const correctGuessers = room.guessers.filter((id) => room.guessed.has(id));
  if (drawer && correctGuessers.length) {
    const avg =
      correctGuessers.reduce((s, id) => s + (room.players.get(id)?.lastGain || 0), 0) /
      correctGuessers.length;
    const drawGain = Math.round(avg * (correctGuessers.length / room.guessers.length));
    drawer.score += drawGain;
  }
  for (const p of room.players.values()) p.lastGain = 0;

  io.to(room.id).emit("turnEnd", {
    word: room.word,
    reason,
    players: publicPlayers(room),
  });
  broadcastPlayers(room);

  room.between = setTimeout(() => nextTurn(room), 6000);
}

function endGame(room) {
  clearTimers(room);
  room.state = "lobby";
  room.currentDrawerId = null;
  const ranking = publicPlayers(room).sort((a, b) => b.score - a.score);
  io.to(room.id).emit("gameEnd", { ranking });
  broadcastPlayers(room);
}

// ---------------------------------------------------------------------------
// Socket wiring
// ---------------------------------------------------------------------------
io.on("connection", (socket) => {
  socket.data.roomId = null;

  socket.on("createRoom", ({ name, settings }, cb) => {
    const id = makeRoomId();
    const room = {
      id,
      hostId: socket.id,
      players: new Map(),
      settings: { ...DEFAULT_SETTINGS, ...sanitizeSettings(settings) },
      state: "lobby",
      round: 0,
      drawOrder: [],
      turnIndex: -1,
      currentDrawerId: null,
      word: null,
      choices: [],
      guessed: new Set(),
      revealed: new Set(),
      guessers: [],
      canvasOps: [],
      timeLeft: 0,
      tick: null,
      between: null,
    };
    rooms.set(id, room);
    joinRoom(socket, room, name);
    cb?.({ ok: true, roomId: id, you: socket.id, snapshot: snapshot(room) });
  });

  socket.on("joinRoom", ({ roomId, name }, cb) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room) return cb?.({ ok: false, error: "Room not found." });
    joinRoom(socket, room, name);
    cb?.({ ok: true, roomId: room.id, you: socket.id, snapshot: snapshot(room) });
    // Mid-turn joiner: replay the current canvas + masked word so they can play along.
    if (room.state === "drawing") {
      socket.emit("drawStart", {
        drawerId: room.currentDrawerId,
        wordLength: room.word.length,
        pattern: maskedWord(room),
        drawTime: room.settings.drawTime,
      });
      socket.emit("tick", { timeLeft: room.timeLeft });
      if (room.canvasOps.length) socket.emit("canvasReplay", room.canvasOps);
    }
  });

  socket.on("startGame", () => {
    const room = currentRoom(socket);
    if (!room || socket.id !== room.hostId) return;
    if (room.players.size < 2) {
      socket.emit("system", { text: "Need at least 2 players to start.", kind: "warn" });
      return;
    }
    if (room.state !== "lobby") return;
    startGame(room);
  });

  socket.on("updateSettings", (settings) => {
    const room = currentRoom(socket);
    if (!room || socket.id !== room.hostId || room.state !== "lobby") return;
    room.settings = { ...room.settings, ...sanitizeSettings(settings) };
    io.to(room.id).emit("settings", room.settings);
  });

  socket.on("chooseWord", ({ word }) => {
    const room = currentRoom(socket);
    if (room) chooseWord(room, socket.id, word);
  });

  socket.on("draw", (op) => {
    const room = currentRoom(socket);
    if (!room || socket.id !== room.currentDrawerId || room.state !== "drawing") return;
    room.canvasOps.push(op);
    socket.to(room.id).emit("draw", op);
  });

  socket.on("clearCanvas", () => {
    const room = currentRoom(socket);
    if (!room || socket.id !== room.currentDrawerId) return;
    room.canvasOps = [];
    socket.to(room.id).emit("clear");
  });

  socket.on("chat", ({ text }) => {
    const room = currentRoom(socket);
    if (!room || !text || !text.trim()) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    const isDrawer = socket.id === room.currentDrawerId;
    const alreadyGuessed = room.guessed.has(socket.id);

    // During drawing, guessers' messages are routed through guess-checking.
    if (room.state === "drawing" && !isDrawer && !alreadyGuessed) {
      handleGuess(room, player, text);
    } else if (room.state === "drawing" && (isDrawer || alreadyGuessed)) {
      // Drawer + those who already solved share a "spectator" channel so they
      // don't leak the word to active guessers.
      const audience = [room.currentDrawerId, ...room.guessers.filter((id) => room.guessed.has(id))];
      for (const id of audience) {
        io.to(id).emit("chat", { name: player.name, text, id: player.id, secret: true });
      }
    } else {
      io.to(room.id).emit("chat", { name: player.name, text, id: player.id });
    }
  });

  socket.on("disconnect", () => {
    const room = currentRoom(socket);
    if (!room) return;
    const player = room.players.get(socket.id);
    room.players.delete(socket.id);
    if (player) io.to(room.id).emit("system", { text: `${player.name} left.`, kind: "leave" });

    if (room.players.size === 0) {
      clearTimers(room);
      // Don't delete immediately. A sole host whose socket blips (common over a
      // tunnel / wifi hiccup / backgrounded tab) would otherwise lose the room
      // while their screen still shows it — and friends get "Room not found".
      // Hold it for a grace period; any (re)join cancels the deletion.
      room.deleteTimer = setTimeout(() => {
        if (room.players.size === 0) rooms.delete(room.id);
      }, ROOM_GRACE_MS);
      return;
    }
    if (socket.id === room.hostId) room.hostId = room.players.keys().next().value;

    // If the active drawer bailed, end their turn early.
    if (socket.id === room.currentDrawerId && (room.state === "drawing" || room.state === "choosing")) {
      io.to(room.id).emit("system", { text: "Drawer left — skipping turn.", kind: "warn" });
      clearTimers(room);
      room.state = "drawing"; // satisfy endTurn's guard, then advance
      endTurn(room, "drawerLeft");
    } else if (room.state === "drawing") {
      // Removing a guesser might complete the round.
      room.guessers = room.guessers.filter((id) => id !== socket.id);
      if (room.guessers.length && room.guessers.every((id) => room.guessed.has(id))) {
        endTurn(room, "allGuessed");
      }
    }
    broadcastPlayers(room);
    io.to(room.id).emit("room", snapshot(room));
  });
});

function joinRoom(socket, room, name) {
  // Someone joined — cancel any pending empty-room deletion.
  if (room.deleteTimer) { clearTimeout(room.deleteTimer); room.deleteTimer = null; }
  socket.join(room.id);
  socket.data.roomId = room.id;
  const clean = (name || "Player").toString().slice(0, 20).trim() || "Player";
  room.players.set(socket.id, { id: socket.id, name: clean, score: 0, lastGain: 0 });
  // If the room had no live host (e.g. host reconnecting after a blip), the
  // (re)joiner takes over as host so the lobby stays controllable.
  if (!room.players.has(room.hostId)) room.hostId = socket.id;
  io.to(room.id).emit("system", { text: `${clean} joined.`, kind: "join" });
  broadcastPlayers(room);
  io.to(room.id).emit("room", snapshot(room));
}

function currentRoom(socket) {
  return socket.data.roomId ? rooms.get(socket.data.roomId) : null;
}

function sanitizeSettings(s = {}) {
  const out = {};
  if (s.rounds != null) out.rounds = Math.max(1, Math.min(10, Number(s.rounds) || 3));
  if (s.drawTime != null) out.drawTime = Math.max(20, Math.min(240, Number(s.drawTime) || 80));
  if (s.hints != null) out.hints = Math.max(0, Math.min(5, Number(s.hints) || 0));
  if (Array.isArray(s.customWords)) {
    out.customWords = s.customWords
      .map((w) => String(w).trim().toLowerCase())
      .filter((w) => w.length >= 2 && w.length <= 30)
      .slice(0, 500);
  }
  return out;
}

httpServer.listen(PORT, () => {
  console.log(`big-skrbl running → http://localhost:${PORT}`);
});
