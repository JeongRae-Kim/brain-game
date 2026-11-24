// 숫자 스도쿠 생성기 (seed가 같으면 같은 문제, 답은 항상 하나)
import { rng, shuffle } from "./games.js";

export const SUDOKU_LEVELS = {
  easy: { label: "초급", clues: 40 },
  mid: { label: "중급", clues: 32 },
  hard: { label: "고급", clues: 26 }
};

export const ROW = i => Math.floor(i / 9);
export const COL = i => i % 9;
export const BOX = i => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

// 각 칸과 같은 행·열·박스에 있는 칸들
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const s = new Set();
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) s.add(j);
  }
  return [...s];
});

function candidates(g, i) {
  let used = 0;
  for (const p of PEERS[i]) if (g[p]) used |= 1 << g[p];
  const out = [];
  for (let n = 1; n <= 9; n++) if (!(used & (1 << n))) out.push(n);
  return out;
}

// 빈칸 중 후보가 가장 적은 칸
function bestCell(g) {
  let best = -1, bestC = null;
  for (let i = 0; i < 81; i++) {
    if (g[i]) continue;
    const c = candidates(g, i);
    if (best < 0 || c.length < bestC.length) { best = i; bestC = c; if (c.length <= 1) break; }
  }
  return [best, bestC];
}

function fill(g, rand) {
  const [i, c] = bestCell(g);
  if (i < 0) return true;
  for (const n of shuffle(c, rand)) {
    g[i] = n;
    if (fill(g, rand)) return true;
  }
  g[i] = 0;
  return false;
}

export function countSolutions(g, limit = 2) {
  const [i, c] = bestCell(g);
  if (i < 0) return 1;
  let total = 0;
  for (const n of c) {
    g[i] = n;
    total += countSolutions(g, limit - total);
    if (total >= limit) break;
  }
  g[i] = 0;
  return total;
}

export function makeSudoku(seed, level = "easy") {
  const rand = rng(seed);
  const solution = new Array(81).fill(0);
  fill(solution, rand);
  const puzzle = solution.slice();
  const target = (SUDOKU_LEVELS[level] || SUDOKU_LEVELS.easy).clues;
  let filled = 81;
  for (const i of shuffle([...Array(81).keys()], rand)) {
    if (filled <= target) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle.slice()) !== 1) puzzle[i] = keep;
    else filled--;
  }
  return { puzzle, solution };
}
