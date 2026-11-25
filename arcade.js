// 오락실 게임 공통 틀: 캔버스 · 버튼 · 키보드 · 끌기/밀기 · 3분 제한 · 결과
import { rng } from "./games.js";

export const ARCADE_MS = 3 * 60000;

const KEYMAP = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", " ": "drop", z: "rotate", x: "rotate" };

// buttons: [{ id, label, wide? }] — 누르고 있는 동안 held[id] = true, 누르는 순간 onPress(id)
export function arcade(ctx, { W, H, prompt, buttons = [], cols }) {
  const grid = ctx.grid;
  grid.className = "shooter";
  grid.style.gridTemplateColumns = "";
  grid.textContent = "";
  const cv = document.createElement("canvas");
  cv.className = "shooter-cv";
  grid.appendChild(cv);
  const g = cv.getContext("2d");
  ctx.prompt.textContent = prompt;
  document.body.classList.add("no-chat-fab");

  const A = {
    g, cv, W, H, rand: rng(ctx.seed), held: {}, drag: null, done: false,
    onPress: null, onSwipe: null, onTap: null, score: 0, pops: []
  };

  // 버튼
  if (buttons.length) {
    const ctrl = document.createElement("div");
    ctrl.className = "shooter-ctrl";
    ctrl.style.gridTemplateColumns = cols || `repeat(${buttons.length}, 1fr)`;
    for (const b of buttons) {
      const el = document.createElement("button");
      el.className = "btn" + (b.small ? " small-label" : "");
      el.textContent = b.label;
      if (b.span) el.style.gridColumn = `span ${b.span}`;
      el.addEventListener("pointerdown", e => {
        e.preventDefault();
        A.held[b.id] = true;
        A.onPress?.(b.id);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, () => { A.held[b.id] = false; });
      ctrl.appendChild(el);
    }
    ctx.controls.append(ctrl);
  }

  // 키보드
  ctx.setKeys(e => {
    const id = KEYMAP[e.key] || KEYMAP[e.key?.toLowerCase?.()];
    if (!id) return;
    e.preventDefault();
    if (!A.held[id]) A.onPress?.(id);
    A.held[id] = true;
  });
  const keyup = e => {
    const id = KEYMAP[e.key] || KEYMAP[e.key?.toLowerCase?.()];
    if (id) A.held[id] = false;
  };
  document.addEventListener("keyup", keyup);

  // 화면 끌기 / 밀기
  const pos = e => {
    const b = cv.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * W, y: ((e.clientY - b.top) / b.height) * H };
  };
  let start = null;
  cv.addEventListener("pointerdown", e => { start = pos(e); A.drag = { ...start }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", e => { if (A.drag) A.drag = pos(e); });
  const up = e => {
    if (!start) return;
    const p = pos(e);
    const dx = p.x - start.x, dy = p.y - start.y;
    if (Math.hypot(dx, dy) > 18) A.onSwipe?.(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
    else A.onTap?.(p);
    start = null;
    A.drag = null;
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", () => { start = null; A.drag = null; });

  function fit() {
    const maxW = Math.min(grid.clientWidth || 360, 560);
    const maxH = Math.max(300, window.innerHeight - 280);
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

  if (location.search.includes("debug")) window.__arcade = A;   // 시험용
  A.pop = (x, y, text, color = "#fff", life = 0.9) => A.pops.push({ x, y, text, color, life, max: life });
  A.drawPops = dt => {
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const p of A.pops) {
      p.life -= dt;
      p.y -= 30 * dt;
      g.globalAlpha = Math.max(0, Math.min(1, (p.life / p.max) * 1.5));
      g.fillStyle = p.color;
      g.font = `bold ${p.max > 1 ? 24 : 16}px sans-serif`;
      g.fillText(p.text, p.x, p.y);
    }
    g.globalAlpha = 1;
    A.pops = A.pops.filter(p => p.life > 0);
  };
  A.hud = (leftText, rightText) => {
    g.font = "bold 15px sans-serif";
    g.fillStyle = "#ffffff";
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText(leftText, 8, 12);
    g.textAlign = "right";
    g.fillText(rightText, W - 8, 12);
  };

  function cleanup() {
    document.body.classList.remove("no-chat-fab");
    window.removeEventListener("resize", fit);
    document.removeEventListener("keyup", keyup);
  }

  // step(dt), draw(dt), result() → { score, scoreText, wrong, ... }
  A.run = (step, draw, result, progress, limitMs = ARCADE_MS) => {
    let last = performance.now();
    const frame = () => {
      if (A.done || ctx.isOver()) { cleanup(); return; }
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      step(dt);
      draw(dt);
      if (progress) ctx.progress.textContent = progress();
      requestAnimationFrame(frame);
    };
    ctx.setLimit(limitMs, () => {
      if (A.done) return;
      A.done = true;
      cleanup();
      const r = result();
      ctx.finish({ scoreMode: true, scoreText: `${r.score}점`, ...r });
    });
    requestAnimationFrame(frame);
  };
  return A;
}
