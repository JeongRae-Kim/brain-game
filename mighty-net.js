// 🃏 마이티 여러 사람 탁자 — Firebase로 함께 하기
// 진행(행동 적용·컴퓨터 차례)은 탁자에 앉아 접속 중인 첫 번째 사람이 맡고, 모두가 같은 상태를 봄
// - 앉은 사람 누구나 시작 가능
// - 진행 중에도 컴퓨터 자리에 들어와 이어서 칠 수 있음
// - 게임 중 연결이 1분 넘게 끊기면 컴퓨터가 대신 치고, 돌아오면 다시 넘겨줌
import * as M from "./mighty.js";
import {
  runTable, applyAction, aiMove, optionsBox, rulesBox, el, BOT_NAMES, SPEEDS, DEFAULT_OPTS, lengthOf, lengthText
} from "./ui-mighty.js";

const AWAY_MS = 60000;

// deps: { db, ref, set, push, onValue, onDisconnect, uid(), myName(), ROOM, isHost(), playersOf(), toast, show, sysChat, onView }
export function setupMightyNet(deps) {
  const { db, ref, set, push, onValue, onDisconnect } = deps;
  const base = `rooms/${deps.ROOM}/mighty`;
  let seats = [null, null, null, null, null];
  let setupData = { len: "d5", opts: { ...DEFAULT_OPTS } };
  let game = null, st = null;           // game: Firebase 원본, st: 펼친 상태
  let viewOpen = false, tbl = null, tblKey = null;
  let seatGuard = null;                 // 시작 전 내 자리: 연결이 끊기면 자동으로 비움

  const me = () => deps.uid();
  const online = id => deps.playersOf()[id]?.online === true;
  const nameOf = id => deps.playersOf()[id]?.name || "손님";
  const isBot = p => String(p.id).startsWith("bot");
  const playing = () => !!(st && st.phase !== "matchEnd");
  const mySeat = () => (st ? st.players.findIndex(p => p.id === me()) : seats.indexOf(me()));
  const iAmSeated = () => seats.includes(me());

  // 진행 담당: 게임 중이면 탁자의 사람 중 접속 중인 첫 번째 (자리 번호 순)
  function runnerUid() {
    if (!st) return null;
    const p = st.players.find(p => !isBot(p) && online(p.id));
    return p ? p.id : null;
  }

  // ---------- 구독 ----------
  onValue(ref(db, `${base}/seats`), s => {
    const v = s.val() || {};
    seats = [0, 1, 2, 3, 4].map(i => v[i] || null);
    guardMySeat();
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
    guardMySeat();
    refreshRunner();
    if (runner.active) runner.onRemote(parsed);
    renderLobbyCard();
    applyChatRule();
    // 내가 탁자에 있으면 시작될 때 탁자로 자동 이동
    if (!wasPlaying && st && st.phase !== "matchEnd" && mySeat() >= 0 && !viewOpen) open();
    if (viewOpen) {
      if (st) drawTable(); else renderSetup();
    }
  });

  // 시작 전에는 연결이 끊기면 내 자리를 비우고, 게임 중에는 자리를 지킴
  function guardMySeat() {
    const i = seats.indexOf(me());
    const want = i >= 0 && !st ? i : null;
    if (want === seatGuard) return;
    if (seatGuard !== null) onDisconnect(ref(db, `${base}/seats/${seatGuard}`)).cancel().catch(() => {});
    if (want !== null) onDisconnect(ref(db, `${base}/seats/${want}`)).remove().catch(() => {});
    seatGuard = want;
  }

  // ---------- 대기실 카드 ----------
  const card = document.getElementById("mighty-card");
  function renderLobbyCard() {
    if (!card) return;
    const line = card.querySelector(".mt-line");
    const here = seats.filter(id => id && online(id));
    const waiting = !playing() && here.length > 0;
    let text;
    if (playing()) {
      const free = st.players.filter(p => p.ai).length;
      text = `진행 중 · ${st.dealNo}판째 · ${st.players.filter(p => !isBot(p)).map(p => p.name).join(", ")}`
        + (free ? ` · 컴퓨터 자리 ${free}개 — 탁자를 눌러 들어가세요` : "");
    } else if (waiting) text = `🙋 ${here.map(nameOf).join(", ")}님이 탁자에서 기다려요 · 자리 ${seats.filter(Boolean).length}/5`;
    else text = "아직 아무도 안 앉았어요 · 함께 하려면 '탁자'를 누르세요";
    line.textContent = text;
    card.classList.toggle("mt-waiting", waiting || (playing() && st.players.some(p => p.ai)));
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
    c.appendChild(el("p", "note", "자리를 골라 앉으세요. 앉은 사람 누구나 시작할 수 있고, 빈자리는 컴퓨터가 채워요."));
    const grid = el("div", "mt-seatpick");
    const mine = seats.indexOf(me());
    seats.forEach((id, i) => {
      const gone = id && !online(id);
      const b = el("div", "mt-pick" + (id === me() ? " me" : id ? " taken" : ""));
      b.appendChild(el("b", null, `${i + 1}번 자리`));
      b.appendChild(el("span", null, id ? nameOf(id) + (id === me() ? " (나)" : gone ? " (나감)" : "") : "빈자리 🤖"));
      if (!id && mine < 0) {
        const sit = el("button", "btn small-label", "앉기");
        sit.addEventListener("click", () => set(ref(db, `${base}/seats/${i}`), me()).catch(() => deps.toast("앉지 못했어요. 보안 규칙을 확인해 주세요")));
        b.appendChild(sit);
      } else if (id === me()) {
        const up = el("button", "btn small-label", "일어나기");
        up.addEventListener("click", () => set(ref(db, `${base}/seats/${i}`), null));
        b.appendChild(up);
      } else if (id && (gone || deps.isHost())) {
        const kick = el("button", "btn small-label", "비우기");
        kick.addEventListener("click", () => set(ref(db, `${base}/seats/${i}`), null).catch(() => deps.toast("비우지 못했어요")));
        b.appendChild(kick);
      }
      grid.appendChild(b);
    });
    c.appendChild(grid);
    if (iAmSeated() || deps.isHost()) {
      const state = { len: setupData.len, opts: { ...setupData.opts } };
      c.appendChild(el("h3", null, "게임 설정"));
      c.appendChild(optionsBox(state, { multi: true, onChange: () => set(ref(db, `${base}/setup`), state).catch(() => {}) }));
      if (iAmSeated()) {
        const go = el("button", "btn primary", "시작 (빈자리는 컴퓨터)");
        go.addEventListener("click", () => startGame(state));
        c.appendChild(go);
      } else c.appendChild(el("p", "note", "자리에 앉으면 시작할 수 있어요"));
    } else {
      c.appendChild(el("p", "mt-status", `설정: ${lengthText(setupData.len)} · ${SPEEDS[setupData.opts.speed]?.label || ""}`));
      c.appendChild(el("p", "note", "자리에 앉으면 설정을 바꾸고 시작할 수 있어요"));
    }
    c.appendChild(inviteBtn());
    c.appendChild(rulesBox());
    const back = el("button", "btn", "대기실로");
    back.addEventListener("click", close);
    view.append(c, back);
  }

  async function startGame(state) {
    if (!iAmSeated()) return;
    if (st && st.phase !== "matchEnd") { deps.toast("이미 게임이 진행 중이에요"); return; }
    let b = 0;
    const live = seats.map(id => (id && online(id) ? id : null));     // 나간 사람 자리는 컴퓨터로
    const players = live.map(id => (id
      ? { id, name: nameOf(id).slice(0, 10), ai: false }
      : { id: "bot" + b, name: BOT_NAMES[b++], ai: true }));
    const s = M.newMatch({ players, seed: Math.floor(Math.random() * 2 ** 31), length: lengthOf(state.len), opts: { ...state.opts } });
    try {
      await set(ref(db, `${base}/setup`), state);
      await set(ref(db, `${base}/actions`), null);
      runner.reset();
      await runner.write(s);
      deps.sysChat(`🃏 마이티 시작! ${players.map(p => p.name).join(", ")} · ${lengthText(state.len)}`);
    } catch { deps.toast("시작하지 못했어요. 보안 규칙을 확인해 주세요"); }
  }

  // ---------- 탁자 ----------
  const send = a => push(ref(db, `${base}/actions`), { uid: me(), a: JSON.stringify(a), t: Date.now() })
    .catch(() => deps.toast("보내지 못했어요"));
  const canManage = () => deps.isHost() || mySeat() >= 0 || iAmSeated();

  function drawTable() {
    const view = document.getElementById("view-mighty");
    const myIdx = mySeat();
    const key = `${st.seed}-${me()}-${myIdx}`;
    if (tbl && tblKey === key) { tbl.update(); return; }
    tblKey = key;
    const header = el("div", "mt-head");
    header.appendChild(el("span", null, myIdx >= 0 ? "🃏 마이티 탁자" : "🃏 마이티 탁자 (구경 중)"));
    if (canManage()) {
      const stop = el("button", "btn link-btn", "탁자 닫기");
      let armed = false;
      stop.addEventListener("click", () => {
        if (!armed) { armed = true; stop.textContent = "한 번 더 누르면 게임을 끝내요"; setTimeout(() => { armed = false; stop.textContent = "탁자 닫기"; }, 6000); return; }
        endTable();
      });
      header.appendChild(stop);
    }
    if (st.phase !== "matchEnd" && st.players.some(p => p.ai)) {
      const ib = inviteBtn();
      ib.textContent = "💬 카톡 초대";
      header.appendChild(ib);
    }
    tbl = runTable({
      view, header, getState: () => st, me: myIdx, toast: deps.toast, multi: true,
      submit: send,
      onJoin: myIdx < 0 ? p => { send({ k: "join", seat: p, name: (deps.myName() || "손님").slice(0, 10) }); deps.toast("자리에 들어가는 중…"); } : null,
      onExit: close,
      onMatchEnd: s => {
        if (runnerUid() !== me()) return;
        const ranked = s.players.map((p, i) => ({ p, i })).sort((a, b) => s.scores[b.i] - s.scores[a.i]);
        deps.sysChat(`🏁 마이티 끝! ${ranked.map(({ p, i }, k) => `${k + 1}위 ${p.name}(${s.scores[i]})`).join(" · ")}`);
      }
    });
    if (myIdx >= 0 && st.players[myIdx].away) {
      view.insertBefore(el("p", "mt-solo", "연결이 끊긴 동안 컴퓨터가 대신 쳤어요. 곧 다시 넘겨받아요."), view.children[1] || null);
    }
    if (st.phase === "matchEnd" && canManage()) {
      const again = el("button", "btn", "새 게임 준비 (탁자 비우기)");
      again.addEventListener("click", endTable);
      view.appendChild(again);
    }
  }

  // 카톡으로 초대
  function inviteBtn() {
    const b = el("button", "btn kakao-btn", "💬 카톡으로 초대하기");
    b.addEventListener("click", () => {
      const me_ = (deps.myName() || "").slice(0, 10) || "가족";
      let text;
      if (playing()) {
        const free = st.players.filter(p => p.ai).length;
        text = `🃏 ${me_}님이 마이티 탁자에 초대했어요!\n지금 ${st.dealNo}판째 진행 중` + (free ? ` · 컴퓨터 자리 ${free}개 (들어와서 '컴퓨터 대신 앉기')` : "");
      } else {
        const n = seats.filter(Boolean).length;
        text = `🃏 ${me_}님이 마이티 탁자에 초대했어요!\n빈자리 ${5 - n}개 · 들어와서 자리에 앉아 주세요`;
      }
      deps.invite?.(text, "탁자로 가기");
    });
    return b;
  }

  // 게임을 끝내고, 나간 사람 자리는 비움
  async function endTable() {
    try {
      await set(ref(db, `${base}/game`), null);
      for (let i = 0; i < 5; i++) if (seats[i] && !online(seats[i])) set(ref(db, `${base}/seats/${i}`), null).catch(() => {});
    } catch { deps.toast("닫지 못했어요. 보안 규칙을 확인해 주세요"); }
  }

  // ---------- 대화 제한 옵션 ----------
  function applyChatRule() {
    const on = !!(playing() && st.opts?.chatQuick && mySeat() >= 0);
    document.body.classList.toggle("chat-quick-only", on);
  }

  // ---------- 진행 담당 ----------
  const runner = {
    active: false, st: null, ver: null, holdUntil: 0, lastTrickKey: null, timer: null, busy: false, queue: [],
    done: new Set(), offSince: {}, awayTimer: null,
    reset() { this.st = null; this.ver = null; this.lastTrickKey = null; this.holdUntil = 0; },
    start() {
      if (this.active) return;
      this.active = true;
      this.st = null; this.ver = null;
      this.unsub = onValue(ref(db, `${base}/actions`), s => {
        const v = s.val() || {};
        this.queue = Object.keys(v).sort().map(k => ({ k, ...v[k] }));
        this.pump();
      });
      this.onRemote(st);
      this.awayTimer = setInterval(() => this.checkAway(), 5000);
    },
    stop() {
      if (!this.active) return;
      this.active = false;
      this.unsub?.();
      clearTimeout(this.timer);
      clearInterval(this.awayTimer);
    },
    onRemote(parsed) {
      if (!parsed) { this.st = null; this.ver = null; return; }
      if (!this.st || this.ver == null || (game?.ver ?? 0) > this.ver) { this.st = parsed; this.ver = game?.ver ?? 0; }
      this.schedule();
      this.checkAway();
    },
    async write(s) {
      this.ver = Math.max(this.ver ?? 0, game?.ver ?? 0) + 1;
      this.st = s;
      const k = s.lastTrick ? `${s.dealNo}-${s.lastTrick.trickNo}` : null;
      if (k && k !== this.lastTrickKey) { this.lastTrickKey = k; this.holdUntil = Date.now() + (SPEEDS[s.opts?.speed] || SPEEDS.slow).pause; }
      await set(ref(db, `${base}/game`), { json: JSON.stringify(s), ver: this.ver, status: s.phase === "matchEnd" ? "ended" : "playing", at: Date.now() });
      this.schedule();
    },
    async pump() {
      if (this.busy || !this.active || !this.st) return;
      this.busy = true;
      try {
        while (this.queue.length && this.active && this.st) {
          const a = this.queue.shift();
          if (this.done.has(a.k)) continue;
          this.done.add(a.k);
          set(ref(db, `${base}/actions/${a.k}`), null).catch(() => {});
          const s = this.st;
          let act;
          try { act = JSON.parse(a.a); } catch { continue; }
          if (act.k === "join") { if (this.join(s, a.uid, act)) await this.write(s); continue; }
          const p = s.players.findIndex(pl => pl.id === a.uid);
          if (p < 0) continue;
          if (s.players[p].ai) { s.players[p].ai = false; s.players[p].away = false; }   // 돌아와서 직접 둠
          try { applyAction(s, p, act); } catch (e) { continue; }
          await this.write(s);
        }
      } finally { this.busy = false; }
    },
    // 컴퓨터 자리(또는 오래 비운 사람 자리)에 새 사람이 들어옴
    join(s, uid, act) {
      if (s.phase === "matchEnd" || s.players.some(p => p.id === uid)) return false;
      const i = act.seat;
      const p = s.players[i];
      if (!p || !(isBot(p) || (p.away && !online(p.id)))) return false;
      const name = String(act.name || nameOf(uid)).slice(0, 10);
      s.players[i] = { id: uid, name, ai: false };
      s.log.push(`🙋 ${name}님이 ${p.name} 자리에 들어왔어요`);
      set(ref(db, `${base}/seats/${i}`), uid).catch(() => {});
      deps.sysChat(`🃏 ${name}님이 마이티 탁자에 들어왔어요`);
      return true;
    },
    // 연결이 1분 넘게 끊긴 사람은 컴퓨터가 대신, 돌아오면 다시 사람
    checkAway() {
      const s = this.st;
      if (!this.active || !s || s.phase === "matchEnd") return;
      let changed = false;
      const now = Date.now();
      s.players.forEach(p => {
        if (isBot(p)) return;
        if (online(p.id)) {
          delete this.offSince[p.id];
          if (p.away) { p.away = false; p.ai = false; s.log.push(`${p.name}님이 돌아왔어요`); changed = true; }
        } else {
          this.offSince[p.id] ??= now;
          if (!p.away && now - this.offSince[p.id] >= AWAY_MS) {
            p.away = true; p.ai = true; s.log.push(`${p.name}님 연결이 끊겨 컴퓨터가 대신 쳐요`); changed = true;
          }
        }
      });
      if (changed) this.write(s).catch(() => {});
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
        if (!this.active || this.st !== s || M.whoActs(s) !== p || !s.players[p].ai) return;
        let msg = null;
        try { msg = aiMove(s, p); } catch (e) { console.error(e); return; }
        s.flash = msg ? { text: msg, at: Date.now() } : s.flash;
        await this.write(s).catch(() => {});
      }, wait);
    }
  };

  function refreshRunner() {
    if (st && runnerUid() === me()) runner.start(); else runner.stop();
  }

  // 방장·접속자가 바뀔 때 호출
  function hostChanged() {
    refreshRunner();
    if (viewOpen) { tblKey = null; if (st) drawTable(); else renderSetup(); }
  }
  function playersChanged() {
    refreshRunner();
    if (runner.active) runner.checkAway();
    renderLobbyCard();
    if (viewOpen && !st) renderSetup();
  }

  return { open, hostChanged, playersChanged, renderLobbyCard };
}
