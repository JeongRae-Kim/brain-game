// 영어 게임 화면: 크로스워드 · 알파벳 맞추기 · 워들
import { HINT_PENALTY_MS, MAX_HINTS } from "./games.js";
import { makeIdiomCross } from "./idioms.js";
import {
  makeCrossword, makeAnagram, makeWordle, scoreGuess,
  WORDLE_TRIES, WORDLE_FAIL_MS
} from "./english.js";

const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// 화면 키보드 (⌫, 선택적으로 확인 키)
function keyboard(onKey, { enter = false } = {}) {
  const wrap = el("div", "kbd");
  const keys = {};
  KEY_ROWS.forEach((row, ri) => {
    const r = el("div", "kbd-row");
    if (ri === 2 && enter) {
      const b = el("button", "key wide", "확인");
      b.addEventListener("click", () => onKey("ENTER"));
      r.appendChild(b);
    }
    for (const ch of row) {
      const b = el("button", "key", ch);
      b.addEventListener("click", () => onKey(ch));
      keys[ch] = b;
      r.appendChild(b);
    }
    if (ri === 2) {
      const b = el("button", "key wide", "⌫");
      b.addEventListener("click", () => onKey("BACK"));
      r.appendChild(b);
    }
    wrap.appendChild(r);
  });
  return { wrap, keys };
}

function physicalKeys(ctx, onKey) {
  ctx.setKeys(e => {
    if (e.key === "Backspace") onKey("BACK");
    else if (e.key === "Enter") onKey("ENTER");
    else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase());
    else return;
    e.preventDefault();
  });
}

function hintButton(ctx, state, onUse) {
  const b = el("button", "btn");
  const draw = () => {
    b.textContent = `💡 힌트 ${MAX_HINTS - state.hints}`;
    b.disabled = state.hints >= MAX_HINTS;
  };
  b.addEventListener("click", () => {
    if (state.done) return;
    if (state.hints >= MAX_HINTS) { ctx.toast(`힌트는 최대 ${MAX_HINTS}개까지예요`); return; }
    if (onUse() === false) return;
    state.hints++;
    ctx.addPenalty(HINT_PENALTY_MS);
    ctx.toast("힌트 사용 · +30초");
    draw();
  });
  draw();
  return b;
}

// =====================================================================
// 🔤 크로스워드 (영어 · 사자성어 공용)
//   mode.puzzle: 미리 만든 판, mode.given: 미리 채운 칸, mode.tiles(entry): 보기 글자판
// =====================================================================
export function playCrossword(ctx, mode = {}) {
  const pz = mode.puzzle || makeCrossword(ctx.seed, ctx.level, ctx.opts);
  const { rows, cols, sol, entries, numAt } = pz;
  const given = mode.given || new Set();
  const vals = sol.map((row, r) => row.map((ch, c) => (ch ? (given.has(r * cols + c) ? ch : "") : null)));
  const hinted = new Set();
  const state = { hints: 0, done: false };
  const lock = p => hinted.has(p.r * cols + p.c) || given.has(p.r * cols + p.c);
  let sel = { r: entries[0].r, c: entries[0].c }, down = entries[0].down;
  let showWrong = false, tilesFor = null;

  const grid = ctx.grid;
  grid.className = "xword";
  grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  grid.textContent = "";
  const cells = [];
  for (let r = 0; r < rows; r++) {
    cells.push([]);
    for (let c = 0; c < cols; c++) {
      if (!sol[r][c]) { grid.appendChild(el("div", "blk")); cells[r].push(null); continue; }
      const b = el("button", "cw");
      const n = numAt.get(r * cols + c);
      if (n) b.appendChild(el("span", "num", n));
      const ch = el("span", "ch");
      b.appendChild(ch);
      b.addEventListener("click", () => tap(r, c));
      grid.appendChild(b);
      cells[r].push({ b, ch });
    }
  }
  if (cols > 11) grid.classList.add("dense");

  const entryAt = (r, c, d) => entries.find(e => e.down === d &&
    (d ? e.c === c && r >= e.r && r < e.r + e.word.length : e.r === r && c >= e.c && c < e.c + e.word.length));
  const cur = () => entryAt(sel.r, sel.c, down) || entryAt(sel.r, sel.c, !down);
  const cellsOf = e => [...e.word].map((_, i) => ({ r: e.r + (e.down ? i : 0), c: e.c + (e.down ? 0 : i) }));

  function tap(r, c) {
    if (sel.r === r && sel.c === c && entryAt(r, c, !down)) down = !down;
    else if (!entryAt(r, c, down)) down = !down;
    sel = { r, c };
    render();
  }
  function selectEntry(e) {
    down = e.down;
    sel = cellsOf(e).find(p => !lock(p) && !vals[p.r][p.c]) || { r: e.r, c: e.c };
    render();
  }
  function moveWord(d) {
    const i = entries.indexOf(cur());
    selectEntry(entries[(i + d + entries.length) % entries.length]);
  }

  function key(k) {
    if (state.done) return;
    const e = cur();
    const list = cellsOf(e);
    const idx = list.findIndex(p => p.r === sel.r && p.c === sel.c);
    if (k === "BACK") {
      if (vals[sel.r][sel.c] && !lock(sel)) vals[sel.r][sel.c] = "";
      else {
        const pi = [...list.keys()].reverse().find(i => i < idx && !lock(list[i]));
        if (pi != null) { sel = list[pi]; vals[sel.r][sel.c] = ""; }
      }
    } else if (k.length === 1) {
      // 고정된 칸에서 같은 글자를 치면 그냥 지나가고, 아니면 다음 빈 자리에 입력
      if (lock(sel) && vals[sel.r][sel.c] === k) {
        if (list[idx + 1]) sel = list[idx + 1];
      } else {
        const ti = list.findIndex((p, i) => i >= idx && !lock(p));
        if (ti < 0) return;
        const t = list[ti];
        vals[t.r][t.c] = k;
        sel = list[ti + 1] || t;
      }
    } else return;
    showWrong = false;
    render();
    check();
  }

  function check() {
    let full = true, ok = true;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (sol[r][c] === null) continue;
      if (!vals[r][c]) full = false;
      if (vals[r][c] !== sol[r][c]) ok = false;
    }
    if (ok) {
      state.done = true;
      render();
      setTimeout(() => ctx.finish({ hints: state.hints }, mode.summary?.(entries)), 500);
    } else if (full) { showWrong = true; render(); ctx.toast("틀린 칸이 빨갛게 표시돼요"); }
  }

  // 아래 영역: 현재 열쇠 · 입력 · 도구 · 열쇠 목록
  const clue = el("div", "clue");
  const input = mode.tiles ? el("div", "ktiles") : keyboard(key).wrap;
  const tools = el("div", "tools");
  const prev = el("button", "btn", "◀ 이전");
  prev.addEventListener("click", () => moveWord(-1));
  const next = el("button", "btn", "다음 ▶");
  next.addEventListener("click", () => moveWord(1));
  const hint = hintButton(ctx, state, () => {
    let p = { ...sel };
    if (vals[p.r][p.c] === sol[p.r][p.c]) {
      const wrong = cellsOf(cur()).find(q => vals[q.r][q.c] !== sol[q.r][q.c]);
      if (!wrong) {
        outer: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          if (sol[r][c] && vals[r][c] !== sol[r][c]) { p = { r, c }; break outer; }
        }
      } else p = wrong;
    }
    if (vals[p.r][p.c] === sol[p.r][p.c]) return false;
    vals[p.r][p.c] = sol[p.r][p.c];
    hinted.add(p.r * cols + p.c);
    sel = p;
    setTimeout(() => { render(); check(); }, 0);
  });
  tools.append(prev, hint, next);
  const listEl = el("div", "clues");
  const items = [];
  for (const [title, d] of [["가로", false], ["세로", true]]) {
    listEl.appendChild(el("h3", null, title));
    for (const e of entries.filter(x => x.down === d)) {
      const it = el("button", "clue-item", `${e.num}. ${e.meaning} (${e.word.length})`);
      it.addEventListener("click", () => { selectEntry(e); window.scrollTo({ top: 0, behavior: "smooth" }); });
      items.push({ it, e });
      listEl.appendChild(it);
    }
  }
  ctx.controls.append(clue, input, tools, listEl);
  if (!mode.tiles) physicalKeys(ctx, key);

  function drawTiles(e) {
    if (tilesFor === e) return;
    tilesFor = e;
    input.textContent = "";
    for (const ch of mode.tiles(e)) {
      const b = el("button", "ktile", ch);
      b.addEventListener("click", () => key(ch));
      input.appendChild(b);
    }
    const back = el("button", "ktile back", "⌫");
    back.addEventListener("click", () => key("BACK"));
    input.appendChild(back);
  }

  function render() {
    const e = cur();
    const inWord = new Set(cellsOf(e).map(p => p.r * cols + p.c));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = cells[r][c];
      if (!x) continue;
      const k = r * cols + c;
      x.ch.textContent = vals[r][c] || "";
      x.b.classList.toggle("word", inWord.has(k));
      x.b.classList.toggle("sel", sel.r === r && sel.c === c);
      x.b.classList.toggle("given", given.has(k));
      x.b.classList.toggle("hinted", hinted.has(k));
      x.b.classList.toggle("bad", showWrong && vals[r][c] && vals[r][c] !== sol[r][c]);
      x.b.classList.toggle("ok", state.done);
    }
    clue.textContent = `${e.num} ${e.down ? "세로" : "가로"} · ${e.meaning} (${e.word.length}글자)`;
    for (const { it, e: x } of items) {
      it.classList.toggle("active", x === e);
      it.classList.toggle("filled", cellsOf(x).every(p => vals[p.r][p.c]));
    }
    if (mode.tiles) drawTiles(e);
    const left = vals.flat().filter(v => v === "").length;
    ctx.progress.textContent = `빈칸 ${left}개`;
  }
  ctx.prompt.textContent = mode.title || `영어 크로스워드 · ${entries.length}단어`;
  render();
}

// =====================================================================
// 📜 사자성어 크로스워드 (보기 글자판으로 입력)
// =====================================================================
export function playIdiom(ctx) {
  const pz = makeIdiomCross(ctx.seed, ctx.level, ctx.opts);
  const extra = { easy: 2, mid: 4, hard: 6 }[ctx.level] ?? 4;
  playCrossword(ctx, {
    puzzle: pz,
    given: pz.given,
    title: `사자성어 크로스워드 · ${pz.entries.length}개`,
    tiles: e => {
      const need = [...new Set(e.word)];
      const others = pz.chars.filter(c => !need.includes(c));
      return shuffleR(need.concat(shuffleR(others).slice(0, extra)));
    },
    summary: entries => entries.map(e => `${e.word} — ${e.meaning}`)
  });
}
function shuffleR(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// =====================================================================
// 🔠 알파벳 맞추기
// =====================================================================
export function playAnagram(ctx) {
  const words = makeAnagram(ctx.seed, ctx.level, ctx.opts);
  const state = { hints: 0, done: false };
  let wi = 0, slots, used, locked, busy = false;

  const grid = ctx.grid;
  grid.className = "anagram";
  grid.style.gridTemplateColumns = "";
  const slotRow = el("div", "slots");
  const tileRow = el("div", "tiles");
  grid.textContent = "";
  grid.append(slotRow, tileRow);

  const tools = el("div", "tools");
  const reset = el("button", "btn", "↺ 다시");
  reset.addEventListener("click", () => { clearFrom(0); render(); });
  const hint = hintButton(ctx, state, () => {
    const w = words[wi].word;
    const i = slots.findIndex((t, k) => t === null || words[wi].letters[t] !== w[k]);
    if (i < 0) return false;
    clearFrom(i);
    const t = words[wi].letters.findIndex((ch, k) => ch === w[i] && !used[k]);
    slots[i] = t; used[t] = true; locked[i] = true;
    setTimeout(() => { render(); check(); }, 0);
  });
  const skipPad = el("div");
  tools.append(reset, hint, skipPad);
  ctx.controls.append(tools);

  function clearFrom(i) {
    for (let k = i; k < slots.length; k++) {
      if (locked[k] || slots[k] === null) continue;
      used[slots[k]] = false; slots[k] = null;
    }
  }
  function load() {
    const n = words[wi].word.length;
    slots = new Array(n).fill(null);
    used = new Array(n).fill(false);
    locked = new Array(n).fill(false);
    ctx.prompt.textContent = `${words[wi].meaning}  (${n}글자)`;
    ctx.progress.textContent = `${wi + 1} / ${words.length}`;
    render();
  }
  function placeTile(t) {
    if (busy || used[t]) return;
    const i = slots.indexOf(null);
    if (i < 0) return;
    slots[i] = t; used[t] = true;
    render(); check();
  }
  function removeSlot(i) {
    if (busy || locked[i] || slots[i] === null) return;
    used[slots[i]] = false; slots[i] = null;
    render();
  }
  function check() {
    if (slots.includes(null)) return;
    const guess = slots.map(t => words[wi].letters[t]).join("");
    busy = true;
    if (guess === words[wi].word) {
      slotRow.classList.add("ok");
      setTimeout(() => {
        slotRow.classList.remove("ok");
        busy = false;
        wi++;
        if (wi >= words.length) { state.done = true; ctx.finish({ hints: state.hints }); }
        else load();
      }, 450);
    } else {
      slotRow.classList.add("shake");
      setTimeout(() => { slotRow.classList.remove("shake"); clearFrom(0); busy = false; render(); }, 450);
    }
  }
  function render() {
    const w = words[wi];
    slotRow.textContent = "";
    slots.forEach((t, i) => {
      const b = el("button", "slot" + (locked[i] ? " locked" : ""), t === null ? "" : w.letters[t]);
      b.addEventListener("click", () => removeSlot(i));
      slotRow.appendChild(b);
    });
    tileRow.textContent = "";
    w.letters.forEach((ch, t) => {
      const b = el("button", "tile" + (used[t] ? " used" : ""), ch);
      b.addEventListener("click", () => placeTile(t));
      tileRow.appendChild(b);
    });
  }
  physicalKeys(ctx, k => {
    if (k === "BACK") {
      for (let i = slots.length - 1; i >= 0; i--) if (slots[i] !== null && !locked[i]) { removeSlot(i); break; }
    } else if (k.length === 1) {
      const t = words[wi].letters.findIndex((ch, j) => ch === k && !used[j]);
      if (t >= 0) placeTile(t);
    }
  });
  load();
}

// =====================================================================
// 🟩 워들
// =====================================================================
export function playWordle(ctx) {
  const words = makeWordle(ctx.seed, ctx.level, ctx.opts);
  const state = { hints: 0, done: false };
  let wi = 0, guesses, cur, busy = false, fails = 0, showMeaning, revealed;
  const keyColor = {};

  const grid = ctx.grid;
  grid.className = "wordle";
  grid.style.gridTemplateColumns = "";
  const kb = keyboard(key, { enter: true });
  const tools = el("div", "tools one");
  const hint = hintButton(ctx, state, () => {
    const w = words[wi].word;
    if (!showMeaning) { showMeaning = true; }
    else {
      const i = [...w].findIndex((_, k) => !revealed.has(k) && !guesses.some(g => g[k] === w[k]));
      if (i < 0) return false;
      revealed.add(i);
    }
    setTimeout(drawPrompt, 0);
  });
  tools.append(hint);
  ctx.controls.append(kb.wrap, tools);
  physicalKeys(ctx, key);

  function load() {
    guesses = []; cur = ""; showMeaning = false; revealed = new Set();
    for (const k in keyColor) delete keyColor[k];
    ctx.progress.textContent = `단어 ${wi + 1} / ${words.length}`;
    drawPrompt(); render();
  }
  function drawPrompt() {
    const w = words[wi].word;
    const pattern = [...w].map((ch, k) => (revealed.has(k) ? ch : "_")).join(" ");
    ctx.prompt.textContent = showMeaning
      ? `${words[wi].meaning} · ${pattern}`
      : `${w.length}글자 단어를 맞혀 보세요` + (revealed.size ? ` · ${pattern}` : "");
  }
  function key(k) {
    if (busy || state.done) return;
    const w = words[wi].word;
    if (k === "BACK") cur = cur.slice(0, -1);
    else if (k === "ENTER") {
      if (cur.length < w.length) { ctx.toast(`${w.length}글자를 입력하세요`); return; }
      const sc = scoreGuess(cur, w);
      guesses.push(cur);
      [...cur].forEach((ch, i) => { keyColor[ch] = Math.max(keyColor[ch] ?? -1, sc[i]); });
      const solved = sc.every(v => v === 2);
      cur = "";
      render();
      if (solved || guesses.length >= WORDLE_TRIES) {
        busy = true;
        if (!solved) {
          fails++;
          ctx.addPenalty(WORDLE_FAIL_MS);
          ctx.toast(`정답: ${w} (${words[wi].meaning}) · +60초`);
        }
        setTimeout(() => {
          busy = false;
          wi++;
          if (wi >= words.length) { state.done = true; ctx.finish({ hints: state.hints, wrong: fails }); }
          else load();
        }, solved ? 900 : 2200);
      }
      return;
    } else if (k.length === 1 && cur.length < w.length) cur += k;
    render();
  }
  function render() {
    const w = words[wi].word;
    grid.textContent = "";
    grid.style.setProperty("--len", w.length);
    for (let row = 0; row < WORDLE_TRIES; row++) {
      const r = el("div", "wrow");
      const g = guesses[row];
      const sc = g ? scoreGuess(g, w) : null;
      for (let i = 0; i < w.length; i++) {
        const ch = g ? g[i] : row === guesses.length ? cur[i] || "" : "";
        const c = el("div", "wcell" + (sc ? ` s${sc[i]}` : ch ? " typed" : ""), ch);
        r.appendChild(c);
      }
      grid.appendChild(r);
    }
    for (const [ch, b] of Object.entries(kb.keys)) {
      b.classList.remove("s0", "s1", "s2");
      if (keyColor[ch] != null) b.classList.add(`s${keyColor[ch]}`);
    }
  }
  load();
}

