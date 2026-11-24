// 게임 문제 생성 (같은 seed면 모두에게 같은 문제)

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

export const EMOJIS = [
  "🍎", "🍌", "🍇", "🍓", "🍒", "🥕", "🌽", "🍆", "🍉", "🍋",
  "🐶", "🐱", "🐰", "🐻", "🐸", "🐧", "🐷", "🐮",
  "🌻", "🌷", "⭐", "🌙", "🎈", "🚗", "⚽", "🔔", "🎁", "☕"
];

export const GAMES = {
  speed: { title: "⚡ 빨리 찾기", unit: "time" },
  match: { title: "🃏 짝맞추기", unit: "time" }
};

export const SPEED_TRIALS = 15;
export const SPEED_PENALTY_MS = 2000;

// 빨리 찾기: 15문제, 갈수록 칸이 늘어남 (9 → 12 → 16칸)
export function makeSpeedPuzzle(seed) {
  const rand = rng(seed);
  const trials = [];
  for (let i = 0; i < SPEED_TRIALS; i++) {
    const cols = i < 5 ? 3 : 4;
    const size = i < 5 ? 9 : i < 10 ? 12 : 16;
    const picks = shuffle(EMOJIS, rand).slice(0, size);
    const target = picks[0];
    const cells = shuffle(picks, rand);
    trials.push({ cols, target, cells });
  }
  return trials;
}

// 짝맞추기: 4×4 카드, 8쌍
export function makeMatchPuzzle(seed) {
  const rand = rng(seed);
  const faces = shuffle(EMOJIS, rand).slice(0, 8);
  return shuffle(faces.concat(faces), rand);
}

export function fmtTime(ms) {
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + "초";
  const m = Math.floor(s / 60);
  return m + "분 " + (s - m * 60).toFixed(1) + "초";
}

// 순위: 끝낸 사람은 시간순, 풀고 있는 사람은 뒤에
export function rankResults(results) {
  const rows = Object.entries(results || {}).map(([uid, r]) => ({ uid, ...r }));
  const done = rows.filter(r => typeof r.timeMs === "number").sort((a, b) => a.timeMs - b.timeMs);
  const playing = rows.filter(r => typeof r.timeMs !== "number");
  return { done, playing };
}
