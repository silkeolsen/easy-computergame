// Shared settings and helpers for the host and player pages.
const PEER_PREFIX = "familypubquiz-";
const PLAYERS_NEEDED = 4;
const QUESTIONS_PER_GAME = 10;
const GRACE_MS = 15000;   // how long a dropped phone may take to come back
const PING_MS = 3000;     // heartbeat interval
const TIMEOUT_MS = 9000;  // silence after which a connection counts as lost
const LETTERS = ["A", "B", "C", "D"];
const NAME_MAX = 15;

function esc(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function cleanName(raw) {
  return String(raw || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_MAX);
}

function shuffle(list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function sessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function sessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

// Keep the screen on so a sleeping phone or laptop doesn't drop the game.
let wakeLock = null;
async function keepAwake() {
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible" && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch { /* not supported or not allowed */ }
}
document.addEventListener("visibilitychange", keepAwake);
document.addEventListener("click", keepAwake);

function winnersOf(scoreboard) {
  const top = Math.max(...scoreboard.map((p) => p.score));
  return scoreboard.filter((p) => p.score === top).map((p) => p.name);
}

function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

function scoreboardHtml(scoreboard, highlightName) {
  return `<ol class="scoreboard">${scoreboard.map((p) => `
    <li class="${p.name === highlightName ? "me" : ""}">
      <span class="sb-name">${esc(p.name)}${p.name === highlightName ? " (you)" : ""}</span>
      <span class="sb-score">${p.score}</span>
    </li>`).join("")}</ol>`;
}
