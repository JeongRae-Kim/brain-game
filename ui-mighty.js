// 🃏 마이티 화면 — 연습판(나 + 컴퓨터 4명)과 여러 사람 탁자가 함께 쓰는 탁자 그리기
import * as M from "./mighty.js";

export const SPEEDS = {
  slow: { label: "🐢 천천히", ai: 2000, bid: 2000, pause: 3000 },
  normal: { label: "보통", ai: 1200, bid: 1500, pause: 2000 },
  fast: { label: "🐇 빠르게", ai: 750, bid: 1200, pause: 1300 }
};
export const DEFAULT_OPTS = {
  speed: "slow", manualNext: true, showTaken: false, dealEndCards: false,
  aiSignal: false, mightyFixed: false, chatQuick: false
};
const OPT_LABELS = [
  ["manualNext", "트릭마다 '다음 ▶' 눌러 넘기기", "연습판만 · 다섯 장을 천천히 확인"],
  ["showTaken", "먹은 점수 카드 보여 주기", "켜면 기억하기 쉬워지지만 기억 훈련 효과는 줄어요"],
  ["dealEndCards", "판 끝 점수표에 먹은 카드 목록", ""],
  ["aiSignal", "컴퓨터가 '3·6·9 = 조커 없음' 신호 쓰기", "컴퓨터 프렌드가 신호를 내고 컴퓨터 주공이 조커 콜"],
  ["mightyFixed", "마이티는 언제나 ♠A", "끄면: 기루다가 ♠일 때 ◆A가 마이티"],
  ["chatQuick", "마이티 중 대화는 빠른 답장만", "여러 사람 탁자만 · 패 이야기 막기"]
];
export const BOT_NAMES = ["컴퓨터 가", "컴퓨터 나", "컴퓨터 다", "컴퓨터 라", "컴퓨터 마"];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 무시 */ } }
};
export function loadOpts() {
  try { return { ...DEFAULT_OPTS, ...JSON.parse(store.get("bg-mighty-opts") || "{}") }; } catch { return { ...DEFAULT_OPTS }; }
}
export function saveOpts(o) { store.set("bg-mighty-opts", JSON.stringify(o)); }

export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const fmtD = v => (v > 0 ? "+" + v : String(v));
const red = c => c !== "JK" && (c[0] === "H" || c[0] === "D");
const LENGTHS = [["d3", "3판"], ["d5", "5판"], ["d10", "10판"], ["m20", "20분"], ["m30", "30분"], ["m60", "60분"]];
export const lengthOf = k => (k[0] === "d" ? { deals: Number(k.slice(1)) } : { minutes: Number(k.slice(1)) });
export const lengthText = k => (LENGTHS.find(x => x[0] === k) || [0, k])[1];

const trumpTag = (on, b) => { if (on) b.classList.add("trump"); return b; };
function cardEl(c, { small = false, playable = false, picked = false, onClick, mark } = {}) {
  const b = el("button", "mc" + (small ? " small" : "") + (red(c) ? " red" : "") + (c === "JK" ? " joker" : "")
    + (playable ? " ok" : "") + (picked ? " picked" : ""));
  if (c === "JK") b.textContent = "🃏";
  else {
    b.appendChild(el("span", "r", M.RANK_TXT[M.rankOf(c)] || M.rankOf(c)));
    b.appendChild(el("span", "s", M.SUIT_SYM[M.suitOf(c)]));
  }
  if (mark) b.appendChild(el("span", "mk", mark));
  if (onClick) b.addEventListener("click", onClick);
  else b.disabled = true;
  return b;
}

// 길이·속도·옵션 고르는 상자 (연습판 / 탁자 공용)
export function optionsBox(state, { multi = false, onChange } = {}) {
  const box = el("div");
  box.appendChild(el("p", "note", "게임 길이"));
  const sel = el("div", "seg wrap");
  const lenBtns = LENGTHS.map(([k, label]) => {
    const b = el("button", "btn seg-btn" + (k === state.len ? " selected" : ""), label);
    b.addEventListener("click", () => { state.len = k; lenBtns.forEach(x => x.classList.toggle("selected", x === b)); onChange?.(); });
    sel.appendChild(b);
    return b;
  });
  box.appendChild(sel);
  box.appendChild(el("p", "note", "속도"));
  const sp = el("div", "seg");
  const spBtns = Object.entries(SPEEDS).map(([k, v]) => {
    const b = el("button", "btn seg-btn" + (k === state.opts.speed ? " selected" : ""), v.label);
    b.addEventListener("click", () => { state.opts.speed = k; spBtns.forEach(x => x.classList.toggle("selected", x === b)); onChange?.(); });
    sp.appendChild(b);
    return b;
  });
  box.appendChild(sp);
  const ul = el("ul", "set-list");
  for (const [k, label, hint] of OPT_LABELS) {
    if (multi && k === "manualNext") continue;
    if (!multi && k === "chatQuick") continue;
    const li = el("li");
    const lab = el("label");
    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!state.opts[k];
    cb.addEventListener("change", () => { state.opts[k] = cb.checked; onChange?.(); });
    const span = el("span");
    span.appendChild(el("span", null, label));
    if (hint) span.appendChild(el("small", "hint", hint));
    lab.append(cb, span);
    li.appendChild(lab);
    ul.appendChild(li);
  }
  box.appendChild(ul);
  return box;
}

export function rulesBox() {
  const rules = el("details", "rules");
  rules.appendChild(el("summary", null, "규칙 요약 보기"));
  for (const t of [
    "53장(조커 포함), 1인 10장. 점수 카드는 A·K·Q·J·10 (모두 20장)",
    "공약: 기루다 무늬와 장수(13장부터, 노기루다 12장부터). 가장 높게 부른 사람이 주공",
    "주공은 남은 3장을 받아 3장을 버리고 프렌드를 정함 (카드·초구·노프렌드·사람 지정)",
    "센 카드: 마이티(♠A, 기루다가 ♠면 ◆A) > 조커 > 기루다 > 처음 낸 무늬",
    "조커는 첫 트릭·마지막 트릭에 힘이 없음. ♣3(기루다 ♣면 ♠3)을 먼저 내며 조커 콜 가능",
    "같은 무늬가 있으면 같은 무늬를 내야 함 (마이티·조커는 언제나 가능). 첫 트릭엔 기루다를 먼저 못 냄",
    "점수: 이기면 (먹은 장수−공약)+(공약−13)×2+1, 지면 −(공약−먹은 장수). 노기루다·노프렌드는 2배"
  ]) rules.appendChild(el("p", null, "• " + t));
  return rules;
}

// 행동 하나를 엔진에 적용 (연습판·방장 공용)
export function applyAction(st, p, a) {
  if (a.k === "bid") M.applyBid(st, p, a.action);
  else if (a.k === "kitty") M.applyKitty(st, p, { discards: a.discards, newTrump: a.newTrump });
  else if (a.k === "friend") M.applyFriend(st, p, a.spec);
  else if (a.k === "play") M.applyPlay(st, p, a.card, a.opts || {});
  else if (a.k === "next") M.nextDeal(st);
  else throw new Error("알 수 없는 행동");
}

// 컴퓨터 한 수 + 공약 알림 문구
export function aiMove(st, p) {
  const before = st.phase === "bid" ? JSON.stringify(st.bids[p]) : null;
  M.aiStep(st, p);
  if (st.phase !== "bid") return null;
  const b = st.bids[p];
  if (b && b !== "pass" && JSON.stringify(b) !== before) return `방금 ${st.players[p].name}님이 ${M.bidText(b)}으로 올렸어요`;
  if (b === "pass") return `${st.players[p].name}: 패스`;
  return null;
}

// ---------------- 연습판 ----------------
export function openMightyPractice({ view, myName, toast, onExit, onMatchEnd }) {
  view.textContent = "";
  const state = { len: store.get("bg-mighty-len") || "d5", opts: loadOpts() };
  const setup = el("div", "card");
  setup.appendChild(el("h2", null, "🃏 마이티 연습 (나 + 컴퓨터 4명)"));
  setup.appendChild(el("p", "mt-solo", "혼자 하는 연습판이에요. 다른 사람과 함께 하려면 대기실의 '탁자 (함께 하기)'로 가세요."));
  setup.appendChild(optionsBox(state, { onChange: () => { saveOpts(state.opts); store.set("bg-mighty-len", state.len); } }));
  const go = el("button", "btn primary", "시작");
  setup.appendChild(go);
  setup.appendChild(rulesBox());
  const back = el("button", "btn", "대기실로");
  back.addEventListener("click", onExit);
  view.append(setup, back);

  go.addEventListener("click", () => {
    const players = [{ id: "me", name: myName || "나", ai: false }, ...BOT_NAMES.slice(0, 4).map((n, i) => ({ id: "bot" + i, name: n, ai: true }))];
    const st = M.newMatch({ players, seed: Math.floor(Math.random() * 2 ** 31), length: lengthOf(state.len), opts: { ...state.opts } });
    let tbl;
    let aiTimer = null;
    const runAI = () => {
      clearTimeout(aiTimer);
      if (tbl.waiting()) return;              // 트릭 결과를 보여 주는 중
      const p = M.whoActs(st);
      if (p < 0 || !st.players[p].ai) return;
      const sp = SPEEDS[st.opts.speed] || SPEEDS.slow;
      aiTimer = setTimeout(() => {
        let msg = null;
        try { msg = aiMove(st, p); } catch (e) { console.error(e); }
        if (msg) tbl.flash(msg);
        tbl.update();
        runAI();
      }, st.phase === "bid" ? sp.bid : sp.ai);
    };
    tbl = runTable({
      view, getState: () => st, me: 0, toast, multi: false,
      submit: a => { applyAction(st, 0, a); tbl.update(); runAI(); },
      onIdle: runAI,
      onExit: () => { clearTimeout(aiTimer); onExit(); },
      onMatchEnd
    });
    runAI();
  });
}

// ---------------- 탁자 그리기 ----------------
// getState(): 지금 상태, me: 내 자리(-1 = 구경), submit(action): 행동 보내기
// onIdle(): 트릭 결과 보여 주기가 끝났을 때 (연습판 컴퓨터 진행용)
export function runTable({ view, getState, me, submit, toast, multi, onIdle, onExit, onMatchEnd, header, onJoin }) {
  let picks = [], newTrump = null, pendingCard = null, showTrick = null, lastShown = null;
  let bidSuit = null, bidN = null, saved = false, friendKnown = false, lastPhase = null;
  let flash = null, flashTimer = null, pauseTimer = null;
  const root = el("div", "mt");
  view.textContent = "";
  if (header) view.appendChild(header);
  view.appendChild(root);
  const sp = () => SPEEDS[getState()?.opts?.speed] || SPEEDS.slow;
  const setFlash = text => {
    flash = { text, until: Date.now() + 2600 };
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { if (root.isConnected) render(); }, 2700);
  };

  function send(a) {
    // 미리 검사해서 안 되는 행동은 바로 알려 줌
    const st = getState();
    try { applyAction(JSON.parse(JSON.stringify(st)), me, a); } catch (e) { toast(e.message); return false; }
    submit(a);
    return true;
  }

  function update() {
    const st = getState();
    if (!st || !root.isConnected) return;
    const f = st.friend;
    if (f && f.revealed && !friendKnown && st.phase !== "bid") {
      friendKnown = true;
      setFlash(f.idx == null ? "프렌드 없이 주공 혼자예요" : `🤝 ${st.players[f.idx].name}님이 프렌드!`);
    }
    if (!f) friendKnown = false;
    if (lastPhase === "bid" && st.phase !== "bid" && !(f && f.revealed)) flash = null;
    if (st.flash && st.flash.at !== flash?.at && Date.now() - st.flash.at < 2600) { flash = { text: st.flash.text, at: st.flash.at, until: st.flash.at + 2600 }; }
    lastPhase = st.phase;
    // 트릭이 막 끝났으면 결과를 보여 줌
    const key = st.lastTrick ? `${st.dealNo}-${st.lastTrick.trickNo}` : null;
    if (key && key !== lastShown) {
      lastShown = key;
      showTrick = { src: st.lastTrick };
      clearTimeout(pauseTimer);
      const manual = !multi && st.opts?.manualNext;
      if (!manual) pauseTimer = setTimeout(() => { showTrick = null; render(); onIdle?.(); }, sp().pause);
    }
    if (st.phase === "bid" || st.phase === "kitty") showTrick = null;
    render();
  }

  function render() {
    const st = getState();
    if (!st || !root.isConnected) return;
    root.textContent = "";
    const top = el("div", "mt-seats");
    const base = me >= 0 ? me : 0;
    for (let k = me >= 0 ? 1 : 0; k < 5; k++) top.appendChild(seat((base + k) % 5));
    if (me < 0) top.classList.add("five");
    root.appendChild(top);
    root.appendChild(infoBar());
    root.appendChild(center());
    if (me >= 0) root.appendChild(seat(me, true));
    root.appendChild(actionPanel());
    if (me >= 0) root.appendChild(hand());
    const log = el("div", "mt-log");
    for (const t of st.log.slice(-4)) log.appendChild(el("div", null, t));
    root.appendChild(log);
    const quit = el("button", "btn link-btn", multi ? "대기실로 (탁자는 계속돼요)" : "그만하고 나가기");
    quit.addEventListener("click", () => { clearTimeout(pauseTimer); onExit(); });
    root.appendChild(quit);
  }

  function teamClass(p) {
    const st = getState();
    if (!st.contract) return "";
    if (p === st.contract.declarer) return " gov-d";
    const f = st.friend;
    if (f && f.revealed && f.idx === p) return " gov-f";
    return "";
  }
  function role(p) {
    const st = getState();
    if (!st.contract) return "";
    if (p === st.contract.declarer) return "👑";
    const f = st.friend;
    if (f && f.revealed && f.idx === p) return "🤝";
    if (p === me && f && f.type === "card" && st.hands[me].includes(f.card)) return "🤝(나만 앎)";
    return "";
  }
  function seat(p, mine = false) {
    const st = getState();
    const secret = p === me && st.friend?.type === "card" && !st.friend.revealed && st.hands[me].includes(st.friend.card);
    const d = el("div", "mt-seat" + (M.whoActs(st) === p ? " turn" : "") + (mine ? " mine" : "") + teamClass(p) + (secret ? " secret-f" : ""));
    d.appendChild(el("b", null, `${role(p)} ${st.players[p].name}${mine ? " (나)" : ""}`));
    const b = st.bids?.[p];
    let sub = `카드 ${st.hands[p].length}`;
    if (st.phase === "bid") sub = b === "pass" ? "패스" : b ? M.bidText(b) : "…";
    else if (st.phase === "play" || st.phase === "dealEnd") sub += ` · 점수 ${st.taken[p].length}`;
    d.appendChild(el("small", null, sub));
    if (st.opts?.showTaken && st.taken[p].length && st.phase !== "bid") {
      d.appendChild(el("small", "taken", st.taken[p].map(M.cardText).join(" ")));
    }
    d.appendChild(el("small", "tot", `총점 ${st.scores[p]}`));
    if (st.players[p].away) d.appendChild(el("small", "away", "🤖 컴퓨터가 대신"));
    if (me < 0 && onJoin && st.players[p].ai && st.phase !== "matchEnd") {
      const j = el("button", "btn small-label mt-join", st.players[p].away ? "이 자리 이어받기" : "컴퓨터 대신 앉기");
      j.addEventListener("click", () => onJoin(p));
      d.appendChild(j);
    }
    return d;
  }
  function infoBar() {
    const st = getState();
    const d = el("div", "mt-info");
    const parts = [`${st.dealNo}판째` + (st.length.deals ? `/${st.length.deals}` : st.length.minutes ? ` · ${st.length.minutes}분` : "")];
    if (st.contract) {
      const tr = st.contract.suit;
      parts.push({ cls: "trump-chip" + (tr === "D" || tr === "H" ? " red" : ""),
        text: tr === "N" ? "노기루다" : `기루다 ${M.SUIT_SYM[tr]}` });
      parts.push(`공약 ${st.contract.n}장 (주공 ${st.players[st.contract.declarer].name})`);
      const f = st.friend;
      if (f) parts.push(f.type === "none" ? "노프렌드" : f.type === "first" ? (f.revealed ? `프렌드 ${f.idx === null ? "없음" : st.players[f.idx].name}` : "초구 프렌드")
        : f.type === "card" ? `프렌드 ${M.cardText(f.card)}${f.revealed ? ` = ${st.players[f.idx].name}` : ""}` : `프렌드 ${st.players[f.idx].name}`);
      if (st.phase === "play") {
        const gov = st.taken[st.contract.declarer].length + (st.friend?.revealed && st.friend.idx != null ? st.taken[st.friend.idx].length : 0);
        parts.push(`주공 편 ${gov}장 · ${st.trickNo}/10트릭`);
        parts.push(`마이티 ${M.cardText(M.mightyCard(st))} · 콜 ${M.cardText(M.callCardOf(st.trump))}`);
      }
    } else if (st.phase === "bid") {
      const { best, who } = M.highestBid(st);
      parts.push(best ? `최고 공약 ${st.players[who].name} ${M.bidText(best)}` : "공약을 불러 주세요");
    }
    for (const t of parts) d.appendChild(typeof t === "string" ? el("span", null, t) : el("span", t.cls, t.text));
    return d;
  }
  function center() {
    const st = getState();
    const d = el("div", "mt-center");
    const cards = showTrick ? showTrick.src.cards : st.trick?.cards || [];
    if (showTrick) d.appendChild(el("div", "mt-win", `${st.players[showTrick.src.winner].name} 승!`));
    else if (st.trick?.called) d.appendChild(el("div", "mt-win", "조커 콜!"));
    else if (st.trick?.leadSuit) d.appendChild(el("div", "mt-lead", `${M.SUIT_SYM[st.trick.leadSuit]} 트릭`));
    const row = el("div", "mt-trick");
    for (const { p, card } of cards) {
      const w = el("div", "mt-played" + (showTrick && p === showTrick.src.winner ? " win" : "") + teamClass(p));
      w.appendChild(cardEl(card, { small: true }));
      w.appendChild(el("small", null, st.players[p].name));
      row.appendChild(w);
    }
    d.appendChild(row);
    if (st.contract && (st.phase === "play" || (showTrick && st.phase === "dealEnd"))) d.appendChild(tally(!!showTrick));
    if (showTrick && !multi && st.opts?.manualNext && st.phase === "play") {
      const nx = el("button", "btn primary mt-next", "다음 ▶");
      nx.addEventListener("click", () => { showTrick = null; render(); onIdle?.(); });
      d.appendChild(nx);
    }
    return d;
  }

  // 주공 편 / 상대 편 그림 카드(점수 카드) 현황
  function tally(big) {
    const st = getState();
    const dcl = st.contract.declarer, f = st.friend, n = st.contract.n;
    const fKnown = f && f.revealed && f.idx != null;
    const gov = st.taken[dcl].length + (fKnown ? st.taken[f.idx].length : 0);
    const all = st.taken.reduce((a, t) => a + t.length, 0);
    const opp = all - gov;
    const box = el("div", "mt-tally" + (big ? " big" : ""));
    const line = el("div", "tl-line");
    line.append(el("span", "tl-gov", `주공 편 ${gov}장`), el("span", "tl-vs", " · "), el("span", "tl-opp", `상대 편 ${opp}장`));
    box.appendChild(line);
    const left = n - gov;
    box.appendChild(el("div", "tl-sub", left > 0 ? `공약 ${n}장까지 ${left}장 남음` : `공약 ${n}장 달성! (+${gov - n}장)`));
    if (f && f.type !== "none" && !fKnown) box.appendChild(el("div", "tl-note", "프렌드가 아직 안 밝혀져서 프렌드가 먹은 카드는 상대 편에 섞여 있어요"));
    return box;
  }

  function sortHand(h) {
    const st = getState();
    const order = { [st.trump && st.trump !== "N" ? st.trump : "S"]: 0 };
    let i = 1;
    for (const s of M.SUITS) if (!(s in order)) order[s] = i++;
    const m = st.trump ? M.mightyCard(st) : "S14";
    const key = c => (c === m ? -2 : c === "JK" ? -1 : order[M.suitOf(c)] * 20 + (20 - M.rankOf(c)));
    return h.slice().sort((a, b) => key(a) - key(b));
  }
  function hand() {
    const st = getState();
    const d = el("div", "mt-hand");
    const h = sortHand(st.hands[me]);
    const myTurnPlay = st.phase === "play" && st.turn === me && !showTrick && !pendingCard;
    const legal = myTurnPlay ? M.legalPlays(st, me) : [];
    const discarding = st.phase === "kitty" && st.contract.declarer === me;
    const mCard = st.trump ? M.mightyCard(st) : null, cCard = st.trump ? M.callCardOf(st.trump) : null;
    const markOf = c => (c === mCard ? "M" : c === cCard ? "콜" : undefined);
    for (const c of h) {
      const mark = markOf(c);
      const isTrump = st.trump && st.trump !== "N" && c !== "JK" && M.suitOf(c) === st.trump && c !== mCard;
      if (discarding) {
        d.appendChild(trumpTag(isTrump, cardEl(c, { mark, playable: true, picked: picks.includes(c), onClick: () => {
          picks = picks.includes(c) ? picks.filter(x => x !== c) : picks.length < 3 ? picks.concat(c) : picks;
          render();
        } })));
      } else if (myTurnPlay && legal.includes(c)) {
        d.appendChild(trumpTag(isTrump, cardEl(c, { mark, playable: true, onClick: () => playCard(c) })));
      } else d.appendChild(trumpTag(isTrump, cardEl(c, { mark })));
    }
    return d;
  }
  function playCard(c) {
    const st = getState();
    const leading = !st.trick.cards.length;
    if (leading && c === "JK") { pendingCard = { card: c, kind: "joker" }; render(); return; }
    if (leading && c === M.callCardOf(st.trump) && st.trickNo !== 1 && st.trickNo !== 10 && !st.hands[me].includes("JK")) {
      pendingCard = { card: c, kind: "call" }; render(); return;
    }
    send({ k: "play", card: c });
  }

  function actionPanel() {
    const st = getState();
    const box = el("div", "mt-act");
    const actor = M.whoActs(st);
    if (st.phase === "dealEnd") return dealEndPanel(box);
    if (st.phase === "matchEnd") return matchEndPanel(box);
    if (flash && flash.until > Date.now()) box.appendChild(el("p", "mt-flash", flash.text));
    if (showTrick) return box;
    if (actor !== me) {
      if (actor >= 0) box.appendChild(el("p", "note", `${st.players[actor].name} 차례…`));
      return box;
    }
    if (st.phase === "bid") {
      const { best, who } = M.highestBid(st);
      if (!bidSuit) bidSuit = best?.suit && best.suit !== "N" ? best.suit : "S";
      const minFor = s => {
        for (let n = s === "N" ? M.MIN_BID_NT : M.MIN_BID; n <= M.MAX_BID; n++) if (M.bidOk(st, { suit: s, n })) return n;
        return null;
      };
      if (bidN == null || !M.bidOk(st, { suit: bidSuit, n: bidN })) bidN = minFor(bidSuit);
      box.appendChild(el("p", "mt-status", best
        ? `지금 최고: ${st.players[who].name} ${M.bidText(best)}${who === me ? " (나)" : ""} · 이기려면 더 높게`
        : "아직 아무도 안 불렀어요 · 13장부터 (노기루다 12장부터)"));
      box.appendChild(el("p", "note", "내 차례: 공약을 부르거나 패스"));
      const suits = el("div", "mt-suits");
      for (const s of [...M.SUITS, "N"]) {
        const b = el("button", "btn seg-btn" + (s === bidSuit ? " selected" : "") + (s === "D" || s === "H" ? " redtxt" : ""), M.SUIT_SYM[s]);
        b.addEventListener("click", () => { bidSuit = s; bidN = minFor(s); render(); });
        suits.appendChild(b);
      }
      box.appendChild(suits);
      const nrow = el("div", "level-line");
      const dn = el("button", "btn small", "－"), up = el("button", "btn small", "＋");
      nrow.append(dn, el("span", null, bidN ? `${bidN}장` : "더 못 불러요"), up);
      dn.addEventListener("click", () => { if (bidN && M.bidOk(st, { suit: bidSuit, n: bidN - 1 })) { bidN--; render(); } });
      up.addEventListener("click", () => { if (bidN && bidN < M.MAX_BID) { bidN++; render(); } });
      box.appendChild(nrow);
      const row = el("div", "row");
      const call = el("button", "btn primary", "부르기");
      call.disabled = !bidN;
      call.addEventListener("click", () => {
        const bid = { suit: bidSuit, n: bidN };
        if (send({ k: "bid", action: bid })) { setFlash(`${M.bidText(bid)}으로 불렀어요`); toast(`${M.bidText(bid)}으로 불렀어요`); }
      });
      const pass = el("button", "btn", "패스");
      pass.addEventListener("click", () => send({ k: "bid", action: "pass" }));
      row.append(call, pass);
      box.appendChild(row);
      if (M.canDealMiss(st, me)) {
        const dm = el("button", "btn link-btn", "딜미스 (다시 나눠 주세요)");
        dm.addEventListener("click", () => send({ k: "bid", action: "dealmiss" }));
        box.appendChild(dm);
      }
      return box;
    }
    if (st.phase === "kitty") {
      box.appendChild(el("p", "note", `주공이 됐어요! 받은 3장을 포함해 버릴 카드 3장을 고르세요 (${picks.length}/3)`));
      const tr = el("div", "mt-suits");
      tr.appendChild(el("span", "note", "기루다 바꾸기(+2장):"));
      for (const s of [null, ...M.SUITS, "N"].filter(s => s !== st.contract.suit)) {
        if (s && st.contract.n + 2 > M.MAX_BID) continue;
        const b = el("button", "btn seg-btn" + (newTrump === s ? " selected" : ""), s ? M.SUIT_SYM[s] : "그대로");
        b.addEventListener("click", () => { newTrump = s; render(); });
        tr.appendChild(b);
      }
      box.appendChild(tr);
      const ok = el("button", "btn primary", "버리기");
      ok.disabled = picks.length !== 3;
      ok.addEventListener("click", () => { if (send({ k: "kitty", discards: picks, newTrump })) { picks = []; newTrump = null; } });
      box.appendChild(ok);
      return box;
    }
    if (st.phase === "friend") {
      box.appendChild(el("p", "note", "프렌드를 정하세요"));
      const m = M.mightyCard(st);
      const quick = [m, "JK", ...(st.trump !== "N" ? [st.trump + "14", st.trump + "13"] : []), "S14", "D14", "H14", "C14"]
        .filter((c, i, a) => a.indexOf(c) === i && !st.hands[me].includes(c) && !st.discards.includes(c)).slice(0, 5);
      const row = el("div", "mt-suits");
      for (const c of quick) {
        const b = el("button", "btn seg-btn", M.cardText(c) + (c === m ? "(마이티)" : ""));
        b.addEventListener("click", () => send({ k: "friend", spec: { type: "card", card: c } }));
        row.appendChild(b);
      }
      box.appendChild(row);
      const row2 = el("div", "mt-suits");
      const first = el("button", "btn seg-btn", "초구 프렌드");
      first.addEventListener("click", () => send({ k: "friend", spec: { type: "first" } }));
      const none = el("button", "btn seg-btn", "노프렌드(2배)");
      none.addEventListener("click", () => send({ k: "friend", spec: { type: "none" } }));
      row2.append(first, none);
      for (let k = 1; k < 5; k++) {
        const p = (me + k) % 5;
        const b = el("button", "btn seg-btn", `${st.players[p].name} 지정`);
        b.addEventListener("click", () => send({ k: "friend", spec: { type: "player", player: p } }));
        row2.appendChild(b);
      }
      box.appendChild(row2);
      return box;
    }
    if (st.phase === "play") {
      if (pendingCard?.kind === "joker") {
        box.appendChild(el("p", "note", "조커로 시작: 다른 사람이 낼 무늬를 고르세요"));
        const row = el("div", "mt-suits");
        for (const s of M.SUITS) {
          const b = el("button", "btn seg-btn" + (s === "D" || s === "H" ? " redtxt" : ""), M.SUIT_SYM[s]);
          b.addEventListener("click", () => { const c = pendingCard.card; pendingCard = null; send({ k: "play", card: c, opts: { jokerSuit: s } }); render(); });
          row.appendChild(b);
        }
        box.appendChild(row);
        return box;
      }
      if (pendingCard?.kind === "call") {
        box.appendChild(el("p", "note", `${M.cardText(pendingCard.card)}로 조커 콜을 할까요?`));
        const row = el("div", "row");
        const y = el("button", "btn primary", "조커 콜!"), n = el("button", "btn", "그냥 내기");
        y.addEventListener("click", () => { const c = pendingCard.card; pendingCard = null; send({ k: "play", card: c, opts: { call: true } }); render(); });
        n.addEventListener("click", () => { const c = pendingCard.card; pendingCard = null; send({ k: "play", card: c, opts: { call: false } }); render(); });
        row.append(y, n);
        box.appendChild(row);
        return box;
      }
      box.appendChild(el("p", "note", st.trick.cards.length ? "내 차례: 밝은 카드 중 하나를 내세요" : "내 차례: 먼저 낼 카드를 고르세요"));
    }
    return box;
  }

  function dealEndPanel(box) {
    const st = getState();
    const r = st.dealResult;
    box.appendChild(el("h3", null, r.win ? "🎉 주공 편 승리!" : "🛡️ 야당 승리!"));
    const n = r.contract.n, all = st.taken.reduce((a, t) => a + t.length, 0), opp = all - r.got;
    const diff = r.got - n;
    const sum = el("div", "mt-settle");
    sum.appendChild(el("div", "st-main", `공약 ${M.bidText(r.contract)} → 주공 편 ${r.got}장 `
      + (diff >= 0 ? `(${diff ? diff + "장 넘김" : "딱 맞춤"})` : `(${-diff}장 부족)`) + ` · 상대 편 ${opp}장`));
    sum.appendChild(el("div", "st-sub", `주공 ${st.players[r.declarer].name}`
      + (r.friend != null ? ` · 프렌드 ${st.players[r.friend].name}` : " · 프렌드 없음")
      + (all < 20 ? ` · 버린 카드 속 점수 ${20 - all}장` : "")));
    const mult = (r.contract.suit === "N" ? 2 : 1) * (r.friend == null ? 2 : 1);
    const base = r.V / mult;
    const formula = r.win ? `(${r.got}−${n}) + (${n}−13)×2 + 1 = ${base}` : `−(${n}−${r.got}) = ${base}`;
    sum.appendChild(el("div", "st-sub", `기본 점수 ${formula}` + (mult > 1 ? ` × ${mult}` + (r.contract.suit === "N" ? " (노기루다" : " (") + (r.friend == null ? (r.contract.suit === "N" ? "·노프렌드)" : "노프렌드)") : ")") + ` = ${r.V}` : "")));
    const roles = r.friend != null
      ? `주공 ×2 = ${fmtD(2 * r.V)} · 프렌드 ×1 = ${fmtD(r.V)} · 상대 편 각 ${fmtD(-r.V)}`
      : `주공 ×4 = ${fmtD(4 * r.V)} · 상대 편 각 ${fmtD(-r.V)}`;
    sum.appendChild(el("div", "st-sub", roles));
    box.appendChild(sum);
    const ol = el("ol", "board");
    st.players.map((pl, i) => ({ pl, i })).sort((a, b) => st.scores[b.i] - st.scores[a.i]).forEach(({ pl, i }) => {
      const li = el("li", i === me ? "me" : "");
      const who = el("span", "who", pl.name);
      if (st.opts?.dealEndCards) who.appendChild(el("small", "taken-line", st.taken[i].length ? st.taken[i].map(M.cardText).join(" ") : "먹은 점수 카드 없음"));
      const prev = st.scores[i] - r.delta[i];
      li.append(who, el("span", "time", `${prev} ${r.delta[i] >= 0 ? "+" : "−"} ${Math.abs(r.delta[i])} = ${st.scores[i]}`));
      ol.appendChild(li);
    });
    box.appendChild(ol);
    if (me >= 0) {
      const next = el("button", "btn primary", M.matchOver(st) ? "최종 결과 보기" : "다음 판");
      next.addEventListener("click", () => { showTrick = null; bidSuit = null; bidN = null; send({ k: "next" }); });
      box.appendChild(next);
      if (multi) box.appendChild(el("p", "note", "탁자에 앉은 누구든 눌러서 넘길 수 있어요"));
    }
    return box;
  }
  function matchEndPanel(box) {
    const st = getState();
    box.appendChild(el("h3", null, "🏁 게임 끝!"));
    const ol = el("ol", "board");
    const ranked = st.players.map((pl, i) => ({ pl, i })).sort((a, b) => st.scores[b.i] - st.scores[a.i]);
    ranked.forEach(({ pl, i }, k) => {
      const li = el("li", i === me ? "me" : "");
      li.append(el("span", "rank", ["🥇", "🥈", "🥉"][k] || `${k + 1}위`), el("span", "who", pl.name), el("span", "time", `${st.scores[i]}점`));
      ol.appendChild(li);
    });
    box.appendChild(ol);
    if (!saved) { saved = true; onMatchEnd?.(st, me); }
    return box;
  }

  update();
  return { update, flash: setFlash, waiting: () => !!showTrick };
}
