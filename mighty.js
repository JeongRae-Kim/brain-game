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
  st.played = [];                            // 나온 카드 기록 (모두가 본 정보)
  st.tricks = [];                            // 끝난 트릭 기록
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
  (st.played ||= []).push({ p, card, trickNo: st.trickNo, lead: t.leadSuit, pos: t.cards.length - 1 });
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
  st.lastTrick = { cards: t.cards, winner: who, trickNo: st.trickNo, called: t.called };
  (st.tricks ||= []).push({ cards: t.cards.slice(), winner: who, trickNo: st.trickNo, lead: t.leadSuit });
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
  if (c === "JK") return st.trickNo >= 10 ? 1 : 800;   // 마지막 트릭의 조커는 힘이 없으니 버릴 카드
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
  if (st.phase === "play") return { kind: "play", ...(aiLevelOf(st, p) === "basic" ? aiPlay(st, p, rand) : aiPlayMid(st, p, rand)) };
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
    // 9번째 트릭: 조커를 10번째(힘 없음)까지 들고 있지 않음
    if (st.trickNo === 9 && legal.includes("JK")) {
      const cnt = s => st.hands[p].filter(c => suitOf(c) === s).length;
      const js = iAmGov && st.trump !== "N" ? st.trump : SUITS.slice().sort((a, b) => cnt(b) - cnt(a))[0];
      return { card: "JK", opts: { jokerSuit: js } };
    }
    // 야당: 조커가 아직 안 나왔고 내게 조커가 없으면 콜 카드로 조커를 빼냄
    if (!iAmGov && st.trickNo >= 2 && st.trickNo <= 9 && !st.jokerOut && legal.includes(callC)
        && !st.hands[p].includes("JK") && (st.friend.type === "card" && st.friend.card === "JK" ? true : rand() < 0.7)) {
      return { card: callC, opts: { call: true } };
    }
    const trumps = legal.filter(c => st.trump !== "N" && suitOf(c) === st.trump && c !== m);
    const aces = legal.filter(c => rankOf(c) === 14 && c !== m && suitOf(c) !== st.trump);
    if (iAmGov && st.trickNo > 1 && trumps.length >= 2) card = trumps.sort((a, b) => rankOf(b) - rankOf(a))[0];
    else if (aces.length) card = aces[0];
    else {
      const plain = legal.filter(c => c !== "JK" && c !== m && (iAmGov ? c !== callC || st.jokerOut : true));
      const pool = plain.length ? plain : legal;
      const cnt = s => pool.filter(c => suitOf(c) === s).length;
      card = pool.slice().sort((a, b) => (cnt(suitOf(b)) - cnt(suitOf(a))) || (lowKey(st, a) - lowKey(st, b)))[0];
    }
    const opts = {};
    if (card === "JK") {
      const cnt = s => st.hands[p].filter(c => suitOf(c) === s).length;
      opts.jokerSuit = SUITS.slice().sort((a, b) => cnt(b) - cnt(a))[0];
    }
    // 주공 편은 자기 편 조커를 뺏지 않도록 콜하지 않음 (신호 옵션은 위에서 따로)
    if (card === callC && !st.hands[p].includes("JK")) opts.call = !iAmGov && !st.jokerOut;
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
  // 9번째 트릭에 힘 있는 조커가 있으면 지금 씀 (10번째엔 힘이 없음)
  if (st.trickNo === 9 && legal.includes("JK") && jokerActive(st) && !t.called && power(st, "JK") > best) return { card: "JK" };
  if (ally(who) && (last || best >= 900)) {
    // 우리 편이 이기고 있으면 점수 카드를 얹어 줌
    const give = sortLow(st, legal.filter(c => isPoint(c) && power(st, c) <= best && c !== m && c !== "JK"));
    if (give.length) return { card: give[give.length - 1] };
    return { card: sortLow(st, legal)[0] };
  }
  if (ally(who)) return { card: sortLow(st, legal)[0] };
  // 상대가 이기고 있을 때: 점수 카드가 1장이라도 걸리거나 후반이면 마이티·조커도 씀
  const big = pts >= 1 || st.trickNo >= 8;
  const winners = sortLow(st, legal.filter(c => power(st, c) > best))
    .filter(c => (c !== m && c !== "JK") || big);
  if (winners.length) return { card: winners[0] };
  const dump = sortLow(st, legal.filter(c => !isPoint(c)));
  return { card: (dump.length ? dump : sortLow(st, legal))[0] };
}

// 컴퓨터 실력: basic(초급) / mid(중급). 시험용으로 자리별 실력(st.aiSeats)도 받음
export const AI_LEVELS = { basic: "초급", mid: "중급" };
export const aiLevelOf = (st, p) => st.aiSeats?.[p] || st.opts?.aiLevel || "mid";

// ---------------------------------------------------------------------
// 중급: 나온 카드 기억 + 편 판단 + 자리 순서를 보고 냄 (다른 사람 패는 보지 않음)
// ---------------------------------------------------------------------
function memoryOf(st, p) {
  const played = st.played || [];
  const seen = new Set(played.map(x => x.card));
  for (const c of st.hands[p]) seen.add(c);
  if (p === st.contract.declarer) for (const c of st.discards) seen.add(c);
  const m = mightyCard(st);
  // 무늬가 떨어진 사람: 그 무늬가 선인데 다른 무늬를 냄 (마이티·조커는 언제든 낼 수 있으니 제외)
  const void_ = Array.from({ length: N }, () => new Set());
  for (const x of played) {
    if (x.pos === 0 || !x.lead) continue;
    if (x.card === "JK" || x.card === m) continue;
    if (suitOf(x.card) !== x.lead) void_[x.p].add(x.lead);
  }
  const unseen = fullDeck().filter(c => !seen.has(c));
  const trump = st.trump;
  const trumpsOut = trump && trump !== "N" ? unseen.filter(c => suitOf(c) === trump && c !== m).length : 0;
  // 이 카드가 그 무늬에서 남은 것 중 가장 높은지
  const isBoss = c => {
    if (c === m) return true;
    if (c === "JK") return false;
    const s = suitOf(c);
    return !unseen.some(u => u !== m && suitOf(u) === s && rankOf(u) > rankOf(c));
  };
  return { seen, unseen, void_, trumpsOut, isBoss, mightyGone: seen.has(m) && !st.hands[p].includes(m),
    callGone: seen.has(callCardOf(trump)) && !st.hands[p].includes(callCardOf(trump)) };
}

// 각 사람이 내 편인지: "ally" / "enemy" / "unknown"(숨은 프렌드일 수도 있는 사람)
function sidesOf(st, p) {
  const d = st.contract.declarer, f = st.friend;
  const iAmSecretFriend = f.type === "card" && !f.revealed && st.hands[p].includes(f.card);
  const iAmGov = p === d || (f.revealed && f.idx === p) || iAmSecretFriend;
  const friendKnown = f.type === "none" || f.revealed || (f.type === "first" && st.trickNo > 1);
  // 숨은 프렌드 추리: 주공이 이기는 트릭에 점수 카드를 얹어 준 사람
  const sus = new Array(N).fill(0);
  for (const t of st.tricks || []) {
    if (t.winner !== d) continue;
    for (const x of t.cards) if (x.p !== d && isPoint(x.card) && x.pos !== 0) sus[x.p] += 1;
  }
  return Array.from({ length: N }, (_, q) => {
    if (q === p) return "ally";
    if (q === d) return iAmGov ? "ally" : "enemy";
    if (friendKnown) {
      const qGov = f.type !== "none" && f.idx === q;
      return qGov === iAmGov ? "ally" : "enemy";
    }
    if (iAmSecretFriend) return "enemy";            // 나 말고는 모두 야당
    if (iAmGov) return "unknown";                     // 주공: 누가 프렌드인지 모름
    // 야당: 주공 편일 낌새가 짙으면 상대로 봄
    const maxSus = Math.max(...sus.filter((_, i) => i !== p && i !== d));
    return sus[q] >= 2 && sus[q] === maxSus ? "enemy" : "unknown";
  });
}

function aiPlayMid(st, p, rand) {
  const legal = legalPlays(st, p);
  const t = st.trick;
  const m = mightyCard(st);
  const callC = callCardOf(st.trump);
  const mem = memoryOf(st, p);
  const side = sidesOf(st, p);
  const iAmGov = p === st.contract.declarer || side[st.contract.declarer] === "ally";
  const isDecl = p === st.contract.declarer;
  const sig = st.opts?.aiSignal;
  const hasJK = st.hands[p].includes("JK");
  const trump = st.trump !== "N" ? st.trump : null;
  const order = [];                      // 아직 낼 사람들 (나 다음부터)
  for (let k = t.cards.length + 1; k < N; k++) order.push((t.leader + k) % N);
  const after = order.filter(q => q !== p);
  const enemyAfter = after.some(q => side[q] !== "ally");

  // ---------- 먼저 낼 때 ----------
  if (!t.cards.length) {
    if (sig && st.trickNo >= 2 && st.trickNo <= 9 && !st.jokerOut) {
      if (isDecl && st.noJokerSignal && legal.includes(callC)) return { card: callC, opts: { call: true } };
      if (!isDecl && st.friend.revealed && st.friend.idx === p && !hasJK && !st.noJokerSignal) {
        const s9 = sortLow(st, legal.filter(c => isSignalCard(c) && suitOf(c) !== st.trump && !isPoint(c)));
        if (s9.length) return { card: s9[0] };
      }
    }
    const jokerSuitFor = () => {
      if (iAmGov && trump && mem.trumpsOut > 0) return trump;            // 조커로 선을 잡아 기루다를 부름
      const cnt = s => st.hands[p].filter(c => suitOf(c) === s).length;
      return SUITS.slice().sort((a, b) => cnt(b) - cnt(a))[0];
    };
    // 조커: 9번째엔 반드시, 주공 편은 콜 카드가 남아 있으면 중반(4~7)에 먼저 씀
    if (legal.includes("JK") && jokerActive(st)) {
      if (st.trickNo === 9) return { card: "JK", opts: { jokerSuit: jokerSuitFor() } };
      if (iAmGov && !mem.callGone && st.trickNo >= 4 && st.trickNo <= 7 && !legal.includes(callC)) {
        return { card: "JK", opts: { jokerSuit: jokerSuitFor() } };
      }
    }
    // 야당: 조커가 안 나왔고 내게 없으면 콜 카드로 빼냄
    if (!iAmGov && st.trickNo >= 2 && st.trickNo <= 9 && !st.jokerOut && legal.includes(callC) && !hasJK) {
      return { card: callC, opts: { call: true } };
    }
    const declVoid = mem.void_[st.contract.declarer];
    const enemies = [0, 1, 2, 3, 4].filter(q => side[q] === "enemy");
    const enemyVoid = s => enemies.some(q => mem.void_[q].has(s));
    const plainOf = arr => arr.filter(c => c !== "JK" && c !== m && !(c === callC && iAmGov && !st.jokerOut));
    if (iAmGov) {
      // 기루다 빼기: 다른 사람 손에 기루다가 남아 있는 동안만
      const myTrumps = legal.filter(c => trump && suitOf(c) === trump && c !== m);
      if (st.trickNo > 1 && trump && mem.trumpsOut > 0 && myTrumps.length >= 2) {
        const bosses = myTrumps.filter(mem.isBoss);
        if (bosses.length) return { card: bosses.sort((a, b) => rankOf(b) - rankOf(a))[0] };
        if (myTrumps.length >= 3) return { card: sortLow(st, myTrumps)[0] };
      }
      // 제일 높은 카드(보스)부터: 상대가 잘라 먹을 무늬는 피함 (상대 기루다가 남았을 때)
      const safe = c => !(mem.trumpsOut > 0 && enemyVoid(suitOf(c)));
      const boss = plainOf(legal).filter(c => (!trump || suitOf(c) !== trump) && mem.isBoss(c) && safe(c));
      if (boss.length) return { card: boss.sort((a, b) => rankOf(b) - rankOf(a))[0] };
    } else {
      // 야당: 보스 카드, 단 주공이 떨어진 무늬는 피함
      const boss = plainOf(legal).filter(c => (!trump || suitOf(c) !== trump) && mem.isBoss(c) && !(declVoid.has(suitOf(c)) && mem.trumpsOut > 0));
      if (boss.length) return { card: boss.sort((a, b) => rankOf(b) - rankOf(a))[0] };
    }
    // 그 밖: 점수 카드가 아닌 낮은 카드, 상대가 잘라 먹을 무늬는 피함
    let pool = plainOf(legal);
    if (!pool.length) pool = legal.slice();
    const risky = s => (iAmGov ? enemyVoid(s) : declVoid.has(s)) && mem.trumpsOut > 0;
    const ranked = pool.slice().sort((a, b) =>
      (risky(suitOf(a)) - risky(suitOf(b))) || (isPoint(a) - isPoint(b))
      || ((trump && suitOf(a) === trump) - (trump && suitOf(b) === trump)) || (lowKey(st, a) - lowKey(st, b)));
    const card = ranked[0];
    const opts = {};
    if (card === "JK") opts.jokerSuit = jokerSuitFor();
    if (card === callC && !hasJK) opts.call = !iAmGov && !st.jokerOut;
    return { card, opts };
  }

  // ---------- 따라 낼 때 ----------
  const { who, best } = currentWinner(st);
  const pts = t.cards.filter(x => isPoint(x.card)).length;
  const last = !after.length;
  const winSide = side[who];
  const winCard = t.cards.find(x => x.p === who).card;
  if (sig && isDecl && st.noJokerSignal && !st.jokerOut && st.hands[p].includes(callC) && st.trickNo < 9) {
    const w = sortLow(st, legal.filter(c => power(st, c) > best && c !== "JK"));
    if (w.length) return { card: w[0] };
  }
  const jkLive = legal.includes("JK") && jokerActive(st) && power(st, "JK") > best;
  // 9번째 트릭: 조커가 10번째(힘 없음)에 남지 않게 지금 씀
  if (st.trickNo === 9 && jkLive) return { card: "JK" };
  // 지금 이기는 카드가 끝까지 버틸지 (뒤에 상대가 있으면 보스여야 함)
  const holds = (c, pw) => {
    if (last || !enemyAfter || c === m) return true;
    if (c === "JK") return mem.mightyGone;
    if (!mem.isBoss(c)) return false;
    if (pw >= 500) return true;                                       // 가장 높은 기루다
    // 가장 높은 보통 카드: 뒤의 상대가 이 무늬가 떨어져 잘라 먹을 수 있으면 불안
    return mem.trumpsOut === 0 || after.every(q => side[q] === "ally" || !mem.void_[q].has(t.leadSuit));
  };
  if (winSide === "ally") {
    const winHolds = holds(winCard, best);
    if (winHolds) {
      // 우리 편이 확실히 이기면 점수 카드를 얹음
      const give = sortLow(st, legal.filter(c => isPoint(c) && power(st, c) <= best && c !== m && c !== "JK"));
      if (give.length) return { card: give[give.length - 1] };
    }
    const low = sortLow(st, legal.filter(c => c !== m && c !== "JK" && !isPoint(c)));
    return { card: (low.length ? low : sortLow(st, legal))[0] };
  }
  // 상대 또는 모르는 사람이 이기는 중
  const worth = pts + after.length * 0.4;                       // 아직 더 걸릴 점수 기대치
  const bigTrick = pts >= 2 || (pts >= 1 && st.trickNo >= 8) || (isPoint(winCard) && rankOf(winCard) >= 13)
    || (iAmGov && hasJK && !mem.callGone && st.trickNo >= 4 && pts >= 1);
  const cand = sortLow(st, legal.filter(c => power(st, c) > best));
  for (const c of cand) {
    const pw = power(st, c);
    if (c === m) { if (bigTrick || (pts >= 1 && last) || st.trickNo >= 8) return { card: c }; continue; }
    if (c === "JK") {
      if (!bigTrick && !(pts >= 1 && last)) continue;
      // 마이티가 아직 안 나왔고 뒤에 상대가 있으면 조커는 점수가 클 때만
      if (!mem.mightyGone && enemyAfter && !st.hands[p].includes(m) && pts < 3 && st.trickNo < 8) continue;
      return { card: c };
    }
    // 보통 카드: 모르는 사람이 이기는 중이면 점수가 걸렸을 때만 뺏음
    if (winSide === "unknown" && pts === 0 && !last) continue;
    if (isPoint(c) && !holds(c, pw)) continue;                   // 뺏길 점수 카드로는 이기려 하지 않음
    if (holds(c, pw) || worth >= 1) return { card: c };
  }
  // 못 이기면: 점수 카드를 아끼고 가장 쓸모없는 카드를 버림
  const dump = sortLow(st, legal.filter(c => !isPoint(c) && c !== m && c !== "JK"));
  if (dump.length) return { card: dump[0] };
  const nonBig = sortLow(st, legal.filter(c => c !== m && c !== "JK"));
  return { card: (nonBig.length ? nonBig : sortLow(st, legal))[0] };
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
