// 🃏 마이티 화면 — 1단계: 나 + 컴퓨터 4명 연습판
import * as M from "./mighty.js";

const AI_DELAY = 750, TRICK_PAUSE = 1300;
const BOT_NAMES = ["컴퓨터 가", "컴퓨터 나", "컴퓨터 다", "컴퓨터 라"];

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const red = c => c !== "JK" && (c[0] === "H" || c[0] === "D");

function cardEl(c, { small = false, playable = false, picked = false, onClick } = {}) {
  const b = el("button", "mc" + (small ? " small" : "") + (red(c) ? " red" : "") + (c === "JK" ? " joker" : "")
    + (playable ? " ok" : "") + (picked ? " picked" : ""));
  if (c === "JK") b.textContent = "🃏";
  else {
    b.appendChild(el("span", "r", M.RANK_TXT[M.rankOf(c)] || M.rankOf(c)));
    b.appendChild(el("span", "s", M.SUIT_SYM[M.suitOf(c)]));
  }
  if (onClick) b.addEventListener("click", onClick);
  else b.disabled = true;
  return b;
}

// view: 그려 넣을 상자, me: 내 이름, toast, onExit
export function openMightyPractice({ view, myName, toast, onExit, onMatchEnd }) {
  view.textContent = "";
  const setup = el("div", "card");
  setup.appendChild(el("h2", null, "🃏 마이티 연습 (나 + 컴퓨터 4명)"));
  setup.appendChild(el("p", "note", "게임 길이를 고르세요"));
  const sel = el("div", "seg wrap");
  const opts = [["d3", "3판"], ["d5", "5판"], ["d10", "10판"], ["m20", "20분"], ["m30", "30분"], ["m60", "60분"]];
  let pick = "d5";
  const btns = opts.map(([k, label]) => {
    const b = el("button", "btn seg-btn" + (k === pick ? " selected" : ""), label);
    b.addEventListener("click", () => { pick = k; btns.forEach(x => x.classList.toggle("selected", x === b)); });
    sel.appendChild(b);
    return b;
  });
  setup.appendChild(sel);
  const go = el("button", "btn primary", "시작");
  setup.appendChild(go);
  const rules = el("details", "rules");
  rules.appendChild(el("summary", null, "규칙 요약 보기"));
  for (const t of [
    "53장(조커 포함), 1인 10장. 점수 카드는 A·K·Q·J·10 (모두 20장)",
    "공약: 기루다 무늬와 장수(13장부터, 노기루다 12장부터). 가장 높게 부른 사람이 주공",
    "주공은 남은 3장을 받아 3장을 버리고 프렌드를 정함 (카드·초구·노프렌드·사람 지정)",
    "센 카드: 마이티(♠A, 기루다가 ♠면 ◆A) > 조커 > 기루다 > 처음 낸 무늬",
    "조커는 첫 판·마지막 판에 힘이 없음. ♣3(기루다 ♣면 ♠3)을 먼저 내며 조커 콜 가능",
    "같은 무늬가 있으면 같은 무늬를 내야 함 (마이티·조커는 언제나 가능). 첫 판엔 기루다를 먼저 못 냄",
    "점수: 이기면 (먹은 장수−공약)+(공약−13)×2+1, 지면 −(공약−먹은 장수). 노기루다·노프렌드는 2배"
  ]) rules.appendChild(el("p", null, "• " + t));
  setup.appendChild(rules);
  const back = el("button", "btn", "대기실로");
  back.addEventListener("click", onExit);
  view.append(setup, back);

  go.addEventListener("click", () => {
    const length = pick[0] === "d" ? { deals: Number(pick.slice(1)) } : { minutes: Number(pick.slice(1)) };
    const players = [{ id: "me", name: myName || "나", ai: false }, ...BOT_NAMES.map((n, i) => ({ id: "bot" + i, name: n, ai: true }))];
    const st = M.newMatch({ players, seed: Math.floor(Math.random() * 2 ** 31), length });
    runTable({ view, st, me: 0, toast, onExit, onMatchEnd });
  });
}

function runTable({ view, st, me, toast, onExit, onMatchEnd }) {
  let busy = false, timer = null;
  let picks = [];                // 버릴 카드 고르기
  let newTrump = null;           // 기루다 바꾸기
  let pendingCard = null;        // 조커/콜 선택 대기
  let showTrick = null;          // 끝난 판 잠깐 보여 주기
  let bidSuit = null, bidN = null;
  let lastShown = null, saved = false;

  const root = el("div", "mt");
  view.textContent = "";
  view.appendChild(root);

  function act(fn) {
    try { fn(); } catch (e) { toast(e.message); return; }
    afterChange();
  }
  function afterChange() {
    // 판이 막 끝났으면 잠깐 보여 줌
    if (st.lastTrick && st.lastTrick !== lastShown) {
      lastShown = st.lastTrick;
      showTrick = { src: st.lastTrick, until: Date.now() + TRICK_PAUSE };
      render();
      clearTimeout(timer);
      timer = setTimeout(() => { showTrick = null; afterChange(); }, TRICK_PAUSE);
      return;
    }
    render();
    schedule();
  }
  function schedule() {
    clearTimeout(timer);
    if (showTrick) return;
    const p = M.whoActs(st);
    if (p >= 0 && st.players[p].ai) {
      timer = setTimeout(() => {
        try { M.aiStep(st, p); } catch (e) { console.error(e); }
        afterChange();
      }, AI_DELAY);
    }
  }

  // ---------- 그리기 ----------
  function render() {
    root.textContent = "";
    const top = el("div", "mt-seats");
    for (let k = 1; k < 5; k++) {
      const p = (me + k) % 5;
      top.appendChild(seat(p));
    }
    root.appendChild(top);
    root.appendChild(infoBar());
    root.appendChild(center());
    root.appendChild(seat(me, true));
    root.appendChild(actionPanel());
    root.appendChild(hand());
    const log = el("div", "mt-log");
    for (const t of st.log.slice(-4)) log.appendChild(el("div", null, t));
    root.appendChild(log);
    const quit = el("button", "btn link-btn", "그만하고 나가기");
    quit.addEventListener("click", () => { clearTimeout(timer); onExit(); });
    root.appendChild(quit);
  }

  function role(p) {
    if (!st.contract) return "";
    if (p === st.contract.declarer) return "👑";
    const f = st.friend;
    if (f && f.revealed && f.idx === p) return "🤝";
    if (p === me && f && f.type === "card" && st.hands[me].includes(f.card)) return "🤝(나만 앎)";
    return "";
  }
  function seat(p, mine = false) {
    const d = el("div", "mt-seat" + (M.whoActs(st) === p ? " turn" : "") + (mine ? " mine" : ""));
    d.appendChild(el("b", null, `${role(p)} ${st.players[p].name}${mine ? " (나)" : ""}`));
    const b = st.bids?.[p];
    let sub = `카드 ${st.hands[p].length}`;
    if (st.phase === "bid") sub = b === "pass" ? "패스" : b ? M.bidText(b) : "…";
    else if (st.phase === "play" || st.phase === "dealEnd") sub += ` · 점수 ${st.taken[p].length}`;
    d.appendChild(el("small", null, sub));
    d.appendChild(el("small", "tot", `총점 ${st.scores[p]}`));
    return d;
  }
  function infoBar() {
    const d = el("div", "mt-info");
    const parts = [`${st.dealNo}판째` + (st.length.deals ? `/${st.length.deals}` : "")];
    if (st.contract) {
      parts.push(`${st.players[st.contract.declarer].name} ${M.bidText(st.contract)}`);
      const f = st.friend;
      if (f) parts.push(f.type === "none" ? "노프렌드" : f.type === "first" ? (f.revealed ? `프렌드 ${f.idx === null ? "없음" : st.players[f.idx].name}` : "초구 프렌드")
        : f.type === "card" ? `프렌드 ${M.cardText(f.card)}${f.revealed ? ` = ${st.players[f.idx].name}` : ""}` : `프렌드 ${st.players[f.idx].name}`);
      if (st.phase === "play") {
        const gov = st.taken[st.contract.declarer].length + (st.friend?.revealed && st.friend.idx != null ? st.taken[st.friend.idx].length : 0);
        parts.push(`주공 편 ${gov}장 · ${st.trickNo}/10판`);
        parts.push(`마이티 ${M.cardText(M.mightyOf(st.trump))} · 콜 ${M.cardText(M.callCardOf(st.trump))}`);
      }
    } else if (st.phase === "bid") {
      const { best, who } = M.highestBid(st);
      parts.push(best ? `최고 공약 ${st.players[who].name} ${M.bidText(best)}` : "공약을 불러 주세요");
    }
    for (const t of parts) d.appendChild(el("span", null, t));
    return d;
  }
  function center() {
    const d = el("div", "mt-center");
    const cards = showTrick ? showTrick.src.cards : st.trick?.cards || [];
    if (showTrick) d.appendChild(el("div", "mt-win", `${st.players[showTrick.src.winner].name} 승!`));
    else if (st.trick?.called) d.appendChild(el("div", "mt-win", "조커 콜!"));
    else if (st.trick?.leadSuit) d.appendChild(el("div", "mt-lead", `${M.SUIT_SYM[st.trick.leadSuit]} 판`));
    const row = el("div", "mt-trick");
    for (const { p, card } of cards) {
      const w = el("div", "mt-played" + (showTrick && p === showTrick.src.winner ? " win" : ""));
      w.appendChild(cardEl(card, { small: true }));
      w.appendChild(el("small", null, st.players[p].name));
      row.appendChild(w);
    }
    d.appendChild(row);
    return d;
  }

  function sortHand(h) {
    const order = { [st.trump || "S"]: 0 };
    let i = 1;
    for (const s of M.SUITS) if (!(s in order)) order[s] = i++;
    const m = st.trump ? M.mightyOf(st.trump) : "S14";
    return h.slice().sort((a, b) => {
      const ka = a === m ? -2 : a === "JK" ? -1 : order[M.suitOf(a)] * 20 + (20 - M.rankOf(a));
      const kb = b === m ? -2 : b === "JK" ? -1 : order[M.suitOf(b)] * 20 + (20 - M.rankOf(b));
      return ka - kb;
    });
  }
  function hand() {
    const d = el("div", "mt-hand");
    const h = sortHand(st.hands[me]);
    const myTurnPlay = st.phase === "play" && st.turn === me && !showTrick && !pendingCard;
    const legal = myTurnPlay ? M.legalPlays(st, me) : [];
    const discarding = st.phase === "kitty" && st.contract.declarer === me;
    for (const c of h) {
      if (discarding) {
        d.appendChild(cardEl(c, { playable: true, picked: picks.includes(c), onClick: () => {
          picks = picks.includes(c) ? picks.filter(x => x !== c) : picks.length < 3 ? picks.concat(c) : picks;
          render();
        } }));
      } else if (myTurnPlay && legal.includes(c)) {
        d.appendChild(cardEl(c, { playable: true, onClick: () => playCard(c) }));
      } else d.appendChild(cardEl(c));
    }
    return d;
  }
  function playCard(c) {
    const leading = !st.trick.cards.length;
    if (leading && c === "JK") { pendingCard = { card: c, kind: "joker" }; render(); return; }
    if (leading && c === M.callCardOf(st.trump) && st.trickNo !== 1 && st.trickNo !== 10 && !st.hands[me].includes("JK")) {
      pendingCard = { card: c, kind: "call" }; render(); return;
    }
    act(() => M.applyPlay(st, me, c));
  }

  // ---------- 내 차례에 할 일 ----------
  function actionPanel() {
    const box = el("div", "mt-act");
    const actor = M.whoActs(st);
    if (st.phase === "dealEnd") return dealEndPanel(box);
    if (st.phase === "matchEnd") return matchEndPanel(box);
    if (showTrick) return box;
    if (actor !== me) {
      if (actor >= 0) box.appendChild(el("p", "note", `${st.players[actor].name} 차례…`));
      return box;
    }
    if (st.phase === "bid") {
      const { best } = M.highestBid(st);
      if (!bidSuit) bidSuit = best?.suit && best.suit !== "N" ? best.suit : "S";
      const minFor = s => {
        for (let n = s === "N" ? M.MIN_BID_NT : M.MIN_BID; n <= M.MAX_BID; n++) if (M.bidOk(st, { suit: s, n })) return n;
        return null;
      };
      if (bidN == null || !M.bidOk(st, { suit: bidSuit, n: bidN })) bidN = minFor(bidSuit);
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
      call.addEventListener("click", () => act(() => M.applyBid(st, me, { suit: bidSuit, n: bidN })));
      const pass = el("button", "btn", "패스");
      pass.addEventListener("click", () => act(() => M.applyBid(st, me, "pass")));
      row.append(call, pass);
      box.appendChild(row);
      if (M.canDealMiss(st, me)) {
        const dm = el("button", "btn link-btn", "딜미스 (다시 나눠 주세요)");
        dm.addEventListener("click", () => act(() => M.applyBid(st, me, "dealmiss")));
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
      ok.addEventListener("click", () => act(() => { M.applyKitty(st, me, { discards: picks, newTrump }); picks = []; }));
      box.appendChild(ok);
      return box;
    }
    if (st.phase === "friend") {
      box.appendChild(el("p", "note", "프렌드를 정하세요"));
      const m = M.mightyOf(st.trump);
      const quick = [m, "JK", ...(st.trump !== "N" ? [st.trump + "14", st.trump + "13"] : []), "S14", "D14", "H14", "C14"]
        .filter((c, i, a) => a.indexOf(c) === i && !st.hands[me].includes(c) && !st.discards.includes(c)).slice(0, 5);
      const row = el("div", "mt-suits");
      for (const c of quick) {
        const b = el("button", "btn seg-btn", M.cardText(c) + (c === m ? "(마이티)" : ""));
        b.addEventListener("click", () => act(() => M.applyFriend(st, me, { type: "card", card: c })));
        row.appendChild(b);
      }
      box.appendChild(row);
      const row2 = el("div", "mt-suits");
      const first = el("button", "btn seg-btn", "초구 프렌드");
      first.addEventListener("click", () => act(() => M.applyFriend(st, me, { type: "first" })));
      const none = el("button", "btn seg-btn", "노프렌드(2배)");
      none.addEventListener("click", () => act(() => M.applyFriend(st, me, { type: "none" })));
      row2.append(first, none);
      for (let k = 1; k < 5; k++) {
        const p = (me + k) % 5;
        const b = el("button", "btn seg-btn", `${st.players[p].name} 지정`);
        b.addEventListener("click", () => act(() => M.applyFriend(st, me, { type: "player", player: p })));
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
          b.addEventListener("click", () => { const c = pendingCard.card; pendingCard = null; act(() => M.applyPlay(st, me, c, { jokerSuit: s })); });
          row.appendChild(b);
        }
        box.appendChild(row);
        return box;
      }
      if (pendingCard?.kind === "call") {
        box.appendChild(el("p", "note", `${M.cardText(pendingCard.card)}로 조커 콜을 할까요?`));
        const row = el("div", "row");
        const y = el("button", "btn primary", "조커 콜!"), n = el("button", "btn", "그냥 내기");
        y.addEventListener("click", () => { const c = pendingCard.card; pendingCard = null; act(() => M.applyPlay(st, me, c, { call: true })); });
        n.addEventListener("click", () => { const c = pendingCard.card; pendingCard = null; act(() => M.applyPlay(st, me, c, { call: false })); });
        row.append(y, n);
        box.appendChild(row);
        return box;
      }
      box.appendChild(el("p", "note", st.trick.cards.length ? "내 차례: 밝은 카드 중 하나를 내세요" : "내 차례: 먼저 낼 카드를 고르세요"));
    }
    return box;
  }

  function dealEndPanel(box) {
    const r = st.dealResult;
    box.appendChild(el("h3", null, r.win ? "🎉 주공 편 승리!" : "🛡️ 야당 승리!"));
    box.appendChild(el("p", "note", `${st.players[r.declarer].name} ${M.bidText(r.contract)} · 주공 편 ${r.got}장`
      + (r.friend != null ? ` · 프렌드 ${st.players[r.friend].name}` : " · 프렌드 없음")));
    const ol = el("ol", "board");
    st.players.map((pl, i) => ({ pl, i })).sort((a, b) => st.scores[b.i] - st.scores[a.i]).forEach(({ pl, i }) => {
      const li = el("li", i === me ? "me" : "");
      li.append(el("span", "who", pl.name), el("span", "time", `${r.delta[i] >= 0 ? "+" : ""}${r.delta[i]} → ${st.scores[i]}`));
      ol.appendChild(li);
    });
    box.appendChild(ol);
    const next = el("button", "btn primary", M.matchOver(st) ? "최종 결과 보기" : "다음 판");
    next.addEventListener("click", () => { M.nextDeal(st); showTrick = null; bidSuit = null; bidN = null; afterChange(); });
    box.appendChild(next);
    return box;
  }
  function matchEndPanel(box) {
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

  afterChange();
}
