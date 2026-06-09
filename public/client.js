/* global io */
const socket = io();

// ---- state ----
let me = null;
let room = null;
let players = [];
let isDrawer = false;
let myWord = null;
let canDraw = false;

// ---- elements ----
const $ = (id) => document.getElementById(id);
const homeScreen = $("home");
const gameScreen = $("game");

// =====================================================================
// Home: create / join
// =====================================================================
const params = new URLSearchParams(location.search);
if (params.get("room")) $("joinCode").value = params.get("room").toUpperCase();

function nameOrPrompt() {
  const n = $("nameInput").value.trim();
  if (!n) {
    $("homeError").textContent = "Enter a name first.";
    $("nameInput").focus();
    return null;
  }
  return n;
}

$("createBtn").onclick = () => {
  const name = nameOrPrompt();
  if (!name) return;
  socket.emit("createRoom", { name, settings: {} }, (res) => {
    if (res?.ok) enterGame(res);
  });
};

$("joinBtn").onclick = () => {
  const name = nameOrPrompt();
  if (!name) return;
  const code = $("joinCode").value.trim().toUpperCase();
  if (!code) {
    $("homeError").textContent = "Enter a room code.";
    return;
  }
  socket.emit("joinRoom", { roomId: code, name }, (res) => {
    if (res?.ok) enterGame(res);
    else $("homeError").textContent = res?.error || "Could not join.";
  });
};

$("joinCode").addEventListener("keydown", (e) => { if (e.key === "Enter") $("joinBtn").click(); });
$("nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("createBtn").click(); });

function enterGame(res) {
  me = res.you;
  room = res.snapshot;
  homeScreen.classList.remove("active");
  gameScreen.classList.add("active");
  $("roomCode").textContent = res.roomId;
  applyRoom(room);
  history.replaceState(null, "", `?room=${res.roomId}`);
}

$("copyLink").onclick = async () => {
  const link = `${location.origin}/?room=${$("roomCode").textContent}`;
  try {
    await navigator.clipboard.writeText(link);
    $("copyLink").textContent = "copied!";
    setTimeout(() => ($("copyLink").textContent = "copy link"), 1500);
  } catch {
    prompt("Copy this invite link:", link);
  }
}

// =====================================================================
// Room / players rendering
// =====================================================================
function applyRoom(r) {
  room = r;
  const inLobby = r.state === "lobby";
  $("lobbyPanel").classList.toggle("hidden", !inLobby);
  $("roundLabel").textContent = inLobby ? "Lobby" : `Round ${r.round} / ${r.rounds}`;
  // host-only controls
  const host = r.hostId === me;
  $("startBtn").style.display = host ? "" : "none";
  $("settingsBox").querySelectorAll("input,textarea").forEach((el) => (el.disabled = !host));
  $("lobbyHint").textContent = host
    ? "You're the host. Need at least 2 players."
    : "Waiting for the host to start...";
}

socket.on("room", applyRoom);

socket.on("players", (list) => {
  players = list;
  const ranked = [...list].sort((a, b) => b.score - a.score);
  $("playerCount").textContent = list.length;
  $("playerList").innerHTML = ranked
    .map((p, i) => {
      const cls = [p.id === me ? "me" : "", p.guessed ? "guessed" : ""].join(" ");
      const badge = p.drawing ? "✏️" : p.isHost ? "👑" : p.guessed ? "✅" : "";
      return `<li class="${cls}">
        <span class="rank">${i + 1}</span>
        <span class="pname">${escapeHtml(p.name)}${p.id === me ? " (you)" : ""}</span>
        <span class="badge">${badge}</span>
        <span class="pscore">${p.score}</span>
      </li>`;
    })
    .join("");
});

socket.on("settings", (s) => {
  $("setRounds").value = s.rounds;
  $("setDrawTime").value = s.drawTime;
  $("setHints").value = s.hints;
});

// =====================================================================
// Lobby controls
// =====================================================================
$("startBtn").onclick = () => socket.emit("startGame");

function pushSettings() {
  socket.emit("updateSettings", {
    rounds: +$("setRounds").value,
    drawTime: +$("setDrawTime").value,
    hints: +$("setHints").value,
    customWords: $("setWords").value.split(",").map((w) => w.trim()).filter(Boolean),
  });
}
["setRounds", "setDrawTime", "setHints", "setWords"].forEach((id) =>
  $(id).addEventListener("change", pushSettings)
);

// =====================================================================
// Chat
// =====================================================================
$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("chatInput").value.trim();
  if (!text) return;
  socket.emit("chat", { text });
  $("chatInput").value = "";
});

function addChat(html, extraClass = "") {
  const li = document.createElement("li");
  li.className = extraClass;
  li.innerHTML = html;
  const box = $("chat");
  box.appendChild(li);
  box.scrollTop = box.scrollHeight;
}

socket.on("chat", ({ name, text, secret }) =>
  addChat(`<span class="who">${escapeHtml(name)}:</span> ${escapeHtml(text)}`, secret ? "secret" : "")
);

socket.on("system", ({ text, kind }) => addChat(escapeHtml(text), `sys-${kind || "info"}`));

// =====================================================================
// Turn flow
// =====================================================================
socket.on("turnStart", ({ drawerId, drawerName, round, rounds }) => {
  isDrawer = drawerId === me;
  myWord = null;
  canDraw = false;
  clearBoard();
  $("roundLabel").textContent = `Round ${round} / ${rounds}`;
  $("lobbyPanel").classList.add("hidden");
  $("tools").classList.toggle("hidden", !isDrawer);
  $("wordSlots").textContent = "";
  $("timer").textContent = "";
  showOverlay(isDrawer ? "Choose a word…" : `${drawerName} is choosing a word…`);
  closeChooseModal();
});

socket.on("choose", ({ choices }) => {
  const box = $("wordChoices");
  box.innerHTML = "";
  choices.forEach((w) => {
    const b = document.createElement("button");
    b.className = "btn primary";
    b.textContent = w;
    b.onclick = () => {
      socket.emit("chooseWord", { word: w });
      closeChooseModal();
    };
    box.appendChild(b);
  });
  $("chooseModal").classList.remove("hidden");
});

socket.on("yourWord", ({ word }) => {
  myWord = word;
  renderWord(word, true);
});

socket.on("drawStart", ({ pattern, drawTime }) => {
  hideOverlay();
  canDraw = isDrawer;
  $("chatInput").placeholder = isDrawer ? "You're drawing — no guessing!" : "Type your guess...";
  $("chatInput").disabled = false;
  if (!myWord) renderWord(pattern, false);
  $("timer").textContent = drawTime;
});

socket.on("tick", ({ timeLeft }) => {
  $("timer").textContent = timeLeft;
  $("timer").classList.toggle("urgent", timeLeft <= 10);
});

socket.on("hint", ({ mask }) => renderWord(mask, false));

socket.on("youGuessed", ({ word }) => {
  renderWord(word, true);
  $("chatInput").placeholder = "You guessed it! Chat with other solvers…";
});

socket.on("turnEnd", ({ word, reason }) => {
  canDraw = false;
  $("tools").classList.add("hidden");
  $("timer").classList.remove("urgent");
  renderWord(word, true);
  const msg =
    reason === "allGuessed" ? "Everyone guessed it!" :
    reason === "drawerLeft" ? "Drawer left." :
    "Time's up!";
  showOverlay(`${msg}\nThe word was “${word}”`);
});

socket.on("gameEnd", ({ ranking }) => {
  isDrawer = false;
  canDraw = false;
  $("tools").classList.add("hidden");
  const podium = ranking
    .slice(0, 5)
    .map((p, i) => `${["🥇", "🥈", "🥉", "4.", "5."][i]} ${escapeHtml(p.name)} — ${p.score}`)
    .join("\n");
  showOverlay(`Game over!\n\n${podium}\n\nBack to lobby…`);
  setTimeout(() => {
    hideOverlay();
    $("lobbyPanel").classList.remove("hidden");
    $("roundLabel").textContent = "Lobby";
    $("wordSlots").textContent = "";
    $("timer").textContent = "";
  }, 6000);
});

// word slot rendering. `word` is either the full word or a mask like "__a_".
function renderWord(word, revealedFully) {
  $("wordSlots").textContent = revealedFully
    ? word
    : word.split("").map((c) => (c === " " ? "  " : c)).join(" ");
}

function showOverlay(text) {
  const o = $("overlay");
  o.textContent = text;
  o.style.whiteSpace = "pre-line";
  o.classList.remove("hidden");
}
function hideOverlay() { $("overlay").classList.add("hidden"); }

function closeChooseModal() { $("chooseModal").classList.add("hidden"); }

// =====================================================================
// Canvas drawing
// =====================================================================
const canvas = $("board");
const ctx = canvas.getContext("2d");
ctx.lineCap = "round";
ctx.lineJoin = "round";

let drawing = false;
let last = null;
let color = "#000000";
let size = 6;
let erasing = false;

const COLORS = [
  "#000000", "#7f8c8d", "#c0392b", "#e74c3c", "#e67e22", "#f1c40f",
  "#2ecc71", "#16a085", "#3498db", "#2980b9", "#9b59b6", "#8e44ad",
  "#ffffff", "#bdc3c7", "#d35400", "#f39c12", "#27ae60", "#1abc9c",
  "#34495e", "#fd79a8",
];
const palette = $("palette");
COLORS.forEach((c, i) => {
  const s = document.createElement("div");
  s.className = "swatch" + (i === 0 ? " active" : "");
  s.style.background = c;
  s.onclick = () => {
    color = c;
    erasing = false;
    document.querySelectorAll(".swatch").forEach((e) => e.classList.remove("active"));
    s.classList.add("active");
  };
  palette.appendChild(s);
});

$("size").addEventListener("input", (e) => (size = +e.target.value));
$("eraserBtn").onclick = () => { erasing = true; };
$("clearBtn").onclick = () => {
  if (!canDraw) return;
  clearBoard();
  socket.emit("clearCanvas");
};

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  // scale displayed coords back to the internal 900x640 buffer
  return { x: (cx / rect.width) * canvas.width, y: (cy / rect.height) * canvas.height };
}

function strokeSeg(from, to, col, sz) {
  ctx.strokeStyle = col;
  ctx.lineWidth = sz;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function startStroke(e) {
  if (!canDraw) return;
  e.preventDefault();
  drawing = true;
  last = canvasPos(e);
}
function moveStroke(e) {
  if (!drawing || !canDraw) return;
  e.preventDefault();
  const pos = canvasPos(e);
  const col = erasing ? "#ffffff" : color;
  strokeSeg(last, pos, col, size);
  socket.emit("draw", { from: last, to: pos, color: col, size });
  last = pos;
}
function endStroke() { drawing = false; last = null; }

canvas.addEventListener("mousedown", startStroke);
canvas.addEventListener("mousemove", moveStroke);
window.addEventListener("mouseup", endStroke);
canvas.addEventListener("touchstart", startStroke, { passive: false });
canvas.addEventListener("touchmove", moveStroke, { passive: false });
canvas.addEventListener("touchend", endStroke);

// incoming draw ops
socket.on("draw", (op) => strokeSeg(op.from, op.to, op.color, op.size));
socket.on("clear", clearBoard);
socket.on("canvasReplay", (ops) => {
  clearBoard();
  ops.forEach((op) => strokeSeg(op.from, op.to, op.color, op.size));
});

function clearBoard() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}
clearBoard();

// =====================================================================
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
