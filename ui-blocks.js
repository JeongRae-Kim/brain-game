// 🟦 블록 쌓기 — 3분 동안 점수 겨루기 (모두 같은 순서로 블록이 나옴)
import { arcade } from "./arcade.js";
import { shuffle } from "./games.js";

const COLS = 10, ROWS = 20, CELL = 22;
const BOARD_X = 8, BOARD_Y = 26;
const W = BOARD_X + COLS * CELL + 8 + 100, H = BOARD_Y + ROWS * CELL + 8;
const SHAPES = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]]
};
const COLORS = { I: "#4fb0c6", O: "#f4d35e", T: "#a77bd6", S: "#7bc96f", Z: "#e86a5a", J: "#6c8ee6", L: "#f2a541" };
const FALL = { 1: 0.85, 2: 0.7, 3: 0.55, 4: 0.42, 5: 0.32 };     // 한 칸 내려가는 시간(초)
const LINE_PTS = [0, 100, 300, 500, 800];
const TOPOUT_PENALTY = 300;

export function playBlocks(ctx) {
  const A = arcade(ctx, {
    W, H, prompt: "줄을 가득 채우면 지워져요",
    buttons: [
      { id: "left", label: "◀" }, { id: "rotate", label: "⟳" }, { id: "right", label: "▶" },
      { id: "down", label: "⬇ 천천히", small: true }, { id: "drop", label: "⤓ 바로 내리기", small: true, span: 2 }
    ],
    cols: "1fr 1fr 1fr"
  });
  const { g, rand } = A;
  const board = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  let bag = [];
  const nextType = () => { if (!bag.length) bag = shuffle(Object.keys(SHAPES), rand); return bag.pop(); };
  const S = { lines: 0, tops: 0, pieces: 0, cur: null, next: nextType(), fallT: 0, moveT: 0, softT: 0, flash: 0 };
  A.state = S;

  const cellsOf = p => {
    const base = SHAPES[p.type];
    const size = p.type === "I" ? 4 : p.type === "O" ? 4 : 3;
    return base.map(([x, y]) => {
      let rx = x, ry = y;
      for (let i = 0; i < p.rot; i++) [rx, ry] = [size - 1 - ry, rx];
      return [p.x + rx, p.y + ry];
    });
  };
  const fits = p => cellsOf(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !board[y][x]));

  function spawn() {
    const type = S.next;
    S.next = nextType();
    S.cur = { type, rot: 0, x: 3, y: -1 };
    S.pieces++;
    if (!fits(S.cur)) {
      // 꽉 찼으면 판을 비우고 계속 (감점)
      for (const row of board) row.fill(null);
      A.score = Math.max(0, A.score - TOPOUT_PENALTY);
      S.tops++;
      A.pop(BOARD_X + COLS * CELL / 2, H / 2, `꽉 찼어요 -${TOPOUT_PENALTY}`, "#ff6b6b", 1.6);
    }
  }
  function lock() {
    for (const [x, y] of cellsOf(S.cur)) if (y >= 0) board[y][x] = S.cur.type;
    let n = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(Boolean)) { board.splice(y, 1); board.unshift(new Array(COLS).fill(null)); n++; y++; }
    }
    if (n) {
      const pts = LINE_PTS[n] + (ctx.level - 1) * 20 * n;
      A.score += pts;
      S.lines += n;
      S.flash = 0.25;
      A.pop(BOARD_X + COLS * CELL / 2, H / 2, n >= 4 ? `대박! +${pts}` : `${n}줄 +${pts}`, "#ffd34d", 1.2);
    }
    spawn();
  }
  const tryMove = (dx, dy) => {
    const p = { ...S.cur, x: S.cur.x + dx, y: S.cur.y + dy };
    if (fits(p)) { S.cur = p; return true; }
    return false;
  };
  function rotate() {
    if (S.cur.type === "O") return;
    for (const kick of [0, -1, 1, -2, 2]) {
      const p = { ...S.cur, rot: (S.cur.rot + 1) % 4, x: S.cur.x + kick };
      if (fits(p)) { S.cur = p; return; }
    }
  }
  function hardDrop() {
    let d = 0;
    while (tryMove(0, 1)) d++;
    A.score += d * 2;
    lock();
    S.fallT = 0;
  }
  A.onPress = id => {
    if (!S.cur) return;
    if (id === "left") { tryMove(-1, 0); S.moveT = -0.18; }
    else if (id === "right") { tryMove(1, 0); S.moveT = -0.18; }
    else if (id === "rotate" || id === "up") rotate();
    else if (id === "drop") hardDrop();
  };
  A.onSwipe = dir => {
    if (dir === "left") tryMove(-1, 0);
    else if (dir === "right") tryMove(1, 0);
    else if (dir === "down") hardDrop();
    else rotate();
  };
  A.onTap = () => rotate();

  const fall = () => FALL[ctx.level] * Math.max(0.45, 1 - S.lines * 0.012);
  function step(dt) {
    S.flash = Math.max(0, S.flash - dt);
    // 버튼을 누르고 있으면 계속 이동
    const dir = (A.held.right ? 1 : 0) - (A.held.left ? 1 : 0);
    if (dir) {
      S.moveT += dt;
      if (S.moveT > 0.07) { tryMove(dir, 0); S.moveT = 0; }
    } else S.moveT = 0;
    if (A.held.down) {
      S.softT += dt;
      if (S.softT > 0.05) { S.softT = 0; if (tryMove(0, 1)) A.score += 1; else { lock(); S.fallT = 0; } }
    }
    S.fallT += dt;
    if (S.fallT >= fall()) {
      S.fallT = 0;
      if (!tryMove(0, 1)) lock();
    }
  }

  function cell(x, y, color, alpha = 1) {
    const px = BOARD_X + x * CELL, py = BOARD_Y + y * CELL;
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 4);
    g.fill();
    g.fillStyle = "rgba(255,255,255,.28)";
    g.fillRect(px + 4, py + 3, CELL - 8, 3);
    g.globalAlpha = 1;
  }
  function draw(dt) {
    g.fillStyle = "#132238";
    g.fillRect(0, 0, W, H);
    g.fillStyle = S.flash > 0 ? "#2a3f63" : "#1b2c47";
    g.fillRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL);
    g.strokeStyle = "rgba(255,255,255,.05)";
    for (let x = 1; x < COLS; x++) { g.beginPath(); g.moveTo(BOARD_X + x * CELL, BOARD_Y); g.lineTo(BOARD_X + x * CELL, BOARD_Y + ROWS * CELL); g.stroke(); }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][x]) cell(x, y, COLORS[board[y][x]]);
    if (S.cur) {
      // 떨어질 자리 미리 보기
      const ghost = { ...S.cur };
      while (fits({ ...ghost, y: ghost.y + 1 })) ghost.y++;
      for (const [x, y] of cellsOf(ghost)) if (y >= 0) cell(x, y, COLORS[S.cur.type], 0.22);
      for (const [x, y] of cellsOf(S.cur)) if (y >= 0) cell(x, y, COLORS[S.cur.type]);
    }
    // 다음 블록
    const sx = BOARD_X + COLS * CELL + 16;
    g.fillStyle = "#ffffff";
    g.font = "bold 14px sans-serif";
    g.textAlign = "left";
    g.fillText("다음", sx, BOARD_Y + 10);
    for (const [x, y] of SHAPES[S.next]) {
      g.fillStyle = COLORS[S.next];
      g.beginPath();
      g.roundRect(sx + x * 18, BOARD_Y + 26 + y * 18, 16, 16, 3);
      g.fill();
    }
    g.fillStyle = "#ffffff";
    g.fillText(`줄 ${S.lines}`, sx, BOARD_Y + 110);
    A.drawPops(dt);
    A.hud(`점수 ${A.score}`, "");
  }

  spawn();
  A.run(step, draw,
    () => ({ score: A.score, wrong: S.tops, wrongLabel: "꽉 찬 횟수", lines: S.lines }),
    () => `점수 ${A.score} · ${S.lines}줄`);
}
