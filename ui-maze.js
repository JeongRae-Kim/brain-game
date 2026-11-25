// 🍒 미로 먹기 — 고양이가 미로의 생선 과자를 먹고, 로봇 술래를 피함 · 3분 점수
import { arcade } from "./arcade.js";
import { shuffle } from "./games.js";

const MC = 8, MR = 10;                     // 방(칸) 수
const TW = MC * 2 + 1, TH = MR * 2 + 1;    // 타일 수 (17 × 21)
const T = 20, OY = 24;
const W = TW * T, H = OY + TH * T;
const LV = {
  1: { foes: 2, foeSpeed: 3.2, chase: 0.55, power: 8 },
  2: { foes: 2, foeSpeed: 3.7, chase: 0.65, power: 7 },
  3: { foes: 3, foeSpeed: 4.1, chase: 0.72, power: 6 },
  4: { foes: 3, foeSpeed: 4.5, chase: 0.80, power: 5 },
  5: { foes: 4, foeSpeed: 4.9, chase: 0.88, power: 4 }
};
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: "down", down: "up", left: "right", right: "left" };
const FOE_COLORS = ["#e86a5a", "#6c8ee6", "#a77bd6", "#3fae6a"];
const CAUGHT_PENALTY = 200;

export function playMaze(ctx) {
  const cfg = LV[ctx.level] || LV[2];
  const A = arcade(ctx, {
    W, H, prompt: "과자를 다 먹고 로봇을 피하세요",
    buttons: [{ id: "left", label: "◀" }, { id: "up", label: "▲" }, { id: "down", label: "▼" }, { id: "right", label: "▶" }]
  });
  const { g, rand } = A;
  let wall, dots;
  const S = { stage: 0, caught: 0, eaten: 0, power: 0, combo: 0, hurt: 0, speedMul: 1, p: null, foes: [], start: null, home: null };
  A.state = S;

  // ---------- 미로 만들기 (같은 seed면 같은 미로) ----------
  function makeMaze() {
    wall = Array.from({ length: TH }, () => new Array(TW).fill(true));
    const seen = Array.from({ length: MR }, () => new Array(MC).fill(false));
    const open = (cx, cy) => { wall[cy * 2 + 1][cx * 2 + 1] = false; };
    const stack = [[0, 0]];
    seen[0][0] = true; open(0, 0);
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = shuffle(Object.values(DIRS), rand).map(([dx, dy]) => [cx + dx, cy + dy, dx, dy])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < MC && y < MR && !seen[y][x]);
      if (!nb.length) { stack.pop(); continue; }
      const [x, y, dx, dy] = nb[0];
      wall[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = false;
      seen[y][x] = true; open(x, y);
      stack.push([x, y]);
    }
    // 막다른 길 없애기 + 길 몇 개 더 뚫기 (빙 돌아갈 수 있게)
    for (let cy = 0; cy < MR; cy++) for (let cx = 0; cx < MC; cx++) {
      const tx = cx * 2 + 1, ty = cy * 2 + 1;
      const exits = Object.values(DIRS).filter(([dx, dy]) => !wall[ty + dy][tx + dx]).length;
      if (exits <= 1 || rand() < 0.12) {
        const opts = shuffle(Object.values(DIRS), rand).filter(([dx, dy]) => {
          const x = tx + dx * 2, y = ty + dy * 2;
          return x > 0 && y > 0 && x < TW - 1 && y < TH - 1 && wall[ty + dy][tx + dx];
        });
        if (opts.length) wall[ty + opts[0][1]][tx + opts[0][0]] = false;
      }
    }
    dots = Array.from({ length: TH }, (_, y) => Array.from({ length: TW }, (_, x) => (wall[y][x] ? 0 : 1)));
    // 큰 알약: 네 귀퉁이 근처
    for (const [x, y] of [[1, 1], [TW - 2, 1], [1, TH - 2], [TW - 2, TH - 2]]) dots[y][x] = 2;
    S.start = { x: Math.floor(MC / 2) * 2 + 1, y: TH - 2 };
    S.home = { x: Math.floor(MC / 2) * 2 + 1, y: Math.floor(MR / 2) * 2 + 1 };
    dots[S.start.y][S.start.x] = 0;
    dots[S.home.y][S.home.x] = 0;
  }
  const canGo = (x, y, d) => { const [dx, dy] = DIRS[d]; return !wall[y + dy]?.[x + dx]; };
  const dotsLeft = () => dots.flat().filter(Boolean).length;

  function resetActors() {
    S.p = { x: S.start.x, y: S.start.y, dir: null, want: null, prog: 0 };
    S.foes = [];
    for (let i = 0; i < cfg.foes; i++) {
      S.foes.push({ x: S.home.x, y: S.home.y, dir: null, prog: 0, color: FOE_COLORS[i], wait: 1 + i * 1.2, eaten: false });
    }
  }
  function newStage() {
    S.stage++;
    S.speedMul = 1 + (S.stage - 1) * 0.05;
    makeMaze();
    resetActors();
    S.power = 0;
    if (S.stage > 1) A.pop(W / 2, H / 2, `${S.stage}판!`, "#ffd34d", 1.4);
  }

  // ---------- 조작 ----------
  const want = d => {
    const p = S.p;
    if (!p) return;
    p.want = d;
    // 반대 방향은 바로 돌아섬
    if (p.dir && p.prog > 0 && d === OPP[p.dir]) {
      const [dx, dy] = DIRS[p.dir];
      p.x += dx; p.y += dy; p.prog = 1 - p.prog; p.dir = d;
    }
  };
  A.onPress = id => { if (DIRS[id]) want(id); };
  A.onSwipe = d => want(d);

  // ---------- 움직이기: 타일 중심에서만 방향을 바꿈 ----------
  function advance(a, speed, dt, chooseDir) {
    let left = speed * dt;
    while (left > 0) {
      if (a.prog === 0) {
        const d = chooseDir(a);
        if (!d) return;
        a.dir = d;
      }
      const need = 1 - a.prog;
      const stepLen = Math.min(need, left);
      a.prog += stepLen;
      left -= stepLen;
      if (a.prog >= 1 - 1e-6) {
        const [dx, dy] = DIRS[a.dir];
        a.x += dx; a.y += dy; a.prog = 0;
        a.onTile?.();
      }
    }
  }
  const posOf = a => {
    if (!a.dir || !a.prog) return [a.x, a.y];
    const [dx, dy] = DIRS[a.dir];
    return [a.x + dx * a.prog, a.y + dy * a.prog];
  };

  function playerDir(p) {
    if (p.want && canGo(p.x, p.y, p.want)) return p.want;
    if (p.dir && canGo(p.x, p.y, p.dir)) return p.dir;
    return null;
  }
  function foeDir(f) {
    const opts = Object.keys(DIRS).filter(d => canGo(f.x, f.y, d));
    let choices = opts.filter(d => d !== OPP[f.dir]);
    if (!choices.length) choices = opts;
    if (f.eaten) {                    // 집으로 돌아감
      return best(choices, f, S.home, false);
    }
    if (S.power > 0) return best(choices, f, S.p, true);
    if (rand() < cfg.chase) return best(choices, f, S.p, false);
    return choices[Math.floor(rand() * choices.length)];
  }
  function best(choices, f, target, far) {
    let pick = choices[0], bestD = far ? -1 : 1e9;
    for (const d of choices) {
      const [dx, dy] = DIRS[d];
      const dist = Math.abs(f.x + dx - target.x) + Math.abs(f.y + dy - target.y);
      if (far ? dist > bestD : dist < bestD) { bestD = dist; pick = d; }
    }
    return pick;
  }

  function step(dt) {
    S.hurt = Math.max(0, S.hurt - dt);
    if (S.power > 0) { S.power -= dt; if (S.power <= 0) S.combo = 0; }
    const p = S.p;
    p.onTile = () => {
      const v = dots[p.y][p.x];
      if (!v) return;
      dots[p.y][p.x] = 0;
      if (v === 1) { A.score += 10; S.eaten++; }
      else { A.score += 50; S.power = cfg.power; S.combo = 0; A.pop(p.x * T + T / 2, OY + p.y * T, "로봇 잡기!", "#7fd3ff"); }
    };
    advance(p, 5.6 * S.speedMul, dt, playerDir);
    for (const f of S.foes) {
      if (f.wait > 0) { f.wait -= dt; continue; }
      f.onTile = () => { if (f.eaten && f.x === S.home.x && f.y === S.home.y) { f.eaten = false; f.wait = 1.5; } };
      const sp = f.eaten ? 9 : (S.power > 0 ? cfg.foeSpeed * 0.6 : cfg.foeSpeed) * S.speedMul;
      advance(f, sp, dt, foeDir);
    }
    // 부딪힘
    const [px, py] = posOf(p);
    for (const f of S.foes) {
      if (f.wait > 0 || f.eaten) continue;
      const [fx, fy] = posOf(f);
      if (Math.abs(fx - px) + Math.abs(fy - py) > 0.7) continue;
      if (S.power > 0) {
        S.combo++;
        const pts = 200 * S.combo;
        A.score += pts;
        f.eaten = true;
        A.pop(fx * T + T / 2, OY + fy * T, `+${pts}`, "#ffd34d", 1.1);
      } else if (S.hurt <= 0) {
        A.score = Math.max(0, A.score - CAUGHT_PENALTY);
        S.caught++;
        A.pop(px * T + T / 2, OY + py * T, `-${CAUGHT_PENALTY}`, "#ff6b6b", 1.2);
        resetActors();
        S.hurt = 2;
        break;
      }
    }
    if (!dotsLeft()) { A.score += 500; A.pop(W / 2, H / 2 + 30, "+500 보너스", "#ffd34d", 1.4); newStage(); }
  }

  // ---------- 그리기 ----------
  function cat(x, y) {
    if (S.hurt > 0 && Math.floor(S.hurt * 10) % 2) return;
    const cx = x * T + T / 2, cy = OY + y * T + T / 2, r = T * 0.42;
    g.fillStyle = "#f2a541";
    g.beginPath(); g.moveTo(cx - r, cy - r * 0.2); g.lineTo(cx - r * 0.7, cy - r * 1.25); g.lineTo(cx - r * 0.1, cy - r * 0.8); g.fill();
    g.beginPath(); g.moveTo(cx + r, cy - r * 0.2); g.lineTo(cx + r * 0.7, cy - r * 1.25); g.lineTo(cx + r * 0.1, cy - r * 0.8); g.fill();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2b2b2b";
    g.beginPath(); g.arc(cx - r * 0.35, cy - r * 0.1, 1.8, 0, Math.PI * 2); g.arc(cx + r * 0.35, cy - r * 0.1, 1.8, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e86a8a";
    g.beginPath(); g.arc(cx, cy + r * 0.25, 1.6, 0, Math.PI * 2); g.fill();
  }
  function robot(f) {
    if (f.wait > 0 && !f.eaten && Math.floor(f.wait * 6) % 2) return;
    const [x, y] = posOf(f);
    const cx = x * T + T / 2, cy = OY + y * T + T / 2, s = T * 0.78;
    const scared = S.power > 0 && !f.eaten;
    if (!f.eaten) {
      g.fillStyle = scared ? (S.power < 1.5 && Math.floor(S.power * 6) % 2 ? "#ffffff" : "#9fd8ff") : f.color;
      g.beginPath(); g.roundRect(cx - s / 2, cy - s / 2, s, s, 4); g.fill();
      g.strokeStyle = g.fillStyle; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy - s / 2); g.lineTo(cx, cy - s / 2 - 4); g.stroke();
      g.beginPath(); g.arc(cx, cy - s / 2 - 5, 2, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "#ffffff";
    g.fillRect(cx - s * 0.32, cy - s * 0.15, s * 0.22, s * 0.22);
    g.fillRect(cx + s * 0.1, cy - s * 0.15, s * 0.22, s * 0.22);
    g.fillStyle = "#132238";
    g.fillRect(cx - s * 0.26, cy - s * 0.09, s * 0.1, s * 0.1);
    g.fillRect(cx + s * 0.16, cy - s * 0.09, s * 0.1, s * 0.1);
  }
  function draw(dt) {
    g.fillStyle = "#101b30";
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
      if (wall[y][x]) {
        g.fillStyle = "#2c4f8a";
        g.beginPath(); g.roundRect(x * T + 2, OY + y * T + 2, T - 4, T - 4, 5); g.fill();
      } else if (dots[y][x] === 1) {
        g.fillStyle = "#f6e7c8";
        g.beginPath(); g.arc(x * T + T / 2, OY + y * T + T / 2, 2.4, 0, Math.PI * 2); g.fill();
      } else if (dots[y][x] === 2) {
        g.fillStyle = "#ffd34d";
        g.beginPath(); g.arc(x * T + T / 2, OY + y * T + T / 2, 6 + Math.sin(performance.now() / 150), 0, Math.PI * 2); g.fill();
      }
    }
    for (const f of S.foes) robot(f);
    const [px, py] = posOf(S.p);
    cat(px, py);
    A.drawPops(dt);
    A.hud(`점수 ${A.score}`, `${S.stage}판` + (S.power > 0 ? ` ⚡${Math.ceil(S.power)}` : ""));
  }

  newStage();
  A.run(step, draw,
    () => ({ score: A.score, wrong: S.caught, wrongLabel: "잡힌 횟수", stages: S.stage }),
    () => `점수 ${A.score} · 남은 과자 ${dotsLeft()}`);
}
