// 게임 문제 생성 (같은 seed·단계면 모두에게 같은 문제)

export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 비슷한 그림끼리 묶음 (높은 단계에서 헷갈리게 섞는 데 사용)
export const EMOJI_GROUPS = [
  ["🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒", "🍑", "🥝", "🍍"],
  ["🥕", "🌽", "🍆", "🥦", "🥒", "🍄", "🧄", "🥔"],
  ["🐶", "🐱", "🐰", "🐻", "🐸", "🐧", "🐷", "🐮", "🐯", "🦁", "🐵", "🐔"],
  ["🌻", "🌷", "🌹", "🌸", "🌼", "🍀", "🌵", "🌲"],
  ["⭐", "🌙", "🧸", "🎈", "🚗", "⚽", "🔔", "🎁", "☕", "📚", "⏰", "🎨"]
];
export const EMOJIS = EMOJI_GROUPS.flat();

export const GAMES = {
  speed: { title: "⚡ 빨리 찾기", leveled: true },
  match: { title: "🃏 짝맞추기", leveled: true },
  sudoku: { title: "🔢 스도쿠", leveled: false },
  cross: { title: "🔤 영어 크로스워드", english: true },
  anagram: { title: "🔠 알파벳 맞추기", english: true },
  wordle: { title: "🟩 영어 워들", english: true },
  idiom: { title: "📜 사자성어 크로스워드" }
};

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 5;
export const DEFAULT_LEVEL = { speed: 2, match: 2 };

export const SPEED_TRIALS = 15;
export const SPEED_PENALTY_MS = 2000;
export const HINT_PENALTY_MS = 30000;
export const MAX_HINTS = 3;

// ---------- 빨리 찾기 ----------
// 단계별 칸 수 (15문제를 5문제씩 3구간)
const SPEED_SIZES = {
  1: [9, 9, 9],
  2: [9, 12, 12],
  3: [9, 12, 16],
  4: [12, 16, 20],
  5: [16, 20, 25]
};
const COLS = { 9: 3, 12: 4, 16: 4, 20: 4, 25: 5 };

export function makeSpeedPuzzle(seed, level = 3) {
  const rand = rng(seed);
  const sizes = SPEED_SIZES[level] || SPEED_SIZES[3];
  const trials = [];
  for (let i = 0; i < SPEED_TRIALS; i++) {
    const size = sizes[Math.floor(i / 5)];
    const group = EMOJI_GROUPS[Math.floor(rand() * EMOJI_GROUPS.length)];
    const target = group[Math.floor(rand() * group.length)];
    let pool;
    if (level >= 4) {
      // 같은 묶음(비슷한 그림)을 먼저 채우고 부족하면 다른 그림으로
      const same = shuffle(group.filter(e => e !== target), rand);
      const other = shuffle(EMOJIS.filter(e => !group.includes(e)), rand);
      pool = same.concat(other);
    } else {
      pool = shuffle(EMOJIS.filter(e => e !== target), rand);
    }
    const cells = shuffle([target].concat(pool.slice(0, size - 1)), rand);
    trials.push({ cols: COLS[size], target, cells });
  }
  return trials;
}

// ---------- 짝맞추기 ----------
export const MATCH_LAYOUT = {
  1: { pairs: 6, cols: 4 },
  2: { pairs: 8, cols: 4 },
  3: { pairs: 10, cols: 4 },
  4: { pairs: 12, cols: 4 },
  5: { pairs: 15, cols: 5 }
};

export function makeMatchPuzzle(seed, level = 2) {
  const rand = rng(seed);
  const { pairs, cols } = MATCH_LAYOUT[level] || MATCH_LAYOUT[2];
  const faces = shuffle(EMOJIS, rand).slice(0, pairs);
  return { cols, pairs, cards: shuffle(faces.concat(faces), rand) };
}

// ---------- 자동 단계 조절 ----------
// 직전 판(같은 게임) 참가자 중간 기록이 빠르면 +1, 느리면 -1
export function median(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function levelThresholds(game, level) {
  if (game === "speed") return { fast: 20000, slow: 45000 };
  if (game === "match") {
    const pairs = (MATCH_LAYOUT[level] || MATCH_LAYOUT[2]).pairs;
    return { fast: pairs * 2500, slow: pairs * 6000 };
  }
  return null;
}

// 반환: { level, change: +1|0|-1, median }
export function suggestLevel(game, lastRound, lastResults) {
  const base = lastRound?.levels?.[game] ?? DEFAULT_LEVEL[game] ?? 3;
  if (!lastRound || lastRound.game !== game) return { level: base, change: 0, median: null };
  const times = Object.values(lastResults || {})
    .map(r => r.timeMs)
    .filter(t => typeof t === "number");
  const med = median(times);
  if (med === null) return { level: base, change: 0, median: null };
  const th = levelThresholds(game, base);
  let change = 0;
  if (med < th.fast && base < LEVEL_MAX) change = 1;
  else if (med > th.slow && base > LEVEL_MIN) change = -1;
  return { level: base + change, change, median: med };
}

// ---------- 공통 ----------
export function fmtTime(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + "초";
  const m = Math.floor(s / 60);
  return m + "분 " + (s - m * 60).toFixed(1) + "초";
}

// 순위: 끝낸 사람은 시간순, 풀고 있는 사람은 뒤에
export function rankResults(results) {
  const rows = Object.entries(results || {}).map(([uid, r]) => ({ uid, ...r }));
  // 다 푼 사람은 시간순, 시간 안에 못 푼 사람은 그 뒤에 점수순
  const done = rows.filter(r => typeof r.timeMs === "number").sort((a, b) =>
    ((a.partial ? 1 : 0) - (b.partial ? 1 : 0)) ||
    (a.partial ? (b.score - a.score) || (a.timeMs - b.timeMs) : a.timeMs - b.timeMs));
  const playing = rows.filter(r => typeof r.timeMs !== "number")
    .sort((a, b) => (a.gaveUp ? 1 : 0) - (b.gaveUp ? 1 : 0));
  return { done, playing };
}
