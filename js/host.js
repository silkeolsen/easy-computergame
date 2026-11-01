// Host page: this browser tab is the game server. Phones connect to it
// directly over WebRTC (PeerJS) and receive a personalised view of the state.
const app = document.getElementById("app");
const banner = document.getElementById("banner");

let peer = null;
let code = "";
const conns = new Map(); // peerId -> { conn, lastSeen, clientId }
let game = freshGame();

function freshGame() {
  return { phase: "lobby", players: [], questions: [], qIndex: 0, interruptedBy: null };
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function joinUrl() {
  return new URL("play.html?game=" + code, location.href).href;
}

// ---------- Connection handling ----------

function startPeer() {
  code = randomCode();
  peer = new Peer(PEER_PREFIX + code, { debug: 1 });
  peer.on("open", () => { showBanner(""); render(); });
  peer.on("connection", onConnection);
  peer.on("disconnected", () => {
    showBanner("Lost contact with the connection service — reconnecting…");
    setTimeout(() => { if (!peer.destroyed && peer.disconnected) peer.reconnect(); }, 2000);
  });
  peer.on("error", (err) => {
    if (err.type === "unavailable-id") {
      peer.destroy();
      startPeer();
    } else if (["network", "server-error", "socket-error", "socket-closed", "browser-incompatible"].includes(err.type)) {
      showBanner("Can't reach the connection service. Check this device's internet connection.");
    }
  });
}

function onConnection(conn) {
  conn.on("open", () => {
    conns.set(conn.peer, { conn, lastSeen: Date.now(), clientId: null });
  });
  conn.on("data", (msg) => {
    const entry = conns.get(conn.peer);
    if (!entry || entry.conn !== conn || !msg || typeof msg !== "object") return;
    entry.lastSeen = Date.now();
    handleMessage(entry, msg);
  });
  conn.on("close", () => dropConn(conn));
  conn.on("error", () => dropConn(conn));
}

function dropConn(conn) {
  const entry = conns.get(conn.peer);
  if (!entry || entry.conn !== conn) return;
  conns.delete(conn.peer);
  try { conn.close(); } catch { /* already closed */ }
  const player = game.players.find((p) => p.connPeer === conn.peer);
  if (!player) return;
  player.connected = false;
  player.connPeer = null;
  clearTimeout(player.graceTimer);
  player.graceTimer = setTimeout(() => graceExpired(player), GRACE_MS);
  update();
}

function graceExpired(player) {
  if (player.connected || !game.players.includes(player)) return;
  if (game.phase === "lobby") {
    game.players = game.players.filter((p) => p !== player);
    update();
  } else if (game.phase === "question" || game.phase === "reveal") {
    game.phase = "interrupted";
    game.interruptedBy = player.name;
    update();
  }
}

setInterval(() => {
  const now = Date.now();
  for (const entry of [...conns.values()]) {
    if (now - entry.lastSeen > TIMEOUT_MS) dropConn(entry.conn);
    else send(entry.conn, { type: "ping" });
  }
}, PING_MS);

function send(conn, msg) {
  try { if (conn.open) conn.send(msg); } catch { /* ignore; heartbeat will catch it */ }
}

// ---------- Messages from phones ----------

function handleMessage(entry, msg) {
  if (msg.type === "hello") {
    const clientId = String(msg.clientId || "");
    const player = clientId && game.players.find((p) => p.clientId === clientId);
    entry.clientId = clientId;
    if (player) attach(player, entry); // a phone coming back after a blip
    sendState(entry);
    if (player) render();
  } else if (msg.type === "join") {
    handleJoin(entry, msg);
  } else if (msg.type === "answer") {
    handleAnswer(entry, msg);
  }
}

function attach(player, entry) {
  if (player.connPeer && player.connPeer !== entry.conn.peer) {
    const old = conns.get(player.connPeer);
    if (old) { conns.delete(player.connPeer); try { old.conn.close(); } catch { /* ignore */ } }
  }
  clearTimeout(player.graceTimer);
  player.connPeer = entry.conn.peer;
  player.connected = true;
}

function handleJoin(entry, msg) {
  const clientId = entry.clientId;
  const fail = (message) => send(entry.conn, { type: "joinError", message });
  if (!clientId) return fail("Something went wrong. Please reload this page.");
  if (game.players.some((p) => p.clientId === clientId)) return sendState(entry);
  if (game.phase !== "lobby") return fail("This game has already started. Wait for the host to start a new one.");
  const name = cleanName(msg.name);
  if (!name) return fail("Please type your name first.");
  if (game.players.length >= MAX_PLAYERS) return fail(`This game is full — it already has ${MAX_PLAYERS} players.`);
  if (game.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return fail(`Someone is already called “${name}”. Try adding an initial.`);
  }
  game.players.push({
    clientId, name, score: 0, answer: null, lastCorrect: false,
    connPeer: entry.conn.peer, connected: true, graceTimer: null,
  });
  update();
}

function handleAnswer(entry, msg) {
  const player = game.players.find((p) => p.clientId === entry.clientId);
  const choice = msg.choice;
  const valid = player && game.phase === "question" && msg.qIndex === game.qIndex &&
    player.answer === null && Number.isInteger(choice) && choice >= 0 && choice < 4;
  if (!valid) return sendState(entry);
  player.answer = choice;
  if (game.players.every((p) => p.answer !== null)) reveal();
  update();
}

// ---------- Game flow ----------

function pickQuestions() {
  return shuffle(QUESTION_BANK).slice(0, QUESTIONS_PER_GAME).map(({ q, a }) => {
    const options = shuffle(a);
    return { text: q, options, correct: options.indexOf(a[0]) };
  });
}

function currentQuestion() { return game.questions[game.qIndex]; }

function askQuestion(index) {
  game.qIndex = index;
  game.players.forEach((p) => { p.answer = null; p.lastCorrect = false; });
  game.phase = "question";
}

function reveal() {
  const q = currentQuestion();
  game.players.forEach((p) => {
    p.lastCorrect = p.answer === q.correct;
    if (p.lastCorrect) p.score += 1;
  });
  game.phase = "reveal";
}

function canStart() {
  return game.players.length >= MIN_PLAYERS && game.players.every((p) => p.connected);
}

function startGame() {
  if (game.phase !== "lobby" || !canStart()) return;
  game.questions = pickQuestions();
  game.players.forEach((p) => { p.score = 0; });
  askQuestion(0);
  update();
}

function next() {
  if (game.phase !== "reveal") return;
  if (game.qIndex < game.questions.length - 1) askQuestion(game.qIndex + 1);
  else game.phase = "final";
  update();
}

function newGame() {
  game.players.forEach((p) => clearTimeout(p.graceTimer));
  game = freshGame();
  update();
}

function scoreboard() {
  return game.players
    .map((p) => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
}

// ---------- State sent to each phone ----------

function stateFor(clientId) {
  const me = game.players.find((p) => p.clientId === clientId);
  const s = {
    type: "state",
    phase: game.phase,
    joined: !!me,
    name: me ? me.name : null,
    lobbyNames: game.players.map((p) => p.name),
  };
  if (game.phase === "question" || game.phase === "reveal") {
    const q = currentQuestion();
    Object.assign(s, {
      qIndex: game.qIndex,
      qNum: game.qIndex + 1,
      total: game.questions.length,
      question: q.text,
      options: q.options,
      yourAnswer: me ? me.answer : null,
      answeredCount: game.players.filter((p) => p.answer !== null).length,
    });
  }
  if (game.phase === "reveal") {
    // The correct answer only ever leaves this tab once everyone has answered.
    Object.assign(s, { correct: currentQuestion().correct, youWereRight: me ? me.lastCorrect : false, scoreboard: scoreboard() });
  }
  if (game.phase === "final") {
    const sb = scoreboard();
    Object.assign(s, { scoreboard: sb, winners: winnersOf(sb), total: game.questions.length });
  }
  if (game.phase === "interrupted") s.interruptedBy = game.interruptedBy;
  return s;
}

function sendState(entry) {
  send(entry.conn, stateFor(entry.clientId));
}

function update() {
  render();
  for (const entry of conns.values()) sendState(entry);
}

// ---------- Host screen ----------

function showBanner(text) {
  banner.textContent = text;
  banner.hidden = !text;
}

function qrSvg(text) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let path = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c},${r}h1v1h-1z`;
  }
  return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" role="img" aria-label="QR code to join the game">
    <rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${path}" fill="#2b2140"/></svg>`;
}

// In the lobby, empty slots show how many more can join; during a game only real players appear.
function playerChips(statusFor, slots = game.players.length) {
  const chips = [];
  for (let i = 0; i < slots; i++) {
    const p = game.players[i];
    if (!p) {
      chips.push(`<div class="chip waiting">${i < MIN_PLAYERS ? `Waiting for player ${i + 1}…` : `Player ${i + 1} (optional)`}</div>`);
      continue;
    }
    const [cls, status] = p.connected ? statusFor(p) : ["away", "Reconnecting…"];
    chips.push(`<div class="chip filled ${cls}"><span>${esc(p.name)}</span><span class="status">${status}</span></div>`);
  }
  return `<div class="players">${chips.join("")}</div>`;
}

function lobbyHint(count, ready) {
  if (count < MIN_PLAYERS) {
    const more = MIN_PLAYERS - count;
    return `Waiting for at least ${more} more player${more === 1 ? "" : "s"}…`;
  }
  if (!ready) return "Waiting for everyone to reconnect…";
  if (count === MAX_PLAYERS) return "The game is full. Press start when you're ready!";
  return `Press start when you're ready, or wait for up to ${MAX_PLAYERS - count} more to join.`;
}

function optionsHtml(q, revealed) {
  return `<div class="options ${revealed ? "revealed" : ""}">${q.options.map((opt, i) => `
    <div class="option ${revealed && i === q.correct ? "correct" : ""}">
      <span class="letter">${LETTERS[i]}</span><span>${esc(opt)}</span>
      ${revealed && i === q.correct ? '<span class="tag">✓ Correct</span>' : ""}
    </div>`).join("")}</div>`;
}

function render() {
  if (!peer || !peer.id) return;
  const phase = game.phase;

  if (phase === "lobby") {
    const count = game.players.length;
    const ready = canStart();
    app.innerHTML = `
      <div class="card">
        <div class="lobby-grid">
          <div class="qr">${qrSvg(joinUrl())}</div>
          <div>
            <h1>Scan to join!</h1>
            <p class="big">Players: point your phone camera at the QR code, then type your name.</p>
            <p class="muted">Or open <span class="join-url">${esc(joinUrl())}</span></p>
            <p class="muted">Game code: <span class="code">${code}</span></p>
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Players (${count} of up to ${MAX_PLAYERS})</h2>
        ${playerChips(() => ["", "Ready ✓"], MAX_PLAYERS)}
        <div class="host-controls">
          <button class="btn" id="start" ${ready ? "" : "disabled"}>${ready ? `Start the quiz with ${count} players` : "Start the quiz"}</button>
          <p class="hint muted">${lobbyHint(count, ready)}</p>
        </div>
      </div>`;
    document.getElementById("start").onclick = startGame;
  }

  else if (phase === "question") {
    const q = currentQuestion();
    const answered = game.players.filter((p) => p.answer !== null).length;
    app.innerHTML = `
      <div class="card">
        <span class="progress">Question ${game.qIndex + 1} of ${game.questions.length}</span>
        <div class="question-text">${esc(q.text)}</div>
        ${optionsHtml(q, false)}
      </div>
      <div class="card">
        <h2>${answered} of ${game.players.length} players have answered</h2>
        ${playerChips((p) => p.answer !== null ? ["done", "Answered ✓"] : ["", "Thinking…"])}
        <p class="hint muted" style="margin-top:16px">The answer appears automatically once everyone has answered.</p>
      </div>`;
  }

  else if (phase === "reveal") {
    const q = currentQuestion();
    const last = game.qIndex === game.questions.length - 1;
    const results = game.players.map((p) =>
      `<li><span class="sb-name">${esc(p.name)} — ${p.lastCorrect ? "✓ right" : "✗ wrong"} (${LETTERS[p.answer]})</span><span class="sb-score">${p.score}</span></li>`
    );
    app.innerHTML = `
      <div class="reveal-grid">
        <div class="card">
          <span class="progress">Question ${game.qIndex + 1} of ${game.questions.length}</span>
          <div class="question-text">${esc(q.text)}</div>
          ${optionsHtml(q, true)}
        </div>
        <div class="card">
          <h2>Scoreboard</h2>
          ${scoreboardHtml(scoreboard())}
          <h3 style="margin-top:20px">This round</h3>
          <ul class="scoreboard">${results.join("")}</ul>
          <div class="host-controls">
            <button class="btn" id="next">${last ? "See the final results" : "Next question →"}</button>
          </div>
        </div>
      </div>`;
    document.getElementById("next").onclick = next;
  }

  else if (phase === "final") {
    const sb = scoreboard();
    const winners = winnersOf(sb);
    const headline = winners.length === 1
      ? `${esc(winners[0])} wins!`
      : `It's a tie! ${esc(joinNames(winners))} share the win!`;
    app.innerHTML = `
      <div class="card center">
        <div class="trophy">🏆</div>
        <h1>${headline}</h1>
        <p class="big muted">With ${sb[0].score} out of ${game.questions.length}</p>
      </div>
      <div class="card">
        <h2>Final scores</h2>
        ${scoreboardHtml(sb)}
        <div class="host-controls">
          <button class="btn" id="again">Play again</button>
          <p class="hint muted">Starts a fresh game with new questions. Players tap “Join” on their phones again.</p>
        </div>
      </div>`;
    document.getElementById("again").onclick = newGame;
  }

  else if (phase === "interrupted") {
    app.innerHTML = `
      <div class="card center">
        <div class="trophy">⚠️</div>
        <h1>Game interrupted</h1>
        <p class="big">${esc(game.interruptedBy)}'s phone lost its connection, so this game can't continue.</p>
        <p class="muted">Check their phone is on the Wi-Fi and the quiz page is open. Then start a new game — scores start again from zero.</p>
        <div class="host-controls">
          <button class="btn" id="restart">Start a new game</button>
        </div>
      </div>`;
    document.getElementById("restart").onclick = newGame;
  }
}

window.addEventListener("beforeunload", (e) => {
  if (game.players.length && game.phase !== "final") { e.preventDefault(); e.returnValue = ""; }
});

keepAwake();
startPeer();
