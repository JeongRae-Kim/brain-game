import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase, ref, set, update, get, onValue, off, onDisconnect, serverTimestamp,
  push, query, limitToLast
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./config.js";
import {
  GAMES, SPEED_TRIALS, SPEED_PENALTY_MS, HINT_PENALTY_MS, MAX_HINTS, LEVEL_MIN, LEVEL_MAX,
  makeSpeedPuzzle, makeMatchPuzzle, suggestLevel, fmtTime, rankResults
} from "./games.js";
import { makeSudoku, SUDOKU_LEVELS, PEERS, ROW, COL } from "./sudoku.js";
import { playCrossword, playAnagram, playWordle, playIdiom } from "./ui-english.js";
import { LEVEL_NAMES, WORDS } from "./words.js";
import { makeCrossword, makeAnagram, makeWordle, engList, ENG_MIN } from "./english.js";
import { IDIOMS, IDIOM_LEVELS, IDIOM_MIN, idiomList, parseIdioms, makeIdiomCross } from "./idioms.js";

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
let idiomLevel = store.get("bg-idiom") || "easy";
let customRaw = {};           // 관리 화면에서 바꾼 단어 목록 (원문)
let custom = {};              // 위 목록을 읽어 둔 것
let usedWords = {};           // 이 방에서 이미 나온 단어
let handoverTo = null;
let keyHandler = null;        // 실제 키보드 입력 (PC)
document.addEventListener("keydown", e => {
  if (e.target.closest?.("input, textarea, select")) return;   // 채팅·입력칸 타자는 게임으로 보내지 않음
  if (keyHandler) keyHandler(e);
});
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
    const was = hostUid;
    hostUid = s.val();
    if (!hostUid) claimHost(true);
    else if (hostUid === uid && was !== uid) onDisconnect(ref(db, `rooms/${ROOM}/host`)).remove().catch(() => {});
    renderLobby();
  });
  onValue(ref(db, `${base}/round`), s => { round = s.val(); onRound(); });
  onValue(ref(db, `${base}/used`), s => { usedWords = s.val() || {}; });
  onValue(ref(db, "custom"), s => { customRaw = s.val() || {}; custom = parseCustom(customRaw); });
  startChat();

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

async function handover(id) {
  if (handoverTo !== id) {
    handoverTo = id;
    renderLobby();
    setTimeout(() => { if (handoverTo === id) { handoverTo = null; renderLobby(); } }, 4000);
    return;
  }
  handoverTo = null;
  try {
    await onDisconnect(ref(db, `rooms/${ROOM}/host`)).cancel();
    await set(ref(db, `rooms/${ROOM}/host`), id);
    toast(`${players[id]?.name || "손님"}님이 방장이 됐어요`);
  } catch { toast("방장을 넘기지 못했어요"); }
}

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
    if (hostUid === uid && id !== uid) {
      li.classList.add("tappable");
      if (handoverTo === id) { li.classList.add("pick"); li.textContent += " · 한 번 더 누르면 방장 넘김"; }
      li.addEventListener("click", () => handover(id));
    }
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
  $("idiom-row").hidden = selectedGame !== "idiom";
  for (const b of document.querySelectorAll("[data-il]")) b.classList.toggle("selected", b.dataset.il === idiomLevel);
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
for (const b of document.querySelectorAll("[data-il]")) {
  b.addEventListener("click", () => { idiomLevel = b.dataset.il; store.set("bg-idiom", idiomLevel); renderLevelPanel(); });
}
for (const b of document.querySelectorAll("[data-sl]")) {
  b.addEventListener("click", () => { sudokuLevel = b.dataset.sl; renderLevelPanel(); });
}

function levelText(r) {
  if (r.game === "sudoku") return SUDOKU_LEVELS[r.level]?.label || "";
  if (GAMES[r.game]?.english) return `${r.level}등급(${LEVEL_NAMES[r.level] || ""})`;
  if (r.game === "idiom") return IDIOM_LEVELS[r.level]?.label || "";
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
  } else if (selectedGame === "idiom") {
    level = idiomLevel;
  } else {
    level = sudokuLevel;
  }
  // 이미 나온 단어 빼기
  const bk = bankKey(selectedGame, level);
  let exclude = [], reset = false;
  if (bk) {
    const list = bankList(bk);
    const used = usedWords[bk] || {};
    exclude = list.map(x => x.w).filter(w => used[w]);
    if (list.length - exclude.length < (bk.startsWith("idiom") ? IDIOM_MIN : ENG_MIN)) { exclude = []; reset = true; }
  }
  const r = {
    id,
    game: selectedGame,
    level,
    levels,
    seed: Math.floor(Math.random() * 2 ** 31),
    startAt: now() + COUNTDOWN_MS,
    by: uid,
    exclude
  };
  try {
    await set(ref(db, `rooms/${ROOM}/round`), r);
    levelOverride = {};
    sysChat(`새 게임 시작: ${GAMES[r.game]?.title || ""} ${levelText(r)}`);
    if (bk) {
      const next = reset ? {} : { ...(usedWords[bk] || {}) };
      for (const w of puzzleWords(r)) next[w] = true;
      set(ref(db, `rooms/${ROOM}/used/${bk}`), next).catch(() => {});
    }
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

// ---------- 단어 목록 ----------
function bankKey(game, level) {
  if (GAMES[game]?.english) return "eng" + level;
  if (game === "idiom") return "idiom" + level;
  return null;
}
function bankList(key) {
  return key.startsWith("idiom") ? idiomList(key.slice(5), custom) : engList(Number(key.slice(3)), custom);
}
function optsFor(r) {
  return { custom, exclude: new Set(r.exclude || []) };
}
function puzzleWords(r) {
  const o = optsFor(r);
  if (r.game === "cross") return makeCrossword(r.seed, r.level, o).entries.map(e => e.word);
  if (r.game === "anagram") return makeAnagram(r.seed, r.level, o).map(x => x.word);
  if (r.game === "wordle") return makeWordle(r.seed, r.level, o).map(x => x.word);
  if (r.game === "idiom") return makeIdiomCross(r.seed, r.level, o).entries.map(e => e.word);
  return [];
}
function parseLines(text, isIdiom) {
  if (isIdiom) return parseIdioms(text);
  return String(text).split(/\r?\n|,/).map(s => s.trim()).filter(Boolean).map(s => {
    const i = s.search(/[:：]/);
    if (i < 0) return null;
    return { w: s.slice(0, i).trim().toUpperCase(), m: s.slice(i + 1).trim() };
  }).filter(x => x && /^[A-Z]{2,15}$/.test(x.w) && x.m);
}
function parseCustom(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) out[k] = parseLines(v, k.startsWith("idiom"));
  return out;
}

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
  if (mine.exists() && (typeof mine.val().timeMs === "number" || mine.val().gaveUp)) { activeRoundId = round.id; return; }

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
  $("game-grid").style.maxWidth = "";
  const t0 = performance.now();
  let penalty = 0;
  let limitEnd = null, onExpire = null;
  const timerEl = $("game-timer");
  timerEl.classList.remove("warn");
  $("game-progress").classList.remove("warn");
  clearInterval(gameTimer);
  gameTimer = setInterval(() => {
    const t = performance.now();
    if (limitEnd == null) { timerEl.textContent = fmtTime(t - t0 + penalty); return; }
    const left = Math.max(0, limitEnd - t);
    const m = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
    timerEl.textContent = `남은 ${m}:${String(sec).padStart(2, "0")}`;
    timerEl.classList.toggle("warn", left <= 30000);
    if (left <= 0 && onExpire) { const f = onExpire; onExpire = null; f(); }
  }, 200);
  const setLimit = (ms, fn) => { limitEnd = t0 + ms; onExpire = fn; };

  let ended = false;
  const end = () => {
    if (ended) return false;
    ended = true;
    clearInterval(gameTimer);
    keyHandler = null;
    quitHandler = null;
    return true;
  };
  const finish = (detail, summary) => {
    if (!end()) return;
    const timeMs = Math.round(performance.now() - t0 + penalty);
    set(myResultRef, { name: myName, timeMs, ...detail, finishedAt: serverTimestamp() });
    $("my-result").textContent = detail?.partial
      ? `⏰ 시간 안에 다 못 풀었어요 · ${detail.scoreText}`
      : `🎉 완료! ${fmtTime(timeMs)}`;
    sysChat(detail?.partial ? `${myName}님 시간 종료 · ${detail.scoreText}` : `${myName}님 완료! ${fmtTime(timeMs)}`);
    showSummary(summary);
    show("view-result");
  };
  quitHandler = () => {
    if (!end()) return;
    set(myResultRef, { name: myName, gaveUp: true, finishedAt: serverTimestamp() });
    $("my-result").textContent = "이번 판은 포기했어요";
    showSummary(null);
    show("view-result");
  };
  quitArmed = false;
  $("quit-btn").textContent = "🏳️ 포기하기";

  const addPenalty = ms => { penalty += ms; };
  if (r.game === "match") playMatch(r.seed, r.level, finish);
  else if (r.game === "sudoku") playSudoku(r.seed, r.level, addPenalty, finish);
  else if (GAMES[r.game]?.english) {
    const ctx = gameCtx(r, addPenalty, finish, setLimit, () => ended);
    ({ cross: playCrossword, anagram: playAnagram, wordle: playWordle })[r.game](ctx);
  }
  else if (r.game === "idiom") playIdiom(gameCtx(r, addPenalty, finish, setLimit, () => ended));
  else playSpeed(r.seed, r.level, addPenalty, finish);
}

function gameCtx(r, addPenalty, finish, setLimit, isOver) {
  return {
    setLimit, isOver,
    seed: r.seed, level: r.level, opts: optsFor(r),
    grid: $("game-grid"), controls: $("game-controls"), prompt: $("game-prompt"), progress: $("game-progress"),
    toast, addPenalty, finish, setKeys: fn => { keyHandler = fn; }
  };
}

let quitHandler = null, quitArmed = false;
$("quit-btn").addEventListener("click", () => {
  if (!quitHandler) return;
  if (!quitArmed) {
    quitArmed = true;
    $("quit-btn").textContent = "정말 포기할까요? 한 번 더 누르세요";
    setTimeout(() => { quitArmed = false; $("quit-btn").textContent = "🏳️ 포기하기"; }, 3500);
    return;
  }
  quitHandler();
});

function showSummary(lines) {
  const box = $("my-summary");
  box.hidden = !lines?.length;
  const ul = $("summary-list");
  ul.textContent = "";
  for (const t of lines || []) {
    const li = document.createElement("li");
    li.textContent = t;
    ul.appendChild(li);
  }
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
    const main = r.partial ? `⏰ ${r.scoreText || r.score + "점"}` : fmtTime(r.timeMs);
    el.appendChild(row(medals[k] || `${k + 1}위`, r.name, main + extra, r.uid === uid));
  });
  for (const r of playing) {
    const label = r.gaveUp ? "포기" : players[r.uid]?.online ? "푸는 중…" : "나감";
    const li = row("", r.name, label, r.uid === uid);
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


// ---------- 단어 관리 ----------
const ADMIN_CATS = [
  ...Object.keys(WORDS).map(l => [`eng${l}`, `영어 ${l}등급 (${LEVEL_NAMES[l]})`]),
  ...Object.entries(IDIOM_LEVELS).map(([k, v]) => [`idiom${k}`, `사자성어 ${v.label}`])
];
for (const [k, label] of ADMIN_CATS) {
  const o = document.createElement("option");
  o.value = k;
  o.textContent = label;
  $("admin-cat").appendChild(o);
}
const defaultList = k => (k.startsWith("idiom") ? IDIOMS[k.slice(5)] : WORDS[Number(k.slice(3))]);
const toText = list => list.map(x => `${x.w} : ${x.m}`).join("\n");

function loadAdminCat() {
  const k = $("admin-cat").value;
  const isCustom = customRaw[k] != null;
  const list = isCustom ? parseLines(customRaw[k], k.startsWith("idiom")) : defaultList(k);
  $("admin-text").value = toText(list);
  const used = Object.keys(usedWords[k] || {}).length;
  $("admin-info").textContent = `${isCustom ? "바꾼 목록" : "기본 목록"} · ${list.length}개 · 이 방에서 나온 단어 ${used}개`;
}

$("admin-btn").addEventListener("click", async () => {
  show("view-admin");
  let ok = false;
  try { ok = (await get(ref(db, `admins/${uid}`))).exists(); } catch { /* 권한 없음 */ }
  $("admin-login").hidden = ok;
  $("admin-panel").hidden = !ok;
  if (ok) loadAdminCat();
});
$("admin-back").addEventListener("click", () => { show("view-lobby"); renderLobby(); });
$("admin-cat").addEventListener("change", loadAdminCat);

$("admin-login-btn").addEventListener("click", async () => {
  const code = $("admin-code").value.trim();
  if (!code) return;
  const tries = [code];
  if (/^\d+$/.test(code)) tries.push(Number(code));
  for (const c of tries) {
    try {
      await set(ref(db, `admins/${uid}`), { code: c });
      $("admin-login").hidden = true;
      $("admin-panel").hidden = false;
      loadAdminCat();
      return;
    } catch { /* 다음 시도 */ }
  }
  toast("관리 코드가 맞지 않아요");
});

$("admin-save").addEventListener("click", async () => {
  const k = $("admin-cat").value;
  const raw = $("admin-text").value;
  const lines = raw.split(/\r?\n/).filter(s => s.trim());
  const list = parseLines(raw, k.startsWith("idiom"));
  if (list.length < 10) { toast(`10개 이상 필요해요 (지금 ${list.length}개)`); return; }
  try {
    await set(ref(db, `custom/${k}`), toText(list));
    const bad = lines.length - list.length;
    toast(`저장했어요 · ${list.length}개` + (bad > 0 ? ` (형식이 틀린 ${bad}줄 제외)` : ""));
    setTimeout(loadAdminCat, 300);
  } catch {
    toast("저장 권한이 없어요. 관리 코드를 다시 입력해 주세요");
    $("admin-login").hidden = false;
  }
});
$("admin-reset").addEventListener("click", async () => {
  const k = $("admin-cat").value;
  try { await set(ref(db, `custom/${k}`), null); toast("기본 목록으로 되돌렸어요"); setTimeout(loadAdminCat, 300); }
  catch { toast("권한이 없어요"); }
});
$("admin-clear").addEventListener("click", async () => {
  const k = $("admin-cat").value;
  try { await set(ref(db, `rooms/${ROOM}/used/${k}`), null); toast("이미 나온 단어를 초기화했어요"); setTimeout(loadAdminCat, 300); }
  catch { toast("방장이나 관리자만 할 수 있어요"); }
});

// ---------- 💬 대화 ----------
const CHAT_KEEP = 50;
let chatOpen = false, unread = 0, chatSeen = null, chatStarted = false;
const wide = () => window.matchMedia("(min-width: 1000px)").matches;

function chatRef() { return ref(db, `rooms/${ROOM}/chat`); }

async function sendChat(text, sys = false) {
  text = String(text).trim().slice(0, 100);
  if (!text || !db) return;
  try {
    await push(chatRef(), { uid, name: myName, text, sys, t: serverTimestamp() });
    // 오래된 메시지 정리
    const s = await get(query(chatRef(), limitToLast(CHAT_KEEP + 20)));
    if (s.size >= CHAT_KEEP + 20) {
      const keys = Object.keys(s.val()).slice(0, 20);
      for (const k of keys) set(ref(db, `rooms/${ROOM}/chat/${k}`), null).catch(() => {});
    }
  } catch { if (!sys) toast("메시지를 보내지 못했어요"); }
}
const sysChat = text => sendChat(text, true);

function startChat() {
  if (chatStarted) return;
  chatStarted = true;
  sysChat(`${myName}님이 들어왔어요`);
  onValue(query(chatRef(), limitToLast(CHAT_KEEP)), s => {
    const msgs = [];
    s.forEach(c => { msgs.push({ id: c.key, ...c.val() }); });
    renderChat(msgs);
  });
}

function renderChat(msgs) {
  const list = $("chat-list");
  const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  list.textContent = "";
  for (const m of msgs) {
    const li = document.createElement("li");
    if (m.sys) {
      li.className = "sys";
      li.textContent = m.text;
    } else {
      li.className = m.uid === uid ? "mine" : "";
      if (m.uid !== uid) {
        const n = document.createElement("b");
        n.textContent = m.name || "손님";
        li.appendChild(n);
      }
      const t = document.createElement("span");
      t.className = "bubble";
      t.textContent = m.text;
      li.appendChild(t);
      if (typeof m.t === "number") {
        const d = new Date(m.t);
        const tm = document.createElement("small");
        tm.textContent = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        li.appendChild(tm);
      }
    }
    list.appendChild(li);
  }
  if (atBottom || chatSeen === null) list.scrollTop = list.scrollHeight;
  // 안 읽은 메시지 (닫혀 있을 때, 남이 쓴 일반 메시지)
  const lastId = msgs.length ? msgs[msgs.length - 1].id : null;
  if (chatSeen !== null && !chatOpen && !wide()) {
    const idx = msgs.findIndex(m => m.id === chatSeen);
    const fresh = (idx < 0 ? msgs : msgs.slice(idx + 1)).filter(m => m.uid !== uid && !m.sys);
    unread += fresh.length;
  }
  chatSeen = lastId;
  drawBadge();
}

function drawBadge() {
  const b = $("chat-badge");
  b.hidden = unread === 0;
  b.textContent = unread > 9 ? "9+" : unread;
}

function setChatOpen(open) {
  chatOpen = open;
  document.body.classList.toggle("chat-open", open);
  if (open) {
    unread = 0;
    drawBadge();
    const list = $("chat-list");
    list.scrollTop = list.scrollHeight;
  }
}
$("chat-fab").addEventListener("click", () => setChatOpen(!chatOpen));
$("chat-close").addEventListener("click", () => setChatOpen(false));
$("chat-form").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("chat-input").value;
  $("chat-input").value = "";
  sendChat(v);
});
for (const b of document.querySelectorAll("[data-q]")) b.addEventListener("click", () => sendChat(b.dataset.q));
