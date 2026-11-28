// 🃏 마이티 규칙 엔진 (화면과 분리, 상태는 JSON으로 저장 가능)
// 카드: "S14" = 스페이드 A, "D10", "H11"(J), "C3" … "JK" = 조커
import { rng, shuffle } from "./games.js";

export const SUITS = ["S", "D", "H", "C"];
export const SUIT_SYM = { S: "♠", D: "◆", H: "♥", C: "♣", N: "노기루다" };
export const RANK_TXT = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export const MIN_BID = 13, MIN_BID_NT = 12, MAX_BID = 20;
const N = 5;

export const suitOf = c => (c === "JK" ? "J" : c[0]);
export const rankOf = c => (c === "JK" ? 0 : Number(c.slice(1)));
export const isPoint = c => c !== "JK" && rankOf(c) >= 10;
export const cardText = c => (c === "JK" ? "🃏조커" : SUIT_SYM[suitOf(c)] + (RANK_TXT[rankOf(c)] || rankOf(c)));
export const mightyOf = trump => (trump === "S" ? "D14" : "S14");
export const callCardOf = trump => (trump === "C" ? "S3" : "C3");
// 옵션 mightyFixed: 기루다가 ♠여도 마이티는 ♠A 그대로
export const mightyCard = st => (st.opts?.mightyFixed ? "S14" : mightyOf(st.trump));
const isSignalCard = c => c !== "JK" && [3, 6, 9].includes(rankOf(c));
export const bidText = b => (b ? `${SUIT_SYM[b.suit]} ${b.n}장` : "");

function fullDeck() {
  const d = ["JK"];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push(s + r);
  return d;
}

// ---------- 게임 전체 ----------
// players: [{ id, name, ai }]  · length: { deals } 또는 { minutes }
export function newMatch({ players, seed, length, opts = {} }) {
  const st = {
    players, seed, length, opts, startedAt: Date.now(),
    scores: new Array(N).fill(0), dealNo: 0, dealer: N - 1, history: [], phase: "idle"
  };
  newDeal(st);
  return st;
}

export function newDeal(st) {
  st.dealNo++;
  st.dealer = (st.dealer + 1) % N;
  const rand = rng(st.seed + st.dealNo * 7919);
  const deck = shuffle(fullDeck(), rand);
  st.hands = Array.from({ length: N }, (_, i) => deck.slice(i * 10, i * 10 + 10));
  st.kitty = deck.slice(50);
  st.bids = new Array(N).fill(null);        // null 아직, "pass", {suit,n}
  st.contract = null;                        // { suit, n, declarer }
  st.trump = null;
  st.friend = null;                          // { type: card|first|none|player, card?, player?, idx?, revealed }
  st.discards = [];
  st.trick = null;
  st.trickNo = 0;
  st.taken = Array.from({ length: N }, () => []);
  st.lastTrick = null;
  st.jokerOut = false;
  st.noJokerSignal = false;
  st.turn = (st.dealer + 1) % N;
  st.phase = "bid";
  st.dealResult = null;
  st.log = [];
}

const say = (st, text) => { st.log.push(text); if (st.log.length > 30) st.log.shift(); };
const nameOf = (st, p) => st.players[p].name;

// ---------- 공약 ----------
export function highestBid(st) {
  let best = null, who = -1;
  st.bids.forEach((b, i) => { if (b && b !== "pass" && (!best || beats(b, best))) { best = b; who = i; } });
  return { best, who };
}
function beats(a, b) { return a.n > b.n || (a.n === b.n && a.suit === "N" && b.suit !== "N"); }

export function bidOk(st, bid) {
  if (bid.n > MAX_BID) return false;
  if (bid.n < (bid.suit === "N" ? MIN_BID_NT : MIN_BID)) return false;
  const { best } = highestBid(st);
  return !best || beats(bid, best);
}

export function canDealMiss(st, p) {
  if (st.phase !== "bid" || st.bids[p] !== null) return false;
  const h = st.hands[p];
  if (h.includes("JK") || h.includes("S14") || h.includes("D14")) return false;
  return h.filter(isPoint).length <= 1;
}

export function applyBid(st, p, action) {
  if (st.phase !== "bid" || st.turn !== p) throw new Error("차례가 아니에요");
  if (action === "dealmiss") {
    if (!canDealMiss(st, p)) throw new Error("딜미스를 할 수 없어요");
    say(st, `${nameOf(st, p)}: 딜미스 → 다시 나눔`);
    st.dealer = (st.dealer + N - 1) % N;    // 같은 사람부터 다시
    st.dealNo--;
    newDeal(st);
    return;
  }
  if (action === "pass") {
    st.bids[p] = "pass";
    say(st, `${nameOf(st, p)}: 패스`);
  } else {
    if (!bidOk(st, action)) throw new Error("더 높게 불러야 해요");
    st.bids[p] = { suit: action.suit, n: action.n };
    say(st, `${nameOf(st, p)}: ${bidText(action)}`);
  }
  const live = [...Array(N).keys()].filter(i => st.bids[i] !== "pass");
  const { best, who } = highestBid(st);
  if (!live.length) {                       // 모두 패스
    say(st, "모두 패스 → 다시 나눔");
    st.dealNo--;                            // 다시 나눈 판은 판 수에 넣지 않음
    newDeal(st);
    return;
  }
  if (best && live.length === 1 && live[0] === who) {
    st.contract = { ...best, declarer: who };
    st.trump = best.suit;
    st.hands[who] = st.hands[who].concat(st.kitty);
    st.kitty = [];
    st.turn = who;
    st.phase = "kitty";
    say(st, `${nameOf(st, who)} 주공 · ${bidText(best)}`);
    return;
  }
  // 다음 사람 (패스 안 한 사람)
  let q = p;
  do { q = (q + 1) % N; } while (st.bids[q] === "pass");
  st.turn = q;
}

// ---------- 주공: 버리기 · 기루다 바꾸기 ----------
// newTrump: 바꿀 기루다(선택). 바꾸면 공약 +2
export function applyKitty(st, p, { discards, newTrump }) {
  if (st.phase !== "kitty" || p !== st.contract.declarer) throw new Error("주공만 할 수 있어요");
  if (discards.length !== 3 || new Set(discards).size !== 3 || !discards.every(c => st.hands[p].includes(c))) throw new Error("3장을 골라 주세요");
  if (newTrump && newTrump !== st.contract.suit) {
    const n = st.contract.n + 2;
    if (n > MAX_BID) throw new Error("20장을 넘을 수 없어요");
    st.contract = { ...st.contract, suit: newTrump, n };
    st.trump = newTrump;
    say(st, `기루다 변경 → ${bidText(st.contract)}`);
  }
  st.hands[p] = st.hands[p].filter(c => !discards.includes(c));
  st.discards = discards;
  st.phase = "friend";
}

// ---------- 프렌드 ----------
export function applyFriend(st, p, spec) {
  if (st.phase !== "friend" || p !== st.contract.declarer) throw new Error("주공만 할 수 있어요");
  const f = { type: spec.type, revealed: false, idx: null };
  if (spec.type === "card") {
    if (st.hands[p].includes(spec.card) || st.discards.includes(spec.card)) throw new Error("내 카드나 버린 카드는 안 돼요");
    f.card = spec.card;
    f.idx = st.hands.findIndex(h => h.includes(spec.card));
    say(st, `프렌드: ${cardText(spec.card)} 가진 사람`);
  } else if (spec.type === "player") {
    if (spec.player === p) throw new Error("다른 사람을 골라 주세요");
    f.idx = spec.player;
    f.revealed = true;
    say(st, `프렌드: ${nameOf(st, spec.player)}`);
  } else if (spec.type === "first") {
    say(st, "프렌드: 첫 판을 이긴 사람 (초구)");
  } else {
    f.type = "none";
    say(st, "노프렌드!");
  }
  st.friend = f;
  st.phase = "play";
  st.trickNo = 1;
  st.trick = { leader: p, cards: [], leadSuit: null, called: false };
  st.turn = p;
}

// ---------- 진행 ----------
export const jokerActive = st => st.trickNo !== 1 && st.trickNo !== 10 && !st.trick.called;

export function legalPlays(st, p) {
  const h = st.hands[p];
  const t = st.trick;
  const trump = st.trump;
  const mighty = mightyCard(st);
  if (!t.cards.length) {
    // 첫 판에는 기루다를 먼저 낼 수 없음 (기루다밖에 없으면 예외)
    if (st.trickNo === 1 && trump !== "N") {
      const ok = h.filter(c => suitOf(c) !== trump || c === mighty);
      if (ok.length) return ok;
    }
    return h.slice();
  }
  // 조커 콜: 조커를 가진 사람은 조커(또는 마이티)를 내야 함
  if (t.called && h.includes("JK")) return h.filter(c => c === "JK" || c === mighty);
  const lead = t.leadSuit;
  const follow = h.filter(c => suitOf(c) === lead);
  if (!follow.length) return h.slice();
  return h.filter(c => suitOf(c) === lead || c === "JK" || c === mighty);
}

function power(st, c) {
  const t = st.trick;
  if (c === mightyCard(st)) return 1000;
  if (c === "JK") return jokerActive(st) ? 900 : -1;
  if (st.trump !== "N" && suitOf(c) === st.trump) return 500 + rankOf(c);
  if (suitOf(c) === t.leadSuit) return 100 + rankOf(c);
  return 0;
}
export function currentWinner(st) {
  let best = -2, who = -1;
  for (const { p, card } of st.trick.cards) { const v = power(st, card); if (v > best) { best = v; who = p; } }
  return { who, best };
}
export const powerOf = power;

// opts: { jokerSuit (조커를 먼저 낼 때 무늬), call (콜 카드를 먼저 낼 때 조커 콜 여부) }
export function applyPlay(st, p, card, opts = {}) {
  if (st.phase !== "play" || st.turn !== p) throw new Error("차례가 아니에요");
  if (!legalPlays(st, p).includes(card)) throw new Error("그 카드는 지금 낼 수 없어요");
  const t = st.trick;
  if (!t.cards.length) {
    if (card === "JK") t.leadSuit = SUITS.includes(opts.jokerSuit) ? opts.jokerSuit : (st.trump !== "N" ? st.trump : "S");
    else t.leadSuit = suitOf(card);
    if (card === callCardOf(st.trump) && opts.call && st.trickNo !== 1 && st.trickNo !== 10) {
      t.called = true;
      say(st, `${nameOf(st, p)}: 조커 콜!`);
    }
  }
  st.hands[p] = st.hands[p].filter(c => c !== card);
  t.cards.push({ p, card });
  if (card === "JK") st.jokerOut = true;
  // 약속 신호: 드러난 프렌드가 먼저 3·6·9를 내면 "조커 없음"
  if (t.cards.length === 1 && isSignalCard(card) && st.friend?.revealed && st.friend.idx === p && suitOf(card) !== st.trump) st.noJokerSignal = true;
  const f = st.friend;
  if (f.type === "card" && card === f.card && !f.revealed) {
    f.revealed = true;
    say(st, `🤝 ${nameOf(st, p)}님이 프렌드!`);
  }
  if (t.cards.length < N) { st.turn = (p + 1) % N; return; }

  // 판 끝
  const { who } = currentWinner(st);
  for (const x of t.cards) if (isPoint(x.card)) st.taken[who].push(x.card);
  st.lastTrick = { cards: t.cards, winner: who, trickNo: st.trickNo };
  if (f.type === "first" && st.trickNo === 1) {
    f.idx = who === st.contract.declarer ? null : who;
    f.revealed = true;
    say(st, f.idx === null ? "주공이 첫 판을 이겨 프렌드 없음" : `🤝 첫 판을 이긴 ${nameOf(st, who)}님이 프렌드!`);
  }
  if (st.trickNo === 10) { endDeal(st); return; }
  st.trickNo++;
  st.trick = { leader: who, cards: [], leadSuit: null, called: false };
  st.turn = who;
}

export function teamOf(st, p) {
  const d = st.contract.declarer;
  if (p === d) return "gov";
  const f = st.friend;
  if (f && f.idx === p) return "gov";
  return "opp";
}

function endDeal(st) {
  const d = st.contract.declarer;
  const f = st.friend;
  const fIdx = f.idx ?? null;
  const got = st.taken[d].length + (fIdx !== null ? st.taken[fIdx].length : 0);
  const n = st.contract.n;
  const mult = (st.contract.suit === "N" ? 2 : 1) * (f.type === "none" ? 2 : 1);
  const win = got >= n;
  const V = (win ? (got - n) + (n - MIN_BID) * 2 + 1 : -(n - got)) * mult;
  const delta = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    if (i === d) delta[i] = fIdx !== null ? 2 * V : 4 * V;
    else if (i === fIdx) delta[i] = V;
    else delta[i] = -V;
  }
  delta.forEach((x, i) => { st.scores[i] += x; });
  st.dealResult = { declarer: d, friend: fIdx, contract: st.contract, got, win, V, delta };
  st.history.push({ dealNo: st.dealNo, declarer: d, friend: fIdx, contract: st.contract, got, win, delta });
  say(st, `${win ? "주공 승리" : "야당 승리"} · 주공 편 ${got}장 / 공약 ${n}장`);
  st.phase = "dealEnd";
}

export function matchOver(st) {
  if (st.length?.deals) return st.dealNo >= st.length.deals;
  if (st.length?.minutes) return Date.now() - st.startedAt >= st.length.minutes * 60000;
  return false;
}
export function nextDeal(st) {
  if (st.phase !== "dealEnd") return;
  if (matchOver(st)) { st.phase = "matchEnd"; return; }
  newDeal(st);
}

// =====================================================================
// 🤖 컴퓨터
// =====================================================================
const sortLow = (st, cards) => cards.slice().sort((a, b) => lowKey(st, a) - lowKey(st, b));
function lowKey(st, c) {
  if (c === mightyCard(st)) return 900;
  if (c === "JK") return 800;
  let k = rankOf(c);
  if (st.trump !== "N" && suitOf(c) === st.trump) k += 300;
  if (isPoint(c)) k += 50;
  return k;
}

function strength(hand, trump, fixed) {
  const m = fixed ? "S14" : mightyOf(trump);
  let s = 0;
  for (const c of hand) {
    if (c === m) s += 3;
    else if (c === "JK") s += 2.5;
    else if (trump !== "N" && suitOf(c) === trump) s += 1 + (rankOf(c) >= 13 ? 1.5 : rankOf(c) >= 11 ? 0.7 : 0.3);
    else if (rankOf(c) === 14) s += 1.2;
    else if (rankOf(c) === 13) s += 0.5;
  }
  return s;
}

export function aiAction(st, p, rand = Math.random) {
  const h = st.hands[p];
  if (st.phase === "bid") {
    if (canDealMiss(st, p) && rand() < 0.5) return { kind: "bid", action: "dealmiss" };
    let best = null;
    for (const s of [...SUITS, "N"]) {
      const est = Math.round(6 + strength(h, s, st.opts?.mightyFixed) * 0.85 - (s === "N" ? 1.5 : 0));
      if (!best || est > best.est) best = { suit: s, est };
    }
    // 아무도 안 불렀고 나만 남았으면 조금 무리해서라도 부름 (계속 다시 나누지 않게)
    const lastChance = !highestBid(st).best && st.bids.filter(b => b === "pass").length === N - 1;
    const cap = Math.min(best.est + (lastChance ? 3 : 0), 17);
    for (let n = MIN_BID_NT; n <= cap; n++) {
      if (bidOk(st, { suit: best.suit, n })) return { kind: "bid", action: { suit: best.suit, n } };
    }
    return { kind: "bid", action: "pass" };
  }
  if (st.phase === "kitty") {
    const trump = st.trump, m = mightyCard(st);
    const count = s => h.filter(c => suitOf(c) === s).length;
    const cand = h.filter(c => c !== m && c !== "JK" && (trump === "N" || suitOf(c) !== trump))
      .sort((a, b) => (isPoint(a) - isPoint(b)) || (count(suitOf(a)) - count(suitOf(b))) || (rankOf(a) - rankOf(b)));
    const pool = cand.length >= 3 ? cand : sortLow(st, h);
    return { kind: "kitty", discards: pool.slice(0, 3) };
  }
  if (st.phase === "friend") {
    const m = mightyCard({ ...st });
    const pick = [m, "JK", st.trump !== "N" ? st.trump + "14" : null, "S14", "D14", "H14", "C14"]
      .find(c => c && !h.includes(c) && !st.discards.includes(c));
    return { kind: "friend", spec: pick ? { type: "card", card: pick } : { type: "first" } };
  }
  if (st.phase === "play") return { kind: "play", ...aiPlay(st, p, rand) };
  return null;
}

function aiPlay(st, p, rand) {
  const legal = legalPlays(st, p);
  const t = st.trick;
  const m = mightyCard(st);
  const iAmGov = teamOf(st, p) === "gov" || (st.friend.type === "card" && st.hands[p].includes(st.friend.card));
  const ally = q => {
    if (q === p) return true;
    const qGov = teamOf(st, q) === "gov" && (q === st.contract.declarer || st.friend.revealed);
    return iAmGov ? qGov : !qGov;
  };
  const sig = st.opts?.aiSignal;
  const isDecl = p === st.contract.declarer;
  const callC = callCardOf(st.trump);
  if (!t.cards.length) {
    // 약속 신호 (옵션): 조커 없는 프렌드는 3·6·9로 알림 / 신호를 받은 주공은 조커 콜
    if (sig && st.trickNo >= 2 && st.trickNo <= 9 && !st.jokerOut) {
      if (isDecl && st.noJokerSignal && legal.includes(callC)) return { card: callC, opts: { call: true } };
      if (!isDecl && teamOf(st, p) === "gov" && st.friend.revealed && !st.hands[p].includes("JK") && !st.noJokerSignal) {
        const s9 = sortLow(st, legal.filter(c => isSignalCard(c) && suitOf(c) !== st.trump && !isPoint(c)));
        if (s9.length) return { card: s9[0] };
      }
    }
    // 먼저 낼 때
    let card;
    const trumps = legal.filter(c => st.trump !== "N" && suitOf(c) === st.trump && c !== m);
    const aces = legal.filter(c => rankOf(c) === 14 && c !== m && suitOf(c) !== st.trump);
    if (iAmGov && st.trickNo > 1 && trumps.length >= 2) card = trumps.sort((a, b) => rankOf(b) - rankOf(a))[0];
    else if (aces.length) card = aces[0];
    else {
      const plain = legal.filter(c => c !== "JK" && c !== m);
      const pool = plain.length ? plain : legal;
      const cnt = s => pool.filter(c => suitOf(c) === s).length;
      card = pool.slice().sort((a, b) => (cnt(suitOf(b)) - cnt(suitOf(a))) || (lowKey(st, a) - lowKey(st, b)))[0];
    }
    const opts = {};
    if (card === "JK") {
      const cnt = s => st.hands[p].filter(c => suitOf(c) === s).length;
      opts.jokerSuit = SUITS.slice().sort((a, b) => cnt(b) - cnt(a))[0];
    }
    if (card === callCardOf(st.trump) && !st.hands[p].includes("JK")) opts.call = rand() < 0.6;
    return { card, opts };
  }
  const { who, best } = currentWinner(st);
  const pts = t.cards.filter(x => isPoint(x.card)).length;
  const last = t.cards.length === N - 1;
  // 신호를 받은 주공: 이 트릭을 이겨서 다음에 조커 콜을 하러 감
  if (sig && isDecl && st.noJokerSignal && !st.jokerOut && st.hands[p].includes(callC) && st.trickNo < 9) {
    const w = sortLow(st, legal.filter(c => power(st, c) > best && c !== "JK"));
    if (w.length) return { card: w[0] };
  }
  if (ally(who) && (last || best >= 900)) {
    // 우리 편이 이기고 있으면 점수 카드를 얹어 줌
    const give = sortLow(st, legal.filter(c => isPoint(c) && power(st, c) <= best && c !== m && c !== "JK"));
    if (give.length) return { card: give[give.length - 1] };
    return { card: sortLow(st, legal)[0] };
  }
  if (ally(who)) return { card: sortLow(st, legal)[0] };
  const winners = sortLow(st, legal.filter(c => power(st, c) > best))
    .filter(c => (c !== m && c !== "JK") || pts >= 2 || last);
  if (winners.length) return { card: winners[0] };
  const dump = sortLow(st, legal.filter(c => !isPoint(c)));
  return { card: (dump.length ? dump : sortLow(st, legal))[0] };
}

// 컴퓨터 한 수 적용
export function aiStep(st, p, rand) {
  const a = aiAction(st, p, rand);
  if (!a) return;
  if (a.kind === "bid") applyBid(st, p, a.action);
  else if (a.kind === "kitty") applyKitty(st, p, a);
  else if (a.kind === "friend") applyFriend(st, p, a.spec);
  else applyPlay(st, p, a.card, a.opts);
}

// 지금 누가 행동해야 하는지
export function whoActs(st) {
  if (["bid", "play"].includes(st.phase)) return st.turn;
  if (["kitty", "friend"].includes(st.phase)) return st.contract.declarer;
  return -1;
}
