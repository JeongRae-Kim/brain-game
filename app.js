import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, update, get, onValue, off, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";
import {
  GAMES, SPEED_TRIALS, SPEED_PENALTY_MS, makeSpeedPuzzle, makeMatchPuzzle, fmtTime, rankResults
} from "./games.js";

// ---------- 기본 ----------
const params = new URLSearchParams(location.search);
const ROOM = (params.get("room") || "family").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30) || "family";
const COUNTDOWN_MS = 5000;
const JOIN_WINDOW_MS = 10 * 60 * 1000; // 시작 후 10분까지는 늦게 와도 참여 가능

const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } }
};

function show(view) {
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== view;
}
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2200);
}

let db, uid, myName = "";
let serverOffset = 0;
const now = () => Date.now() + serverOffset;

let players = {};
let hostUid = null;
let round = null;
let selectedGame = "speed";
let activeRoundId = null;     // 내가 참여 중이거나 참여한 판
let resultsRef = null;
let latestResults = {};
let countdownTimer = null;
let gameTimer = null;

$("room-label").textContent = "방: " + ROOM;

// ---------- 시작 ----------
main().catch(err => {
  console.error(err);
  show("view-setup");
  $("view-setup").querySelector("p:last-child").textContent = "연결에 실패했어요. 잠시 후 새로고침 해 주세요.";
});

async function main() {
  if (!firebaseConfig.apiKey || !firebaseConfig.databaseURL) { show("view-setup"); return; }
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  const auth = getAuth(app);
  await signInAnonymously(auth);
  uid = auth.currentUser.uid;

  onValue(ref(db, ".info/serverTimeOffset"), s => { serverOffset = s.val() || 0; });

  myName = store.get("bg-name") || "";
  if (myName) join(); else askName();
}

function askName() {
  show("view-name");
  $("name-input").value = myName;
  $("name-input").focus();
}

$("name-form").addEventListener("submit", e => {
  e.preventDefault();
  const n = $("name-input").value.trim().slice(0, 10);
  if (!n) return;
  myName = n;
  store.set("bg-name", n);
  if (uid) { update(ref(db, `rooms/${ROOM}/players/${uid}`), { name: n }); }
  if (!join.done) join(); else show("view-lobby");
});

// ---------- 방 참여 ----------
function join() {
  join.done = true;
  const base = `rooms/${ROOM}`;
  const meRef = ref(db, `${base}/players/${uid}`);

  onValue(ref(db, ".info/connected"), async s => {
    if (!s.val()) return;
    await onDisconnect(ref(db, `${base}/players/${uid}/online`)).set(false);
    await update(meRef, { name: myName, online: true, seen: serverTimestamp() });
  });

  onValue(ref(db, `${base}/players`), s => { players = s.val() || {}; renderLobby(); });
  onValue(ref(db, `${base}/host`), s => {
    hostUid = s.val();
    if (!hostUid) claimHost(true);
    renderLobby();
  });
  onValue(ref(db, `${base}/round`), s => { round = s.val(); onRound(); });

  show("view-lobby");
}

function hostOnline() {
  return hostUid && players[hostUid] && players[hostUid].online === true;
}

async function claimHost(silent) {
  try {
    await set(ref(db, `rooms/${ROOM}/host`), uid);
    await onDisconnect(ref(db, `rooms/${ROOM}/host`)).remove();
    if (!silent) toast("이제 방장입니다");
  } catch {
    if (!silent) toast("방장을 맡을 수 없어요");
  }
}
$("claim-host-btn").addEventListener("click", () => claimHost(false));

// ---------- 대기실 화면 ----------
function renderLobby() {
  const list = $("player-list");
  list.textContent = "";
  const online = Object.entries(players).filter(([, p]) => p.online);
  $("online-count").textContent = `(${online.length}명)`;
  for (const [id, p] of online) {
    const li = document.createElement("li");
    li.textContent = (id === hostUid ? "👑 " : "") + (p.name || "손님") + (id === uid ? " (나)" : "");
    if (id === uid) li.className = "me";
    list.appendChild(li);
  }
  const iAmHost = hostUid === uid;
  $("host-panel").hidden = !iAmHost;
  $("guest-panel").hidden = iAmHost;
  $("claim-host-btn").hidden = iAmHost || hostOnline();
  renderBoard($("last-board"), latestResults);
  $("last-result").hidden = !round || Object.keys(latestResults).length === 0;
  if (round) $("last-result-title").textContent = (GAMES[round.game]?.title || "") + " 순위";
}

for (const b of document.querySelectorAll(".choice")) {
  b.addEventListener("click", () => {
    selectedGame = b.dataset.game;
    for (const x of document.querySelectorAll(".choice")) x.classList.toggle("selected", x === b);
    $("start-btn").disabled = false;
  });
}

$("start-btn").addEventListener("click", async () => {
  if (hostUid !== uid) return;
  const id = Date.now().toString(36);
  try {
    await set(ref(db, `rooms/${ROOM}/round`), {
      id,
      game: selectedGame,
      seed: Math.floor(Math.random() * 2 ** 31),
      startAt: now() + COUNTDOWN_MS,
      by: uid
    });
  } catch {
    toast("시작하지 못했어요. 다시 눌러 주세요");
  }
});

$("share-btn").addEventListener("click", async () => {
  const url = location.origin + location.pathname + "?room=" + ROOM;
  try {
    if (navigator.share) { await navigator.share({ title: "가족 두뇌게임", url }); return; }
  } catch { /* 취소 */ }
  try { await navigator.clipboard.writeText(url); toast("링크를 복사했어요"); }
  catch { prompt("이 링크를 복사하세요", url); }
});

$("rename-btn").addEventListener("click", askName);
$("back-btn").addEventListener("click", () => { show("view-lobby"); renderLobby(); });

// ---------- 판 진행 ----------
async function onRound() {
  if (!round) { latestResults = {}; renderLobby(); return; }

  // 결과 구독 (이 판 기준)
  if (resultsRef) off(resultsRef);
  resultsRef = ref(db, `rooms/${ROOM}/results/${round.id}`);
  onValue(resultsRef, s => {
    latestResults = s.val() || {};
    renderBoard($("result-board"), latestResults);
    renderLobby();
  });

  if (round.id === activeRoundId) return;
  if (now() > round.startAt + JOIN_WINDOW_MS) { renderLobby(); return; }

  // 이미 끝낸 판이면 다시 하지 않음
  const mine = await get(ref(db, `rooms/${ROOM}/results/${round.id}/${uid}`));
  if (mine.exists() && typeof mine.val().timeMs === "number") { activeRoundId = round.id; return; }

  activeRoundId = round.id;
  startCountdown(round);
}

function startCountdown(r) {
  clearInterval(countdownTimer);
  show("view-countdown");
  $("countdown-game").textContent = GAMES[r.game]?.title || "";
  const tick = () => {
    const left = r.startAt - now();
    if (left <= 0) {
      clearInterval(countdownTimer);
      playRound(r);
      return;
    }
    $("countdown-num").textContent = Math.ceil(left / 1000);
  };
  tick();
  countdownTimer = setInterval(tick, 100);
}

function playRound(r) {
  const myResultRef = ref(db, `rooms/${ROOM}/results/${r.id}/${uid}`);
  set(myResultRef, { name: myName, playing: true });

  show("view-game");
  const t0 = performance.now();
  let penalty = 0;
  clearInterval(gameTimer);
  gameTimer = setInterval(() => {
    $("game-timer").textContent = fmtTime(performance.now() - t0 + penalty);
  }, 100);

  const finish = (detail) => {
    clearInterval(gameTimer);
    const timeMs = Math.round(performance.now() - t0 + penalty);
    set(myResultRef, { name: myName, timeMs, ...detail, finishedAt: serverTimestamp() });
    $("my-result").textContent = `🎉 완료! ${fmtTime(timeMs)}`;
    show("view-result");
  };

  if (r.game === "match") playMatch(r.seed, finish);
  else playSpeed(r.seed, ms => { penalty += ms; }, finish);
}

// ---------- 게임 1: 빨리 찾기 ----------
function playSpeed(seed, addPenalty, finish) {
  const trials = makeSpeedPuzzle(seed);
  const grid = $("game-grid");
  let i = 0, wrong = 0;

  const render = () => {
    const t = trials[i];
    $("game-progress").textContent = `${i + 1} / ${SPEED_TRIALS}`;
    $("game-prompt").textContent = `${t.target} 를 찾아 누르세요`;
    grid.style.gridTemplateColumns = `repeat(${t.cols}, 1fr)`;
    grid.textContent = "";
    for (const e of t.cells) {
      const b = document.createElement("button");
      b.className = "cell";
      b.textContent = e;
      b.addEventListener("click", () => {
        if (e === t.target) {
          i++;
          if (i >= SPEED_TRIALS) finish({ wrong });
          else render();
        } else {
          wrong++;
          addPenalty(SPEED_PENALTY_MS);
          b.classList.remove("wrong");
          void b.offsetWidth;
          b.classList.add("wrong");
        }
      });
      grid.appendChild(b);
    }
  };
  render();
}

// ---------- 게임 2: 짝맞추기 ----------
function playMatch(seed, finish) {
  const cards = makeMatchPuzzle(seed);
  const grid = $("game-grid");
  grid.style.gridTemplateColumns = "repeat(4, 1fr)";
  grid.textContent = "";
  $("game-prompt").textContent = "같은 그림 두 장을 찾으세요";
  let open = [], matched = 0, moves = 0, lock = false;
  $("game-progress").textContent = `0 / 8쌍`;

  cards.forEach((face, idx) => {
    const b = document.createElement("button");
    b.className = "cell back";
    b.textContent = face;
    b.addEventListener("click", () => {
      if (lock || !b.classList.contains("back")) return;
      b.classList.remove("back");
      open.push({ b, face });
      if (open.length < 2) return;
      moves++;
      const [x, y] = open;
      open = [];
      if (x.face === y.face) {
        x.b.classList.add("matched"); y.b.classList.add("matched");
        matched++;
        $("game-progress").textContent = `${matched} / 8쌍`;
        if (matched === 8) setTimeout(() => finish({ moves }), 300);
      } else {
        lock = true;
        setTimeout(() => { x.b.classList.add("back"); y.b.classList.add("back"); lock = false; }, 700);
      }
    });
    grid.appendChild(b);
  });
}

// ---------- 순위표 ----------
function renderBoard(el, results) {
  el.textContent = "";
  const { done, playing } = rankResults(results);
  const medals = ["🥇", "🥈", "🥉"];
  done.forEach((r, k) => {
    el.appendChild(row(medals[k] || `${k + 1}위`, r.name, fmtTime(r.timeMs), r.uid === uid));
  });
  for (const r of playing) {
    const li = row("", r.name, "푸는 중…", r.uid === uid);
    li.querySelector(".time").className = "time playing";
    el.appendChild(li);
  }
}
function row(rank, name, time, me) {
  const li = document.createElement("li");
  if (me) li.className = "me";
  for (const [cls, txt] of [["rank", rank], ["who", name || "손님"], ["time", time]]) {
    const s = document.createElement("span");
    s.className = cls;
    s.textContent = txt;
    li.appendChild(s);
  }
  return li;
}

