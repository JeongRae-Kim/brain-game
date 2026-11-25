// 🚀 우주 방어대 — 2분 동안 점수 겨루기 (자동 발사, 좌우 이동만)
import { rng } from "./games.js";

export const SHOOTER_MS = 2 * 60000;
const W = 360, H = 480;            // 논리 좌표
const LV = {
  1: { rows: 3, dive: 2.4, shot: 0.0, speed: 0.80 },
  2: { rows: 3, dive: 2.0, shot: 0.25, speed: 0.90 },
  3: { rows: 4, dive: 1.6, shot: 0.40, speed: 1.00 },
  4: { rows: 4, dive: 1.3, shot: 0.55, speed: 1.15 },
  5: { rows: 5, dive: 1.0, shot: 0.70, speed: 1.30 }
};
const KINDS = [
  { pts: 150, hp: 2, r: 15, body: "#8e5bd6", dome: "#f1d7ff" },   // 대장선 (맨 위)
  { pts: 80, hp: 1, r: 12, body: "#2f8fd8", dome: "#d6efff" },
  { pts: 50, hp: 1, r: 11, body: "#3fae6a", dome: "#dcf7e6" }
];
const COLS = 8;
const HIT_PENALTY = 100;

export function playShooter(ctx) {
  const cfg = LV[ctx.level] || LV[2];
  const rand = rng(ctx.seed);

  // ---------- 화면 ----------
  const grid = ctx.grid;
  grid.className = "shooter";
  grid.style.gridTemplateColumns = "";
  grid.textContent = "";
  const cv = document.createElement("canvas");
  cv.className = "shooter-cv";
  grid.appendChild(cv);
  const g = cv.getContext("2d");
  const ctrl = document.createElement("div");
  ctrl.className = "shooter-ctrl";
  const left = document.createElement("button");
  left.className = "btn";
  left.textContent = "◀";
  const right = document.createElement("button");
  right.className = "btn";
  right.textContent = "▶";
  ctrl.append(left, right);
  ctx.controls.append(ctrl);
  ctx.prompt.textContent = "좌우로 움직이기 · 자동 발사";
  document.body.classList.add("no-chat-fab");

  function fit() {
    const maxW = Math.min(grid.clientWidth || 360, 560);
    const maxH = Math.max(320, window.innerHeight - 260);
    const w = Math.min(maxW, maxH * (W / H));
    const dpr = window.devicePixelRatio || 1;
    cv.style.width = w + "px";
    cv.style.height = w * (H / W) + "px";
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * (H / W) * dpr);
    g.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  }
  fit();
  window.addEventListener("resize", fit);

  // ---------- 상태 ----------
  const S = {
    score: 0, wave: 0, hits: 0, kills: 0,
    px: W / 2, target: null, hold: 0,
    shots: [], foes: [], bombs: [], items: [], pops: [],
    fireT: 0, diveT: cfg.dive, sway: 0, double: 0, shield: false, hurt: 0,
    stars: Array.from({ length: 50 }, () => ({ x: rand() * W, y: rand() * H, s: 0.5 + rand() * 1.5 })),
    done: false
  };
  const waveMul = () => cfg.speed * (1 + S.wave * 0.08);

  function newWave() {
    S.wave++;
    S.foes = [];
    for (let r = 0; r < cfg.rows; r++) {
      const kind = r === 0 ? 0 : r <= Math.ceil((cfg.rows - 1) / 2) ? 1 : 2;
      for (let c = 0; c < COLS; c++) {
        S.foes.push({ r, c, kind, hp: KINDS[kind].hp, x: 0, y: -40 - r * 30, state: "enter", t: 0, phase: rand() * 6 });
      }
    }
    if (S.wave > 1) pop(W / 2, H / 2, `웨이브 ${S.wave}!`, "#ffd34d", 1.6);
  }
  const slot = f => ({ x: 34 + f.c * ((W - 68) / (COLS - 1)) + Math.sin(S.sway) * 18, y: 60 + f.r * 34 });

  function pop(x, y, text, color, life = 0.9) { S.pops.push({ x, y, text, color, life, max: life }); }

  // ---------- 조작 ----------
  const toX = e => {
    const b = cv.getBoundingClientRect();
    return ((e.clientX - b.left) / b.width) * W;
  };
  cv.addEventListener("pointerdown", e => { S.target = toX(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", e => { if (S.target !== null) S.target = toX(e); });
  const release = () => { S.target = null; };
  cv.addEventListener("pointerup", release);
  cv.addEventListener("pointercancel", release);
  const holdBtn = (b, d) => {
    b.addEventListener("pointerdown", e => { e.preventDefault(); S.hold = d; S.target = null; });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => { if (S.hold === d) S.hold = 0; });
  };
  holdBtn(left, -1);
  holdBtn(right, 1);
  const keys = {};
  ctx.setKeys(e => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      keys[e.key] = e.type !== "keyup";
      e.preventDefault();
    }
  });
  const up = e => { if (e.key in keys) keys[e.key] = false; };
  document.addEventListener("keyup", up);

  // ---------- 진행 ----------
  function step(dt) {
    // 별 배경
    for (const s of S.stars) { s.y += s.s * 30 * dt; if (s.y > H) { s.y = 0; s.x = rand() * W; } }
    // 우주선 이동
    const kd = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
    const dir = S.hold || kd;
    if (dir) S.px += dir * 260 * dt;
    else if (S.target !== null) {
      const d = S.target - S.px;
      S.px += Math.sign(d) * Math.min(Math.abs(d), 420 * dt);
    }
    S.px = Math.max(18, Math.min(W - 18, S.px));
    // 자동 발사
    S.fireT -= dt;
    if (S.fireT <= 0) {
      S.fireT = 0.28;
      if (S.double > 0) { S.shots.push({ x: S.px - 8, y: H - 52 }, { x: S.px + 8, y: H - 52 }); }
      else S.shots.push({ x: S.px, y: H - 52 });
    }
    S.double = Math.max(0, S.double - dt);
    S.hurt = Math.max(0, S.hurt - dt);
    for (const s of S.shots) s.y -= 430 * dt;
    S.shots = S.shots.filter(s => s.y > -10);

    // 적
    S.sway += dt * 0.9;
    const mul = waveMul();
    S.diveT -= dt;
    const idle = S.foes.filter(f => f.state === "slot");
    if (S.diveT <= 0 && idle.length) {
      S.diveT = cfg.dive / Math.min(1.6, 1 + S.wave * 0.06);
      const f = idle[Math.floor(rand() * idle.length)];
      f.state = "dive"; f.t = 0; f.sx = f.x; f.sy = f.y; f.aim = S.px; f.fired = false;
    }
    for (const f of S.foes) {
      const home = slot(f);
      if (f.state === "enter") {
        f.t += dt;
        f.x = home.x + Math.sin(f.t * 4 + f.phase) * 30 * Math.max(0, 1 - f.t);
        f.y += (home.y - f.y) * Math.min(1, dt * 3);
        if (Math.abs(f.y - home.y) < 1.5 && f.t > 0.8) f.state = "slot";
      } else if (f.state === "slot") {
        f.x = home.x; f.y = home.y;
      } else if (f.state === "dive") {
        f.t += dt * mul;
        const p = f.t / 2.4;                     // 0 → 1 동안 내려감
        f.y = f.sy + p * (H + 60 - f.sy);
        f.x = f.sx + (f.aim - f.sx) * Math.min(1, p * 1.6) + Math.sin(f.t * 3 + f.phase) * 50;
        if (!f.fired && p > 0.25 && rand() < cfg.shot) {
          f.fired = true;
          S.bombs.push({ x: f.x, y: f.y + 10, vx: (S.px - f.x) * 0.25, vy: 170 * mul });
        } else if (!f.fired && p > 0.25) f.fired = true;
        if (f.y > H + 40) { f.state = "enter"; f.y = -30; f.t = 0; }
      }
    }
    for (const b of S.bombs) { b.x += b.vx * dt; b.y += b.vy * dt; }
    S.bombs = S.bombs.filter(b => b.y < H + 10);
    for (const it of S.items) it.y += 90 * dt;
    S.items = S.items.filter(it => it.y < H + 10);

    // 맞히기
    for (const s of S.shots) {
      for (const f of S.foes) {
        if (f.dead) continue;
        const k = KINDS[f.kind];
        if (Math.abs(s.x - f.x) < k.r + 3 && Math.abs(s.y - f.y) < k.r + 4) {
          s.y = -99;
          f.hp--;
          if (f.hp <= 0) {
            f.dead = true;
            const pts = k.pts * (f.state === "dive" ? 2 : 1);
            S.score += pts; S.kills++;
            pop(f.x, f.y, `+${pts}`, f.state === "dive" ? "#ffd34d" : "#ffffff");
            const roll = rand();
            if (roll < 0.05) S.items.push({ x: f.x, y: f.y, kind: "star" });
            else if (roll < 0.09) S.items.push({ x: f.x, y: f.y, kind: "shield" });
            else if (roll < 0.12) S.items.push({ x: f.x, y: f.y, kind: "gem" });
          } else pop(f.x, f.y, "!", "#ffd34d", 0.4);
          break;
        }
      }
    }
    S.foes = S.foes.filter(f => !f.dead);
    if (!S.foes.length) { S.score += 300; pop(W / 2, H / 2 + 30, "+300 보너스", "#ffd34d", 1.4); newWave(); }

    // 우주선이 맞음
    const py = H - 40;
    const hitMe = (x, y, r) => Math.abs(x - S.px) < r + 14 && Math.abs(y - py) < r + 14;
    const ouch = () => {
      if (S.hurt > 0) return;
      if (S.shield) { S.shield = false; S.hurt = 1; pop(S.px, py - 30, "방패!", "#7fd3ff"); return; }
      S.score = Math.max(0, S.score - HIT_PENALTY);
      S.hits++; S.hurt = 1.5;
      pop(S.px, py - 30, `-${HIT_PENALTY}`, "#ff6b6b", 1.2);
    };
    for (const b of S.bombs) if (hitMe(b.x, b.y, 3)) { b.y = H + 99; ouch(); }
    for (const f of S.foes) if (f.state === "dive" && hitMe(f.x, f.y, KINDS[f.kind].r - 2)) { ouch(); }
    for (const it of S.items) {
      if (!hitMe(it.x, it.y, 10)) continue;
      it.y = H + 99;
      if (it.kind === "star") { S.double = 10; pop(S.px, py - 30, "쌍발 10초!", "#ffd34d"); }
      else if (it.kind === "shield") { S.shield = true; pop(S.px, py - 30, "방패!", "#7fd3ff"); }
      else { S.score += 200; pop(S.px, py - 30, "+200 💎", "#7fffd4"); }
    }
    for (const p of S.pops) { p.life -= dt; p.y -= 30 * dt; }
    S.pops = S.pops.filter(p => p.life > 0);
  }

  // ---------- 그리기 ----------
  function ship(x, y) {
    if (S.hurt > 0 && Math.floor(S.hurt * 10) % 2) return;
    g.save();
    g.translate(x, y);
    g.fillStyle = "#ff9a3c";                              // 불꽃
    g.beginPath(); g.moveTo(-6, 16); g.lineTo(0, 26 + Math.random() * 6); g.lineTo(6, 16); g.fill();
    g.fillStyle = "#e9eef5";                              // 몸체
    g.beginPath(); g.moveTo(0, -22); g.quadraticCurveTo(12, -6, 10, 16); g.lineTo(-10, 16); g.quadraticCurveTo(-12, -6, 0, -22); g.fill();
    g.fillStyle = "#e8743b";                              // 날개
    g.beginPath(); g.moveTo(-10, 4); g.lineTo(-22, 18); g.lineTo(-9, 16); g.fill();
    g.beginPath(); g.moveTo(10, 4); g.lineTo(22, 18); g.lineTo(9, 16); g.fill();
    g.fillStyle = "#3aa7c9";                              // 창
    g.beginPath(); g.arc(0, -4, 5, 0, Math.PI * 2); g.fill();
    if (S.shield) { g.strokeStyle = "rgba(127,211,255,.8)"; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 27, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }
  function saucer(f) {
    const k = KINDS[f.kind];
    g.save();
    g.translate(f.x, f.y);
    g.fillStyle = k.dome;
    g.beginPath(); g.ellipse(0, -k.r * 0.35, k.r * 0.55, k.r * 0.5, 0, Math.PI, 0); g.fill();
    g.fillStyle = f.hp < k.hp ? "#c06060" : k.body;
    g.beginPath(); g.ellipse(0, 0, k.r, k.r * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffe680";
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(i * k.r * 0.5, 1, 1.8, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  const ITEM_ICON = { star: "⭐", shield: "🛡️", gem: "💎" };
  function draw() {
    g.fillStyle = "#121a33";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#ffffff";
    for (const s of S.stars) { g.globalAlpha = 0.3 + s.s * 0.35; g.fillRect(s.x, s.y, s.s, s.s); }
    g.globalAlpha = 1;
    for (const f of S.foes) saucer(f);
    g.fillStyle = "#ffe14d";
    for (const s of S.shots) g.fillRect(s.x - 1.5, s.y - 7, 3, 10);
    g.fillStyle = "#ff6b6b";
    for (const b of S.bombs) { g.beginPath(); g.arc(b.x, b.y, 3.5, 0, Math.PI * 2); g.fill(); }
    g.font = "20px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const it of S.items) g.fillText(ITEM_ICON[it.kind], it.x, it.y);
    ship(S.px, H - 40);
    for (const p of S.pops) {
      g.globalAlpha = Math.min(1, p.life / p.max * 1.5);
      g.fillStyle = p.color;
      g.font = `bold ${p.max > 1 ? 26 : 16}px sans-serif`;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
    g.textAlign = "left";
    g.font = "bold 16px sans-serif";
    g.fillStyle = "#ffffff";
    g.fillText(`점수 ${S.score}`, 10, 16);
    g.textAlign = "right";
    g.fillText(`웨이브 ${S.wave}` + (S.double > 0 ? " ⭐" : ""), W - 10, 16);
  }

  // ---------- 반복 ----------
  let last = performance.now();
  function frame() {
    if (S.done || ctx.isOver()) { cleanup(); return; }
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05);
    step(dt);
    draw();
    ctx.progress.textContent = `점수 ${S.score} · 웨이브 ${S.wave}`;
    requestAnimationFrame(frame);
  }
  function cleanup() {
    document.body.classList.remove("no-chat-fab");
    window.removeEventListener("resize", fit);
    document.removeEventListener("keyup", up);
  }

  ctx.setLimit(SHOOTER_MS, () => {
    if (S.done) return;
    S.done = true;
    cleanup();
    ctx.finish({
      score: S.score, scoreMode: true, scoreText: `${S.score}점`,
      wrong: S.hits, waves: S.wave, kills: S.kills
    });
  });
  newWave();
  requestAnimationFrame(frame);
}
