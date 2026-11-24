// 영어 게임 문제 생성 (seed·등급이 같으면 모두에게 같은 문제)
import { rng, shuffle } from "./games.js";
import { WORDS } from "./words.js";

export const ANAGRAM_COUNT = 10;
export const WORDLE_COUNT = 3;
export const WORDLE_TRIES = 6;
export const WORDLE_FAIL_MS = 60000;

export const ENG_MIN = 30;   // 남은 단어가 이보다 적으면 '이미 나온 단어'를 다시 씀

export function engList(level, custom) {
  const c = custom?.["eng" + level];
  return c && c.length >= 10 ? c : (WORDS[level] || WORDS[1]);
}

// 이미 나온 단어를 빼되, 너무 적게 남으면 전체 목록 사용
export function usable(list, exclude, min) {
  if (!exclude || !exclude.size) return list;
  const f = list.filter(x => !exclude.has(x.w));
  return f.length >= min ? f : list;
}

function bank(level, opts) {
  return usable(engList(level, opts?.custom), opts?.exclude, ENG_MIN);
}

function pick(list, n, rand, filter) {
  const f = list.filter(filter);
  const src = f.length >= n ? f : list;
  return shuffle(src, rand).slice(0, n);
}

// ---------- 미리 채워 주는 글자 ----------
// 1~3등급 2글자, 4~6등급 1~2글자(7글자 이상이면 2), 7~9등급 1글자 · 첫 글자·끝 글자는 비워 둠
export function revealCount(level, len) {
  const n = level <= 3 ? 2 : level <= 6 ? (len >= 7 ? 2 : 1) : 1;
  return Math.min(n, Math.max(0, len - 2));
}
export function middlePicks(len, n, rand) {
  const mids = [];
  for (let i = 1; i < len - 1; i++) mids.push(i);
  return shuffle(mids, rand).slice(0, n).sort((a, b) => a - b);
}

// ---------- 알파벳 맞추기 ----------
const ANAGRAM_LEN = l => (l <= 3 ? [4, 6] : l <= 6 ? [5, 8] : [6, 10]);

export function makeAnagram(seed, level, opts) {
  const rand = rng(seed);
  const [lo, hi] = ANAGRAM_LEN(level);
  const rand2 = rng(seed + 13);
  return pick(bank(level, opts), ANAGRAM_COUNT, rand, x => x.w.length >= lo && x.w.length <= hi)
    .map(x => {
      let letters = shuffle(x.w.split(""), rand);
      for (let k = 0; k < 5 && letters.join("") === x.w; k++) letters = shuffle(letters, rand);
      const fixed = middlePicks(x.w.length, revealCount(level, x.w.length), rand2);
      return { word: x.w, meaning: x.m, letters, fixed };
    });
}

// ---------- 워들 ----------
const WORDLE_LEN = l => (l <= 3 ? [5, 5] : l <= 6 ? [5, 6] : [6, 7]);

export function makeWordle(seed, level, opts) {
  const rand = rng(seed);
  const [lo, hi] = WORDLE_LEN(level);
  return pick(bank(level, opts), WORDLE_COUNT, rand, x => x.w.length >= lo && x.w.length <= hi)
    .map(x => ({ word: x.w, meaning: x.m }));
}

// 워들 색 판정: 2=자리 맞음(초록), 1=들어 있음(노랑), 0=없음(회색)
export function scoreGuess(guess, answer) {
  const res = new Array(answer.length).fill(0);
  const left = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) res[i] = 2;
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < answer.length; i++) {
    if (res[i] !== 2 && left[guess[i]] > 0) { res[i] = 1; left[guess[i]]--; }
  }
  return res;
}

// ---------- 크로스워드 ----------
const CROSS_SIZE = l => (l <= 3 ? { n: 9, target: 7 } : l <= 6 ? { n: 11, target: 10 } : { n: 13, target: 13 });

function tryBuild(words, n, target, rand) {
  const grid = Array.from({ length: n }, () => new Array(n).fill(null));
  const dirAt = Array.from({ length: n }, () => Array.from({ length: n }, () => ({ a: false, d: false })));
  const placed = [];
  const at = (r, c) => (r >= 0 && c >= 0 && r < n && c < n ? grid[r][c] : null);

  const fits = (w, r, c, down) => {
    const dr = down ? 1 : 0, dc = down ? 0 : 1;
    const er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1);
    if (r < 0 || c < 0 || er >= n || ec >= n) return -1;
    if (at(r - dr, c - dc) || at(er + dr, ec + dc)) return -1;
    let cross = 0;
    for (let i = 0; i < w.length; i++) {
      const rr = r + dr * i, cc = c + dc * i, ch = grid[rr][cc];
      if (ch) {
        if (ch !== w[i]) return -1;
        if (down ? dirAt[rr][cc].d : dirAt[rr][cc].a) return -1;
        cross++;
      } else {
        // 옆 칸이 붙어 있으면 안 됨
        if (down ? (at(rr, cc - 1) || at(rr, cc + 1)) : (at(rr - 1, cc) || at(rr + 1, cc))) return -1;
      }
    }
    return cross;
  };
  const put = (x, r, c, down) => {
    const dr = down ? 1 : 0, dc = down ? 0 : 1;
    for (let i = 0; i < x.w.length; i++) {
      const rr = r + dr * i, cc = c + dc * i;
      grid[rr][cc] = x.w[i];
      if (down) dirAt[rr][cc].d = true; else dirAt[rr][cc].a = true;
    }
    placed.push({ word: x.w, meaning: x.m, r, c, down });
  };

  const pool = words.filter(x => x.w.length <= n && x.w.length >= 3);
  const sorted = shuffle(pool, rand).sort((a, b) => b.w.length - a.w.length);
  const first = sorted.shift();
  if (!first) return null;
  put(first, Math.floor(n / 2), Math.floor((n - first.w.length) / 2), false);

  for (let pass = 0; pass < 2 && placed.length < target; pass++) {
    for (const x of shuffle(sorted, rand)) {
      if (placed.length >= target) break;
      if (placed.some(p => p.word === x.w)) continue;
      let best = [], bestScore = 0;
      for (const p of placed) {
        for (let i = 0; i < p.word.length; i++) {
          for (let j = 0; j < x.w.length; j++) {
            if (p.word[i] !== x.w[j]) continue;
            const down = !p.down;
            const r = p.down ? p.r + i : p.r - j;
            const c = p.down ? p.c - j : p.c + i;
            const s = fits(x.w, r, c, down);
            if (s > bestScore) { bestScore = s; best = [[r, c, down]]; }
            else if (s === bestScore && s > 0) best.push([r, c, down]);
          }
        }
      }
      if (best.length) {
        const [r, c, down] = best[Math.floor(rand() * best.length)];
        put(x, r, c, down);
      }
    }
  }
  return placed;
}

export function makeCrossword(seed, level, opts) {
  const { n, target } = CROSS_SIZE(level);
  const pz = buildCrossword(seed, bank(level, opts), n, target);
  const rand = rng(seed + 11);
  const given = new Set();
  for (const e of pz.entries) {
    for (const i of middlePicks(e.word.length, revealCount(level, e.word.length), rand)) {
      given.add((e.r + (e.down ? i : 0)) * pz.cols + e.c + (e.down ? 0 : i));
    }
  }
  return { ...pz, given };
}

export function buildCrossword(seed, words, n, target) {
  const rand = rng(seed);
  let best = null;
  for (let k = 0; k < 25; k++) {
    const p = tryBuild(words, n, target, rand);
    if (p && (!best || p.length > best.length)) best = p;
    if (best && best.length >= target) break;
  }
  return layout(best);
}

// 사용한 칸만 남기도록 잘라내고 번호를 매김
export function layout(placed) {
  let r0 = Infinity, c0 = Infinity, r1 = -1, c1 = -1;
  for (const p of placed) {
    const er = p.r + (p.down ? p.word.length - 1 : 0), ec = p.c + (p.down ? 0 : p.word.length - 1);
    r0 = Math.min(r0, p.r); c0 = Math.min(c0, p.c); r1 = Math.max(r1, er); c1 = Math.max(c1, ec);
  }
  const rows = r1 - r0 + 1, cols = c1 - c0 + 1;
  const sol = Array.from({ length: rows }, () => new Array(cols).fill(null));
  const entries = placed.map(p => ({ ...p, r: p.r - r0, c: p.c - c0 }));
  for (const e of entries) {
    for (let i = 0; i < e.word.length; i++) {
      sol[e.r + (e.down ? i : 0)][e.c + (e.down ? 0 : i)] = e.word[i];
    }
  }
  // 번호: 읽는 순서대로 시작 칸에
  const starts = [...new Set(entries.map(e => e.r * cols + e.c))].sort((a, b) => a - b);
  const numAt = new Map(starts.map((k, i) => [k, i + 1]));
  for (const e of entries) e.num = numAt.get(e.r * cols + e.c);
  entries.sort((a, b) => (a.down - b.down) || (a.num - b.num));
  return { rows, cols, sol, entries, numAt };
}
