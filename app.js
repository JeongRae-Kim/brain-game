import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, update, get, onValue, off, onDisconnect, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";
import {
  GAMES, SPEED_TRIALS, SPEED_PENALTY_MS, HINT_PENALTY_MS, MAX_HINTS, LEVEL_MIN, LEVEL_MAX,
  makeSpeedPuzzle, makeMatchPuzzle, suggestLevel, fmtTime, rankResults
} from "./games.js";
import { makeSudoku, SUDOKU_LEVELS, PEERS, ROW, COL } from "./sudoku.js";
import { playCrossword, playAnagram, playWordle } from "./ui-english.js";
import { LEVEL_NAMES } from "./words.js";

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
let selectedGame = null;
let levelOverride = {};       // 방장이 직접 바꾼 단계 (다음 시작에만 적용)
let sudokuLevel = "easy";
let englishLevel = Number(store.get("bg-eng") || 1);
let keyHandler = null;        // 실제 키보드 입력 (PC)
document.addEventListener("keydown", e => { if (keyHandler) keyHandler(e); });
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
  if (iAmHost) renderLevelPanel();
  renderBoard($("last-board"), latestResults);
  $("last-result").hidden = !round || Object.keys(latestResults).length === 0;
  if (round) $("last-result-title").textContent = `${GAMES[round.game]?.title || ""} ${levelText(round)} 순위`;
}

for (const b of document.querySelectorAll(".choice")) {
  b.addEventListener("click", () => {
    selectedGame = b.dataset.game;
    for (const x of document.querySelectorAll(".choice")) x.classList.toggle("selected", x === b);
    $("start-btn").disabled = false;
    renderLevelPanel();
  });
}

// ---------- 단계 ----------
function plannedLevel(game) {
  const s = suggestLevel(game, round, latestResults);
  if (levelOverride[game] != null) return { ...s, level: levelOverride[game], manual: true };
  return s;
}
const stars = n => "★".repeat(n) + "☆".repeat(LEVEL_MAX - n);

function renderLevelPanel() {
  const leveled = selectedGame && GAMES[selectedGame].leveled;
  $("level-row").hidden = !leveled;
  $("sudoku-row").hidden = selectedGame !== "sudoku";
  $("eng-row").hidden = !(selectedGame && GAMES[selectedGame].english);
  for (const b of document.querySelectorAll("[data-el]")) b.classList.toggle("selected", Number(b.dataset.el) === englishLevel);
  if (leveled) {
    const p = plannedLevel(selectedGame);
    $("level-label").textContent = `${stars(p.level)} ${p.level}단계`;
    $("level-note").textContent = p.manual ? "방장이 직접 정한 단계예요"
      : p.change > 0 ? `지난 판이 빨라서 한 단계 올렸어요 (중간 기록 ${fmtTime(p.median)})`
      : p.change < 0 ? `지난 판이 오래 걸려서 한 단계 내렸어요 (중간 기록 ${fmtTime(p.median)})`
      : p.median != null ? `지난 판 중간 기록 ${fmtTime(p.median)} · 단계 유지` : "기록이 빨라지면 자동으로 어려워져요";
    $("level-down").disabled = p.level <= LEVEL_MIN;
    $("level-up").disabled = p.level >= LEVEL_MAX;
  }
  for (const b of document.querySelectorAll("[data-sl]")) b.classList.toggle("selected", b.dataset.sl === sudokuLevel);
}
function bumpLevel(d) {
  const cur = plannedLevel(selectedGame).level;
  levelOverride[selectedGame] = Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, cur + d));
  renderLevelPanel();
}
$("level-down").addEventListener("click", () => bumpLevel(-1));
$("level-up").addEventListener("click", () => bumpLevel(1));
for (const b of document.querySelectorAll("[data-el]")) {
  b.addEventListener("click", () => { englishLevel = Number(b.dataset.el); store.set("bg-eng", englishLevel); renderLevelPanel(); });
}
for (const b of document.querySelectorAll("[data-sl]")) {
  b.addEventListener("click", () => { sudokuLevel = b.dataset.sl; renderLevelPanel(); });
}

function levelText(r) {
  if (r.game === "sudoku") return SUDOKU_LEVELS[r.level]?.label || "";
  if (GAMES[r.game]?.english) return `${r.level}등급(${LEVEL_NAMES[r.level] || ""})`;
  return r.level ? `${r.level}단계` : "";
}

$("start-btn").addEventListener("click", async () => {
  if (hostUid !== uid || !selectedGame) return;
  const id = Date.now().toString(36);
  const levels = { ...(round?.levels || {}) };
  let level;
  if (GAMES[selectedGame].leveled) {
    level = plannedLevel(selectedGame).level;
    levels[selectedGame] = level;
  } else if (GAMES[selectedGame].english) {
    level = englishLevel;
  } else {
    level = sudokuLevel;
  }
  try {
    await set(ref(db, `rooms/${ROOM}/round`), {
      id,
      game: selectedGame,
      level,
      levels,
      seed: Math.floor(Math.random() * 2 ** 31),
      startAt: now() + COUNTDOWN_MS,
      by: uid
    });
    levelOverride = {};
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
  $("countdown-game").textContent = `${GAMES[r.game]?.title || ""} · ${levelText(r)}`;
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
  $("game-controls").textContent = "";
  $("game-grid").className = "grid";
  const t0 = performance.now();
  let penalty = 0;
  clearInterval(gameTimer);
  gameTimer = setInterval(() => {
    $("game-timer").textContent = fmtTime(performance.now() - t0 + penalty);
  }, 100);

  const finish = (detail) => {
    clearInterval(gameTimer);
    keyHandler = null;
    const timeMs = Math.round(performance.now() - t0 + penalty);
    set(myResultRef, { name: myName, timeMs, ...detail, finishedAt: serverTimestamp() });
    $("my-result").textContent = `🎉 완료! ${fmtTime(timeMs)}`;
    show("view-result");
  };

  const addPenalty = ms => { penalty += ms; };
  if (r.game === "match") playMatch(r.seed, r.level, finish);
  else if (r.game === "sudoku") playSudoku(r.seed, r.level, addPenalty, finish);
  else if (GAMES[r.game]?.english) {
    const ctx = {
      seed: r.seed, level: r.level, custom: null,
      grid: $("game-grid"), controls: $("game-controls"), prompt: $("game-prompt"), progress: $("game-progress"),
      toast, addPenalty, finish, setKeys: fn => { keyHandler = fn; }
    };
    ({ cross: playCrossword, anagram: playAnagram, wordle: playWordle })[r.game](ctx);
  }
  else playSpeed(r.seed, r.level, addPenalty, finish);
}

// ---------- 게임 1: 빨리 찾기 ----------
function playSpeed(seed, level, addPenalty, finish) {
  const trials = makeSpeedPuzzle(seed, level || 3);
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
function playMatch(seed, level, finish) {
  const { cards, cols, pairs } = makeMatchPuzzle(seed, level || 2);
  const grid = $("game-grid");
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.textContent = "";
  $("game-prompt").textContent = "같은 그림 두 장을 찾으세요";
  let open = [], matched = 0, moves = 0, lock = false;
  $("game-progress").textContent = `0 / ${pairs}쌍`;

  cards.forEach(face => {
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
        $("game-progress").textContent = `${matched} / ${pairs}쌍`;
        if (matched === pairs) setTimeout(() => finish({ moves }), 300);
      } else {
        lock = true;
        setTimeout(() => { x.b.classList.add("back"); y.b.classList.add("back"); lock = false; }, 700);
      }
    });
    grid.appendChild(b);
  });
}

// ---------- 게임 3: 스도쿠 ----------
function playSudoku(seed, level, addPenalty, finish) {
  const { puzzle, solution } = makeSudoku(seed, level || "easy");
  const vals = puzzle.slice();
  const given = puzzle.map(v => v !== 0);
  const hinted = new Array(81).fill(false);
  const notes = Array.from({ length: 81 }, () => new Set());
  let sel = given.indexOf(false);
  let memo = false, hints = 0, done = false;

  const grid = $("game-grid");
  grid.className = "sudoku";
  grid.style.gridTemplateColumns = "";
  grid.textContent = "";
  $("game-prompt").textContent = `스도쿠 · ${SUDOKU_LEVELS[level]?.label || ""}`;

  const cells = [];
  for (let i = 0; i < 81; i++) {
    const b = document.createElement("button");
    b.className = "sd";
    if (COL(i) % 3 === 2 && COL(i) < 8) b.classList.add("br");
    if (ROW(i) % 3 === 2 && ROW(i) < 8) b.classList.add("bb");
    b.addEventListener("click", () => { sel = i; render(); });
    grid.appendChild(b);
    cells.push(b);
  }

  // 숫자판 + 도구
  const ctr = $("game-controls");
  const pad = document.createElement("div");
  pad.className = "pad";
  const padBtns = [];
  for (let n = 1; n <= 9; n++) {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = n;
    b.addEventListener("click", () => press(n));
    pad.appendChild(b);
    padBtns.push(b);
  }
  const tools = document.createElement("div");
  tools.className = "tools";
  const mk = (txt, fn) => {
    const b = document.createElement("button");
    b.className = "btn";
    b.textContent = txt;
    b.addEventListener("click", fn);
    tools.appendChild(b);
    return b;
  };
  const memoBtn = mk("✏️ 메모 끔", () => { memo = !memo; render(); });
  mk("⌫ 지우기", () => {
    if (sel < 0 || given[sel] || hinted[sel]) return;
    vals[sel] = 0;
    notes[sel].clear();
    render();
  });
  const hintBtn = mk("", useHint);
  ctr.append(pad, tools);

  function press(n) {
    if (done || sel < 0 || given[sel] || hinted[sel]) return;
    if (memo) {
      if (vals[sel]) return;
      notes[sel].has(n) ? notes[sel].delete(n) : notes[sel].add(n);
    } else {
      vals[sel] = vals[sel] === n ? 0 : n;
      notes[sel].clear();
      if (vals[sel]) for (const p of PEERS[sel]) notes[p].delete(n);
    }
    render();
    check();
  }

  function useHint() {
    if (done) return;
    if (hints >= MAX_HINTS) { toast(`힌트는 최대 ${MAX_HINTS}개까지예요`); return; }
    let i = sel;
    if (i < 0 || given[i] || hinted[i] || vals[i] === solution[i]) {
      i = vals.findIndex((v, k) => !given[k] && v !== solution[k]);
    }
    if (i < 0) return;
    vals[i] = solution[i];
    hinted[i] = true;
    notes[i].clear();
    for (const p of PEERS[i]) notes[p].delete(solution[i]);
    hints++;
    addPenalty(HINT_PENALTY_MS);
    toast("힌트 사용 · +30초");
    sel = i;
    render();
    check();
  }

  function check() {
    if (vals.every((v, i) => v === solution[i])) {
      done = true;
      setTimeout(() => finish({ hints }), 400);
    } else if (vals.every(v => v)) {
      toast("다 채웠지만 틀린 칸이 있어요");
    }
  }

  function conflicts() {
    const bad = new Set();
    for (let i = 0; i < 81; i++) {
      if (!vals[i]) continue;
      for (const p of PEERS[i]) if (vals[p] === vals[i]) { bad.add(i); bad.add(p); }
    }
    return bad;
  }

  function render() {
    const bad = conflicts();
    const sv = sel >= 0 ? vals[sel] : 0;
    for (let i = 0; i < 81; i++) {
      const b = cells[i];
      b.classList.toggle("given", given[i]);
      b.classList.toggle("hinted", hinted[i]);
      b.classList.toggle("sel", i === sel);
      b.classList.toggle("peer", sel >= 0 && i !== sel && PEERS[sel].includes(i));
      b.classList.toggle("same", sv > 0 && i !== sel && vals[i] === sv);
      b.classList.toggle("conflict", bad.has(i) && !given[i]);
      b.textContent = "";
      if (vals[i]) {
        b.textContent = vals[i];
      } else if (notes[i].size) {
        const g = document.createElement("div");
        g.className = "notes";
        for (let n = 1; n <= 9; n++) {
          const s = document.createElement("span");
          s.textContent = notes[i].has(n) ? n : "";
          g.appendChild(s);
        }
        b.appendChild(g);
      }
    }
    const counts = new Array(10).fill(0);
    vals.forEach(v => counts[v]++);
    padBtns.forEach((b, k) => b.classList.toggle("done", counts[k + 1] >= 9));
    memoBtn.textContent = memo ? "✏️ 메모 켬" : "✏️ 메모 끔";
    memoBtn.classList.toggle("toggle", true);
    memoBtn.classList.toggle("on", memo);
    hintBtn.textContent = `💡 힌트 ${MAX_HINTS - hints}`;
    hintBtn.disabled = hints >= MAX_HINTS;
    $("game-progress").textContent = `빈칸 ${vals.filter(v => !v).length}개`;
  }
  render();
}

// ---------- 순위표 ----------
function renderBoard(el, results) {
  el.textContent = "";
  const { done, playing } = rankResults(results);
  const medals = ["🥇", "🥈", "🥉"];
  done.forEach((r, k) => {
    const extra = (r.hints ? ` 💡${r.hints}` : "") + (r.wrong ? ` ✗${r.wrong}` : "");
    el.appendChild(row(medals[k] || `${k + 1}위`, r.name, fmtTime(r.timeMs) + extra, r.uid === uid));
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

