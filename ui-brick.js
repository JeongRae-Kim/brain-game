// 🧱 벽돌 깨기 — 3분 동안 점수 겨루기
import { arcade } from "./arcade.js";

const W = 360, H = 480;
const LV = {
  1: { rows: 4, speed: 230, hard: 0.00, paddle: 84 },
  2: { rows: 5, speed: 255, hard: 0.10, paddle: 76 },
  3: { rows: 5, speed: 280, hard: 0.20, paddle: 70 },
  4: { rows: 6, speed: 305, hard: 0.28, paddle: 64 },
  5: { rows: 7, speed: 335, hard: 0.35, paddle: 58 }
};
const BCOLS = 8, BW = (W - 20) / BCOLS, BH = 18, TOP = 44;
const ROW_COLORS = ["#e8743b", "#f2a541", "#f4d35e", "#7bc96f", "#4fb0c6", "#6c8ee6", "#a77bd6"];
const LOSE_PENALTY = 100;

export function playBrick(ctx) {
  const cfg = LV[ctx.level] || LV[2];
  const A = arcade(ctx, {
    W, H, prompt: "받침대를 움직여 공을 튕기세요",
    buttons: [{ id: "left", label: "◀" }, { id: "right", label: "▶" }]
  });
  const { g, rand } = A;
  const S = {
    stage: 0, px: W / 2, pw: cfg.paddle, wide: 0, balls: [], bricks: [], items: [],
    lost: 0, broken: 0, wait: 0, speedMul: 1
  };
  A.state = S;

  function newStage() {
    S.stage++;
    S.speedMul = 1 + (S.stage - 1) * 0.06;
    S.bricks = [];
    const pattern = Math.floor(rand() * 3);          // 0 꽉 참, 1 체크무늬 빈칸, 2 가운데 구멍
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < BCOLS; c++) {
        if (pattern === 1 && (r + c) % 5 === 4) continue;
        if (pattern === 2 && r >= 1 && r < cfg.rows - 1 && (c === 3 || c === 4)) continue;
        const hard = rand() < cfg.hard;
        S.bricks.push({ x: 10 + c * BW, y: TOP + r * (BH + 4), r, hp: hard ? 2 : 1, hard });
      }
    }
    S.balls = [];
    serve();
    if (S.stage > 1) A.pop(W / 2, H / 2, `${S.stage}판!`, "#ffd34d", 1.4);
  }
  function serve() {
    S.wait = 0.9;
    const ang = (-Math.PI / 2) + (rand() - 0.5) * 0.8;
    S.balls.push({ x: S.px, y: H - 52, vx: Math.cos(ang), vy: Math.sin(ang), stuck: true });
  }

  function step(dt) {
    // 받침대
    const dir = (A.held.right ? 1 : 0) - (A.held.left ? 1 : 0);
    if (dir) S.px += dir * 330 * dt;
    else if (A.drag) {
      const d = A.drag.x - S.px;
      S.px += Math.sign(d) * Math.min(Math.abs(d), 520 * dt);
    }
    S.wide = Math.max(0, S.wide - dt);
    S.pw = cfg.paddle * (S.wide > 0 ? 1.5 : 1);
    S.px = Math.max(S.pw / 2 + 4, Math.min(W - S.pw / 2 - 4, S.px));

    if (S.wait > 0) {
      S.wait -= dt;
      for (const b of S.balls) if (b.stuck) { b.x = S.px; b.y = H - 52; }
      if (S.wait <= 0) for (const b of S.balls) b.stuck = false;
    }
    const sp = cfg.speed * S.speedMul;
    for (const b of S.balls) {
      if (b.stuck) continue;
      // 작은 걸음으로 나눠 움직여 벽돌을 뚫고 지나가지 않게
      const n = 3;
      for (let k = 0; k < n; k++) {
        b.x += b.vx * sp * dt / n;
        b.y += b.vy * sp * dt / n;
        if (b.x < 6) { b.x = 6; b.vx = Math.abs(b.vx); }
        if (b.x > W - 6) { b.x = W - 6; b.vx = -Math.abs(b.vx); }
        if (b.y < 30) { b.y = 30; b.vy = Math.abs(b.vy); }
        // 받침대
        const py = H - 40;
        if (b.vy > 0 && b.y > py - 7 && b.y < py + 6 && Math.abs(b.x - S.px) < S.pw / 2 + 6) {
          const off = (b.x - S.px) / (S.pw / 2);               // -1 ~ 1
          const ang = -Math.PI / 2 + off * 1.05;
          b.vx = Math.cos(ang); b.vy = Math.sin(ang);
          b.y = py - 7;
        }
        // 벽돌
        for (const br of S.bricks) {
          if (br.dead) continue;
          if (b.x > br.x - 5 && b.x < br.x + BW - 2 + 5 && b.y > br.y - 5 && b.y < br.y + BH + 5) {
            const cx = br.x + (BW - 2) / 2, cy = br.y + BH / 2;
            const ox = (b.x - cx) / (BW / 2), oy = (b.y - cy) / (BH / 2);
            if (Math.abs(ox) > Math.abs(oy)) b.vx = Math.sign(ox) * Math.abs(b.vx);
            else b.vy = Math.sign(oy) * Math.abs(b.vy);
            br.hp--;
            if (br.hp <= 0) {
              br.dead = true;
              const pts = br.hard ? 100 : 50;
              A.score += pts;
              S.broken++;
              A.pop(cx, cy, `+${pts}`);
              const roll = rand();
              if (roll < 0.05) S.items.push({ x: cx, y: cy, kind: "wide" });
              else if (roll < 0.09) S.items.push({ x: cx, y: cy, kind: "multi" });
              else if (roll < 0.12) S.items.push({ x: cx, y: cy, kind: "gem" });
            }
            break;
          }
        }
      }
    }
    S.bricks = S.bricks.filter(b => !b.dead);
    // 떨어진 공
    const before = S.balls.length;
    S.balls = S.balls.filter(b => b.y < H + 10);
    if (before && !S.balls.length) {
      A.score = Math.max(0, A.score - LOSE_PENALTY);
      S.lost++;
      A.pop(S.px, H - 80, `-${LOSE_PENALTY}`, "#ff6b6b", 1.2);
      serve();
    }
    // 아이템
    for (const it of S.items) {
      it.y += 110 * dt;
      if (it.y > H - 50 && it.y < H - 28 && Math.abs(it.x - S.px) < S.pw / 2 + 10) {
        it.y = H + 99;
        if (it.kind === "wide") { S.wide = 12; A.pop(S.px, H - 80, "받침대 길게!", "#ffd34d"); }
        else if (it.kind === "multi") {
          const src = S.balls.find(b => !b.stuck) || S.balls[0];
          if (src) for (const a of [-0.5, 0.5]) {
            const ang = Math.atan2(src.vy, src.vx) + a;
            S.balls.push({ x: src.x, y: src.y, vx: Math.cos(ang), vy: -Math.abs(Math.sin(ang)) });
          }
          A.pop(S.px, H - 80, "공 3개!", "#ffd34d");
        } else { A.score += 200; A.pop(S.px, H - 80, "+200 💎", "#7fffd4"); }
      }
    }
    S.items = S.items.filter(it => it.y < H + 10);
    if (!S.bricks.length) { A.score += 500; A.pop(W / 2, H / 2 + 30, "+500 보너스", "#ffd34d", 1.4); newStage(); }
  }

  const ICON = { wide: "↔️", multi: "⚪", gem: "💎" };
  function draw(dt) {
    g.fillStyle = "#132238";
    g.fillRect(0, 0, W, H);
    for (const br of S.bricks) {
      g.fillStyle = br.hard ? (br.hp > 1 ? "#9aa3b2" : "#c9ced6") : ROW_COLORS[br.r % ROW_COLORS.length];
      g.beginPath();
      g.roundRect(br.x, br.y, BW - 2, BH, 4);
      g.fill();
      g.fillStyle = "rgba(255,255,255,.25)";
      g.fillRect(br.x + 3, br.y + 2, BW - 8, 3);
    }
    g.font = "18px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const it of S.items) g.fillText(ICON[it.kind], it.x, it.y);
    g.fillStyle = "#f6f1e9";
    for (const b of S.balls) { g.beginPath(); g.arc(b.x, b.y, 6, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = S.wide > 0 ? "#ffd34d" : "#e8743b";
    g.beginPath();
    g.roundRect(S.px - S.pw / 2, H - 40, S.pw, 12, 6);
    g.fill();
    A.drawPops(dt);
    A.hud(`점수 ${A.score}`, `${S.stage}판`);
  }

  newStage();
  A.run(step, draw,
    () => ({ score: A.score, wrong: S.lost, wrongLabel: "놓친 공", stages: S.stage, broken: S.broken }),
    () => `점수 ${A.score} · ${S.stage}판`);
}
