// 🃏 마이티 여러 사람 탁자 — Firebase로 함께 하기
// 방장이 게임을 진행(행동 적용·컴퓨터 차례)하고, 모두가 같은 상태를 봄
import * as M from "./mighty.js";
import {
  runTable, applyAction, aiMove, optionsBox, rulesBox, el, BOT_NAMES, SPEEDS, DEFAULT_OPTS, lengthOf, lengthText
} from "./ui-mighty.js";

// deps: { db, ref, set, push, onValue, get, uid(), myName(), ROOM, isHost(), playersOf(), toast, show, sysChat, onView }
export function setupMightyNet(deps) {
  const { db, ref, set, push, onValue } = deps;
  const base = `rooms/${deps.ROOM}/mighty`;
  let seats = [null, null, null, null, null];
  let setupData = { len: "d5", opts: { ...DEFAULT_OPTS } };
  let game = null, st = null;           // game: Firebase 원본, st: 펼친 상태
  let viewOpen = false, tbl = null, tblKey = null;

  // ---------- 구독 ----------
  onValue(ref(db, `${base}/seats`), s => {
    const v = s.val() || {};
    seats = [0, 1, 2, 3, 4].map(i => v[i] || null);
    renderLobbyCard();
    if (viewOpen && !st) renderSetup();
  });
  onValue(ref(db, `${base}/setup`), s => {
    const v = s.val();
    if (v) setupData = { len: v.len || "d5", opts: { ...DEFAULT_OPTS, ...(v.opts || {}) } };
    if (viewOpen && !st) renderSetup();
  });
  onValue(ref(db, `${base}/game`), s => {
    game = s.val();
    let parsed = null;
    try { parsed = game?.json ? JSON.parse(game.json) : null; } catch { parsed = null; }
    const wasPlaying = !!st;
    st = parsed;
    if (host.active) host.onRemote(parsed);
    renderLobbyCard();
    applyChatRule();
    // 내가 앉아 있으면 시작될 때 탁자로 자동 이동
    if (!wasPlaying && st && st.phase !== "matchEnd" && mySeat() >= 0 && !viewOpen) open();
    if (viewOpen) {
      if (st) drawTable(); else renderSetup();
    }
  });

  const mySeat = () => (st ? st.players.findIndex(p => p.id === deps.uid()) : seats.indexOf(deps.uid()));
  const nameOf = id => deps.playersOf()[id]?.name || "손님";

  // ---------- 대기실 카드 ----------
  const card = document.getElementById("mighty-card");
  function renderLobbyCard() {
    if (!card) return;
    const line = card.querySelector(".mt-line");
    const n = seats.filter(Boolean).length;
    line.textContent = st && st.phase !== "matchEnd"
      ? `진행 중 · ${st.dealNo}판째 · ${st.players.filter(p => !p.ai).map(p => p.name).join(", ")}`
      : `자리 ${n}/5 · ${n ? seats.filter(Boolean).map(nameOf).join(", ") : "아직 아무도 안 앉았어요"}`;
  }
  card?.querySelector(".mt-open")?.addEventListener("click", open);

  function open() {
    viewOpen = true;
    deps.show("view-mighty");
    if (st) drawTable(); else renderSetup();
  }
  function close() {
    viewOpen = false;
    tbl = null; tblKey = null;
    deps.onView("lobby");
  }

  // ---------- 자리 앉기 · 시작 ----------
  function renderSetup() {
    tbl = null; tblKey = null;
    const view = document.getElementById("view-mighty");
    view.textContent = "";
    const c = el("div", "card");
    c.appendChild(el("h2", null, "🃏 마이티 탁자 (함께 하기)"));
    c.appendChild(el("p", "note", "자리를 골라 앉으세요. 빈자리는 시작할 때 컴퓨터가 채워요."));
    const grid = el("div", "mt-seatpick");
    const mine = seats.indexOf(deps.uid());
    seats.forEach((id, i) => {
      const b = el("div", "mt-pick" + (id === deps.uid() ? " me" : id ? " taken" : ""));
      b.appendChild(el("b", null, `${i + 1}번 자리`));
      b.appendChild(el("span", null, id ? nameOf(id) + (id === deps.uid() ? " (나)" : "") : "빈자리 🤖"));
      if (!id && mine < 0) {
        const sit = el("button", "btn small-label", "앉기");
        sit.addEventListener("click", () => set(ref(db, `${base}/seats/${i}`), deps.uid()).catch(() => deps.toast("앉지 못했어요. 보안 규칙을 확인해 주세요")));
        b.appendChild(sit);
      } else if (id === deps.uid()) {
        const up = el("button", "btn small-label", "일어나기");
        up.addEventListener("click", () => set(ref(db, `${base}/seats/${i}`), null));
        b.appendChild(up);
      } else if (id && deps.isHost()) {
        const kick = el("button", "btn small-label", "비우기");
        kick.addEventListener("click", () => set(ref(db, `${base}/seats/${i}`), null));
        b.appendChild(kick);
      }
      grid.appendChild(b);
    });
    c.appendChild(grid);
    if (deps.isHost()) {
      const state = { len: setupData.len, opts: { ...setupData.opts } };
      c.appendChild(el("h3", null, "방장 설정"));
      c.appendChild(optionsBox(state, { multi: true, onChange: () => set(ref(db, `${base}/setup`), state) }));
      const go = el("button", "btn primary", "시작 (빈자리는 컴퓨터)");
      go.addEventListener("click", () => startGame(state));
      c.appendChild(go);
    } else {
      c.appendChild(el("p", "mt-status", `방장 설정: ${lengthText(setupData.len)} · ${SPEEDS[setupData.opts.speed]?.label || ""}`));
      c.appendChild(el("p", "note", "방장이 시작하면 탁자가 열려요"));
    }
    c.appendChild(rulesBox());
    const back = el("button", "btn", "대기실로");
    back.addEventListener("click", close);
    view.append(c, back);
  }

  async function startGame(state) {
    if (!deps.isHost()) return;
    let b = 0;
    const players = seats.map(id => (id
      ? { id, name: nameOf(id).slice(0, 10), ai: false }
      : { id: "bot" + b, name: BOT_NAMES[b++], ai: true }));
    if (players.every(p => p.ai)) { deps.toast("한 명 이상 앉아야 시작할 수 있어요"); return; }
    const s = M.newMatch({ players, seed: Math.floor(Math.random() * 2 ** 31), length: lengthOf(state.len), opts: { ...state.opts } });
    try {
      await set(ref(db, `${base}/setup`), state);
      await set(ref(db, `${base}/actions`), null);
      await host.write(s);
      deps.sysChat(`🃏 마이티 시작! ${players.map(p => p.name).join(", ")} · ${lengthText(state.len)}`);
    } catch { deps.toast("시작하지 못했어요. 보안 규칙을 확인해 주세요"); }
  }

  // ---------- 탁자 ----------
  function drawTable() {
    const view = document.getElementById("view-mighty");
    const key = `${st.seed}-${deps.uid()}`;
    const me = mySeat();
    if (tbl && tblKey === key) { tbl.update(); return; }
    tblKey = key;
    const header = el("div", "mt-head");
    header.appendChild(el("span", null, me >= 0 ? "🃏 마이티 탁자" : "🃏 마이티 탁자 (구경 중)"));
    if (deps.isHost()) {
      const stop = el("button", "btn link-btn", "탁자 닫기(방장)");
      let armed = false;
      stop.addEventListener("click", () => {
        if (!armed) { armed = true; stop.textContent = "한 번 더 누르면 게임을 끝내요"; setTimeout(() => { armed = false; stop.textContent = "탁자 닫기(방장)"; }, 3000); return; }
        set(ref(db, `${base}/game`), null);
      });
      header.appendChild(stop);
    }
    tbl = runTable({
      view, header, getState: () => st, me, toast: deps.toast, multi: true,
      submit: a => push(ref(db, `${base}/actions`), { uid: deps.uid(), a: JSON.stringify(a), t: Date.now() })
        .catch(() => deps.toast("보내지 못했어요")),
      onExit: close,
      onMatchEnd: (s, meIdx) => {
        if (!deps.isHost()) return;
        const ranked = s.players.map((p, i) => ({ p, i })).sort((a, b) => s.scores[b.i] - s.scores[a.i]);
        deps.sysChat(`🏁 마이티 끝! ${ranked.map(({ p, i }, k) => `${k + 1}위 ${p.name}(${s.scores[i]})`).join(" · ")}`);
      }
    });
    if (st.phase === "matchEnd" && deps.isHost()) {
      const again = el("button", "btn", "새 게임 준비 (탁자 비우기)");
      again.addEventListener("click", () => set(ref(db, `${base}/game`), null));
      view.appendChild(again);
    }
  }

  // ---------- 대화 제한 옵션 ----------
  function applyChatRule() {
    const on = !!(st && st.phase !== "matchEnd" && st.opts?.chatQuick && mySeat() >= 0);
    document.body.classList.toggle("chat-quick-only", on);
  }

  // ---------- 방장: 게임 진행 ----------
  const host = {
    active: false, st: null, holdUntil: 0, lastTrickKey: null, timer: null, busy: false, queue: [], done: new Set(),
    start() {
      if (this.active) return;
      this.active = true;
      this.unsub = onValue(ref(db, `${base}/actions`), s => {
        const v = s.val() || {};
        this.queue = Object.keys(v).sort().map(k => ({ k, ...v[k] }));
        this.pump();
      });
      this.onRemote(st);
    },
    stop() {
      if (!this.active) return;
      this.active = false;
      this.unsub?.();
      clearTimeout(this.timer);
    },
    onRemote(parsed) {
      // 다른 방장이 쓴 최신 상태를 받아옴 (방장이 바뀐 경우)
      if (!parsed) { this.st = null; return; }
      if (!this.st || (game?.ver ?? 0) > (this.ver ?? -1)) { this.st = parsed; this.ver = game?.ver ?? 0; }
      this.schedule();
    },
    async write(s) {
      this.ver = (this.ver ?? game?.ver ?? 0) + 1;
      this.st = s;
      const k = s.lastTrick ? `${s.dealNo}-${s.lastTrick.trickNo}` : null;
      if (k && k !== this.lastTrickKey) { this.lastTrickKey = k; this.holdUntil = Date.now() + (SPEEDS[s.opts?.speed] || SPEEDS.slow).pause; }
      await set(ref(db, `${base}/game`), { json: JSON.stringify(s), ver: this.ver, status: s.phase === "matchEnd" ? "ended" : "playing", at: Date.now() });
      this.schedule();
    },
    async pump() {
      if (this.busy || !this.st) return;
      this.busy = true;
      try {
        while (this.queue.length) {
          const a = this.queue.shift();
          if (this.done.has(a.k)) continue;
          this.done.add(a.k);
          set(ref(db, `${base}/actions/${a.k}`), null).catch(() => {});
          const s = this.st;
          const p = s.players.findIndex(pl => pl.id === a.uid);
          if (p < 0) continue;
          let act;
          try { act = JSON.parse(a.a); } catch { continue; }
          try { applyAction(s, p, act); } catch (e) { continue; }
          await this.write(s);
        }
      } finally { this.busy = false; }
    },
    schedule() {
      clearTimeout(this.timer);
      const s = this.st;
      if (!this.active || !s) return;
      const p = M.whoActs(s);
      if (p < 0 || !s.players[p].ai) return;
      const sp = SPEEDS[s.opts?.speed] || SPEEDS.slow;
      const wait = Math.max(this.holdUntil - Date.now(), 0) + (s.phase === "bid" ? sp.bid : sp.ai);
      this.timer = setTimeout(async () => {
        if (!this.active || this.st !== s || M.whoActs(s) !== p) return;
        let msg = null;
        try { msg = aiMove(s, p); } catch (e) { console.error(e); return; }
        s.flash = msg ? { text: msg, at: Date.now() } : s.flash;
        await this.write(s);
      }, wait);
    }
  };

  // 방장이 바뀔 때마다 호출
  function hostChanged() {
    if (deps.isHost()) host.start(); else host.stop();
    if (viewOpen) { tblKey = null; if (st) drawTable(); else renderSetup(); }
  }

  return { open, hostChanged, renderLobbyCard };
}
