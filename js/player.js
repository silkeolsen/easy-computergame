// Player page: connects to the host's browser tab and shows whatever state
// the host sends. The phone never knows the correct answer before the reveal.
const app = document.getElementById("app");
const banner = document.getElementById("banner");
const code = (new URLSearchParams(location.search).get("game") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// One id per browser tab, kept across reloads so a phone can rejoin after a blip.
let clientId = sessionGet("fpq-client-" + code);
if (!clientId) {
  clientId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionSet("fpq-client-" + code, clientId);
}

let peer = null;
let conn = null;
let connected = false;
let everConnected = false;
let lastSeen = 0;
let reconnectDeadline = 0;
let retryTimer = null;
let state = null;
let joinError = "";
let pendingAnswer = null; // locks the buttons straight after a tap
let draftName = sessionGet("fpq-name") || "";

// ---------- Connection ----------

function connect() {
  clearTimeout(retryTimer);
  if (peer && !peer.destroyed && peer.open) return openConn();
  if (peer) peer.destroy();
  peer = new Peer({ debug: 1 });
  peer.on("open", openConn);
  peer.on("error", (err) => {
    if (err.type === "peer-unavailable") onLost();
    else if (!connected) onLost();
  });
  peer.on("disconnected", () => { /* signalling only; data channel may still be fine */ });
}

function openConn() {
  if (conn) { try { conn.close(); } catch { /* ignore */ } }
  const c = peer.connect(PEER_PREFIX + code, { reliable: true });
  conn = c;
  c.on("open", () => {
    if (c !== conn) return;
    connected = true;
    everConnected = true;
    reconnectDeadline = 0;
    lastSeen = Date.now();
    showBanner("");
    c.send({ type: "hello", clientId });
  });
  c.on("data", (msg) => {
    if (c !== conn || !msg || typeof msg !== "object") return;
    lastSeen = Date.now();
    if (msg.type === "ping") c.send({ type: "pong" });
    else if (msg.type === "state") onState(msg);
    else if (msg.type === "joinError") { joinError = msg.message; render(); }
  });
  c.on("close", () => { if (c === conn) onLost(); });
  c.on("error", () => { if (c === conn) onLost(); });
  // If the channel never opens, treat it as a failed attempt.
  setTimeout(() => { if (c === conn && !connected) onLost(); }, 6000);
}

function onLost() {
  connected = false;
  if (!reconnectDeadline) reconnectDeadline = Date.now() + GRACE_MS + 5000;
  if (Date.now() > reconnectDeadline) {
    reconnectDeadline = 0;
    if (peer) peer.destroy();
    peer = null;
    showBanner("");
    renderLost();
    return;
  }
  if (everConnected) showBanner("Connection lost — reconnecting…");
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, 2000);
}

// Heartbeat: the host pings every few seconds. Silence means we've dropped.
setInterval(checkAlive, 1000);
document.addEventListener("visibilitychange", checkAlive);
function checkAlive() {
  if (connected && Date.now() - lastSeen > TIMEOUT_MS) {
    const c = conn;
    conn = null;
    try { c.close(); } catch { /* ignore */ }
    onLost();
  }
}

function send(msg) {
  try { if (conn && connected) conn.send(msg); } catch { /* heartbeat will notice */ }
}

// ---------- State ----------

function onState(s) {
  const changedQuestion = !state || state.phase !== s.phase || state.qIndex !== s.qIndex;
  if (changedQuestion || s.yourAnswer !== null) pendingAnswer = null;
  if (s.joined) joinError = "";
  state = s;
  render();
  if (changedQuestion) window.scrollTo(0, 0);
}

function submitName(e) {
  e.preventDefault();
  const name = cleanName(document.getElementById("name").value);
  if (!name) { joinError = "Please type your name first."; render(); return; }
  draftName = name;
  sessionSet("fpq-name", name);
  joinError = "";
  send({ type: "join", name });
  const btn = document.getElementById("join");
  btn.disabled = true;
  btn.textContent = "Joining…";
}

function choose(i) {
  if (!state || state.phase !== "question" || state.yourAnswer !== null || pendingAnswer !== null) return;
  pendingAnswer = i;
  send({ type: "answer", qIndex: state.qIndex, choice: i });
  render();
}

// ---------- Screens ----------

function showBanner(text) {
  banner.textContent = text;
  banner.hidden = !text;
}

function renderLost() {
  app.innerHTML = `
    <div class="card center">
      <div class="trophy">📡</div>
      <h1>Can't reach the game</h1>
      <p class="big">${everConnected ? "Your phone lost its connection to the host screen." : "We couldn't find this game."}</p>
      <p class="muted">Make sure the host screen is still open and your phone is on the Wi-Fi. If the host has started a new game, scan the new QR code.</p>
      <button class="btn" id="retry">Try again</button>
    </div>`;
  document.getElementById("retry").onclick = () => {
    app.innerHTML = `<div class="card center"><div class="spinner"></div><p class="big">Connecting to the game…</p></div>`;
    connect();
  };
}

function render() {
  const s = state;
  if (!s) return;
  // Don't wipe a half-typed name when someone else joins and the screen redraws.
  const input = document.getElementById("name");
  const wasFocused = input && document.activeElement === input;
  if (input) draftName = input.value;

  if (!s.joined) {
    if (s.phase === "lobby") {
      app.innerHTML = `
        <form class="card" id="joinForm">
          <h1>Welcome!</h1>
          ${joinError ? `<div class="error">${esc(joinError)}</div>` : ""}
          <label for="name">What's your name?</label>
          <input type="text" id="name" maxlength="${NAME_MAX}" autocomplete="given-name" autocapitalize="words"
                 enterkeyhint="go" value="${esc(draftName)}" placeholder="e.g. Grandma">
          <button class="btn" id="join" type="submit">Join the quiz</button>
        </form>
        ${s.lobbyNames.length ? `<div class="card"><h2>Already here</h2><p class="big">${esc(joinNames(s.lobbyNames))}</p></div>` : ""}`;
      document.getElementById("joinForm").onsubmit = submitName;
      if (wasFocused) document.getElementById("name").focus();
    } else if (s.phase === "interrupted") {
      renderInterrupted(s);
    } else {
      app.innerHTML = `
        <div class="card center">
          <h1>This game has already started</h1>
          <p class="big">Wait for the host to start a new game — this screen will update by itself.</p>
        </div>`;
    }
    return;
  }

  if (s.phase === "lobby") {
    app.innerHTML = `
      <div class="card center">
        <div class="trophy">🎉</div>
        <h1>You're in, ${esc(s.name)}!</h1>
        <p class="big">Waiting for the host to start the quiz.</p>
        <p class="muted">Players so far: ${esc(joinNames(s.lobbyNames))}</p>
      </div>
      <p class="center muted">Keep this page open and your screen on.</p>`;
  }

  else if (s.phase === "question") {
    const mine = s.yourAnswer !== null ? s.yourAnswer : pendingAnswer;
    const header = `<span class="progress">Question ${s.qNum} of ${s.total}</span>
      <div class="question-text">${esc(s.question)}</div>`;
    if (mine === null) {
      app.innerHTML = `
        <div class="card">
          ${header}
          <p class="muted">Tap an answer to lock it in. You can't change it afterwards.</p>
          <div class="options">${s.options.map((opt, i) =>
            `<button class="option" data-i="${i}"><span class="letter">${LETTERS[i]}</span><span>${esc(opt)}</span></button>`).join("")}
          </div>
        </div>`;
      app.querySelectorAll(".option").forEach((b) => { b.onclick = () => choose(Number(b.dataset.i)); });
    } else {
      app.innerHTML = `
        <div class="card">
          ${header}
          <div class="locked">🔒 Your answer is locked in:<br><strong>${LETTERS[mine]}. ${esc(s.options[mine])}</strong></div>
          <p class="center big">${s.yourAnswer === null ? "Sending…" :
            `Waiting for everyone… <strong>${s.answeredCount} of ${s.lobbyNames.length}</strong> have answered.`}</p>
        </div>`;
    }
  }

  else if (s.phase === "reveal") {
    const right = s.youWereRight;
    app.innerHTML = `
      <div class="result-banner ${right ? "good" : "bad"}">${right ? "✓ Correct! +1 point" : "✗ Not this time"}</div>
      <div class="card">
        <span class="progress">Question ${s.qNum} of ${s.total}</span>
        <div class="question-text">${esc(s.question)}</div>
        <div class="options revealed">${s.options.map((opt, i) => {
          const cls = i === s.correct ? "correct" : (i === s.yourAnswer ? "picked-wrong" : "");
          const tag = i === s.correct ? "✓ Correct" : (i === s.yourAnswer ? "✗ Your answer" : "");
          return `<div class="option ${cls}"><span class="letter">${LETTERS[i]}</span><span>${esc(opt)}</span>${tag ? `<span class="tag">${tag}</span>` : ""}</div>`;
        }).join("")}</div>
      </div>
      <div class="card">
        <h2>Scoreboard</h2>
        ${scoreboardHtml(s.scoreboard, s.name)}
        <p class="center muted" style="margin-top:12px">Waiting for the host to continue…</p>
      </div>`;
  }

  else if (s.phase === "final") {
    const iWon = s.winners.includes(s.name);
    const mine = s.scoreboard.find((p) => p.name === s.name);
    const headline = s.winners.length === 1
      ? (iWon ? "You win! 🎉" : `${esc(s.winners[0])} wins!`)
      : (iWon ? "You share the win! 🎉" : `It's a tie: ${esc(joinNames(s.winners))}!`);
    app.innerHTML = `
      <div class="card center">
        <div class="trophy">🏆</div>
        <h1>${headline}</h1>
        <p class="big">You scored <strong>${mine ? mine.score : 0} out of ${s.total}</strong>.</p>
      </div>
      <div class="card">
        <h2>Final scores</h2>
        ${scoreboardHtml(s.scoreboard, s.name)}
      </div>
      <p class="center muted">Thanks for playing! If the host starts another game, this screen will let you join again.</p>`;
  }

  else if (s.phase === "interrupted") {
    renderInterrupted(s);
  }
}

function renderInterrupted(s) {
  app.innerHTML = `
    <div class="card center">
      <div class="trophy">⚠️</div>
      <h1>Game interrupted</h1>
      <p class="big">${esc(s.interruptedBy)}'s phone lost its connection, so this game has stopped.</p>
      <p class="muted">Wait for the host to start a new game — this screen will update and let you join again.</p>
    </div>`;
}

if (!code) {
  app.innerHTML = `
    <div class="card center">
      <h1>No game code</h1>
      <p class="big">Please scan the QR code on the host screen to join a game.</p>
    </div>`;
} else {
  connect();
}
