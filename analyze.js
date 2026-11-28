// 🔍 마이티 해설 엔진 — 기보에서 사람이 둔 수마다
//  1) 패턴 검사: 놓친 자르기, 주공이 떨어진 무늬로 선, 상대에게 점수 바치기, 조커 낭비 …
//  2) 시뮬레이션: 그 사람이 그때 알 수 있던 정보만으로 남은 패를 여러 번 다시 나눠
//     다른 카드를 냈을 때의 기대 점수를 비교 (5명 패를 보고 판단하지 않음 → 몰랐던 것을 탓하지 않음)
import * as M from "./mighty.js";
import { rebuild } from "./replay.js";

const clone = o => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const ct = M.cardText;
function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 트릭 카드 묶음으로 힘 계산 (그 트릭의 선 무늬 기준)
function powerIn(S, cards, c) {
  const T = { ...S, trick: { ...S.trick, cards } };
  return M.powerOf(T, c);
}
const pointsOf = cards => cards.filter(x => M.isPoint(x.card)).length;

// ---------------------------------------------------------------------
// 1) 패턴 검사
// ---------------------------------------------------------------------
function patternNotes(S, p, card, T, legal) {
  const out = [];
  if (legal.length <= 1) return out;                                   // 낼 카드가 하나뿐
  const m = M.mightyCard(S), trump = S.trump !== "N" ? S.trump : null;
  const lead = !S.trick.cards.length;
  const side = M.sidesOf(S, p), mem = M.memoryOf(S, p);
  const d = S.contract.declarer;
  const sameTeam = (a, b) => M.teamOf(S, a) === M.teamOf(S, b);
  const pts = pointsOf(T.cards);
  const won = T.winner === p;
  const others = T.cards.filter(x => x.p !== p);
  const nm = q => S.players[q].name;

  if (card === "JK") {
    if (S.trickNo === 1) out.push({ kind: "bad", tag: "조커 낭비", text: "조커는 첫 트릭에 힘이 없어요. 다른 카드를 내고 조커는 아껴 두는 게 좋아요." });
    else if (S.trickNo === 10) out.push({ kind: "bad", tag: "조커 낭비", text: "조커를 마지막 트릭까지 들고 있었어요. 10번째 트릭에서는 힘이 없으니 9번째 전에 쓰는 게 좋아요." });
    else if (!won && !S.trick.called) out.push({ kind: "tip", tag: "조커", text: `조커를 냈지만 ${nm(T.winner)}님이 이겼어요${others.some(x => x.card === m) ? " (마이티에 잡힘)" : ""}. 마이티가 아직 안 나왔으면 조심하세요.` });
  }

  if (lead) {
    // 야당이 주공이 떨어진 무늬로 선을 냄 (기루다가 아직 남아 있을 때)
    if (side[d] === "enemy" && card !== "JK" && card !== m && (!trump || M.suitOf(card) !== trump)) {
      const s = M.suitOf(card);
      if (mem.void_[d].has(s) && mem.trumpsOut > 0) {
        const alt = legal.filter(c => c !== "JK" && c !== m && (!trump || M.suitOf(c) !== trump) && !mem.void_[d].has(M.suitOf(c)));
        if (alt.length) out.push({ kind: "bad", tag: "주공 무늬 선", text: `주공(${nm(d)})은 이미 ${M.SUIT_SYM[s]}가 떨어진 게 드러났어요. 이 무늬로 선을 내면 주공이 기루다로 잘라 먹기 쉬워요. ${ct(alt.sort((a, b) => M.rankOf(a) - M.rankOf(b))[0])} 같은 다른 무늬가 안전해요.` });
      }
    }
    if (won && pts >= 2 && legal.length > 2) out.push({ kind: "good", tag: "좋은 선", text: `선으로 점수 ${pts}장을 가져왔어요.` });
    return out;
  }

  const L = S.trick.leadSuit;
  const myBest = S.trick.cards.reduce((b, x) => Math.max(b, M.powerOf(S, x.card)), -2);
  const curWinner = M.currentWinner(S).who;
  const void_ = !S.hands[p].some(c => M.suitOf(c) === L && c !== "JK" && c !== m);
  const ruffs = trump ? legal.filter(c => M.suitOf(c) === trump && c !== m) : [];
  const wouldWin = c => powerIn(S, T.cards.filter(x => x.p !== p).concat([{ p, card: c }]), c)
    > Math.max(...others.map(x => powerIn(S, T.cards, x.card)));

  // 놓친 자르기: 선 무늬가 없고 기루다가 있었는데, 점수가 걸린 트릭을 상대에게 줌
  if (void_ && !won && ruffs.length && !ruffs.includes(card) && card !== m && card !== "JK" && pts >= 2 && !sameTeam(T.winner, p)) {
    const ok = ruffs.filter(wouldWin).sort((a, b) => M.rankOf(a) - M.rankOf(b));
    if (ok.length) out.push({ kind: "bad", tag: "놓친 자르기", text: `${M.SUIT_SYM[L]}가 없었으니 기루다 ${ct(ok[0])} 카드로 잘랐으면 이 트릭(점수 ${pts}장)을 가져올 수 있었어요.` });
  }
  // 상대 편이 가져간 트릭에 점수 카드를 바침
  if (M.isPoint(card) && card !== m && card !== "JK" && !won && !sameTeam(T.winner, p)) {
    const safe = legal.filter(c => !M.isPoint(c) && c !== m && c !== "JK");
    const tried = M.powerOf(S, card) > myBest;
    if (safe.length && !tried) {
      const hidden = S.friend.type === "card" && !S.friend.revealed && T.winner === S.friend.idx && side[T.winner] !== "enemy";
      const why = side[curWinner] === "ally" && curWinner !== p
        ? `${nm(curWinner)}님이 이기고 있었지만 뒤에 상대가 남아 있었어요. ` : "";
      out.push({ kind: "bad", tag: hidden ? "숨은 프렌드에게 바침" : "점수 바치기",
        text: `${why}${hidden ? `${nm(T.winner)}님은 아직 안 드러난 프렌드(주공 편)였어요. ` : ""}${ct(card)} 대신 ${ct(safe.sort((a, b) => M.rankOf(a) - M.rankOf(b))[0])} 카드를 냈으면 점수를 아낄 수 있었어요.` });
    }
  }
  // 우리 편이 확실히 이기는 트릭에 점수를 안 얹음
  if (!M.isPoint(card) && sameTeam(T.winner, p) && T.winner !== p) {
    const last = S.trick.cards.length === 4;
    const sure = last || [m, "JK"].includes(S.trick.cards.find(x => x.p === curWinner)?.card);
    const give = legal.filter(c => M.isPoint(c) && c !== m && c !== "JK" && M.powerOf(S, c) <= myBest);
    if (side[curWinner] === "ally" && sure && give.length) out.push({ kind: "tip", tag: "점수 안 얹음", text: `우리 편(${nm(curWinner)})이 확실히 이기는 트릭이었어요. ${ct(give[0])} 카드를 얹었으면 점수 1장 더였어요.` });
  }
  // 잘한 수: 잘라서/큰 카드로 점수 2장 이상 가져옴
  if (won && pts >= 2 && (card === "JK" || card === m || (trump && M.suitOf(card) === trump && L !== trump))) {
    out.push({ kind: "good", tag: "좋은 수", text: `${ct(card)} 카드로 점수 ${pts}장을 가져왔어요.` });
  }
  return out;
}

// ---------------------------------------------------------------------
// 2) 시뮬레이션: p가 알 수 있던 정보로 남은 패를 다시 나눔
// ---------------------------------------------------------------------
function sampleWorld(S, p, rand) {
  const W = clone(S);
  const mem = M.memoryOf(S, p);
  const m = M.mightyCard(S);
  const d = S.contract.declarer;
  const played = new Set((S.played || []).map(x => x.card));
  const known = new Set([...S.hands[p], ...played, ...(p === d ? S.discards : [])]);
  const pool = M.fullDeck().filter(c => !known.has(c));
  const slots = [];                                    // 다시 채울 자리: 다른 사람 패 + (내가 주공이 아니면) 버린 3장
  for (let q = 0; q < 5; q++) if (q !== p) slots.push({ q, cap: S.hands[q].length, cards: [] });
  if (p !== d) slots.push({ q: "discard", cap: S.discards.length, cards: [] });
  const f = S.friend;
  const fCard = f.type === "card" && !f.revealed && !S.hands[p].includes(f.card) ? f.card : null;
  const ok = (slot, c) => {
    if (slot.cards.length >= slot.cap) return false;
    if (c === fCard && (slot.q === "discard" || slot.q === d)) return false;
    if (slot.q === "discard" || c === "JK" || c === m) return true;
    return !mem.void_[slot.q].has(M.suitOf(c));
  };
  for (let tries = 0; tries < 30; tries++) {
    slots.forEach(s => (s.cards = []));
    const cards = pool.slice().sort(() => rand() - 0.5)
      .sort((a, b) => slots.filter(s => ok(s, b)).length - slots.filter(s => ok(s, a)).length);   // 들어갈 자리가 적은 카드부터
    let fail = false;
    for (const c of cards) {
      const can = slots.filter(s => ok(s, c));
      if (!can.length) { fail = true; break; }
      can[Math.floor(rand() * can.length)].cards.push(c);
    }
    if (!fail) break;
    if (tries === 29) return null;
  }
  for (const s of slots) {
    if (s.q === "discard") W.discards = s.cards;
    else W.hands[s.q] = s.cards;
  }
  if (fCard) W.friend.idx = W.hands.findIndex(h => h.includes(fCard));
  W.aiSeats = ["mid", "mid", "mid", "mid", "mid"];
  return W;
}
function rollout(W, p, card, opts, rand) {
  try {
    M.applyPlay(W, p, card, opts);
    let g = 0;
    while (W.phase !== "dealEnd" && g++ < 80) M.aiStep(W, M.whoActs(W), rand);
    return W.phase === "dealEnd" ? W.dealResult.delta[p] : null;
  } catch { return null; }
}
function defaultOpts(S, p, card) {
  if (S.trick.cards.length) return {};
  if (card === "JK") {
    const cnt = s => S.hands[p].filter(c => M.suitOf(c) === s).length;
    return { jokerSuit: M.SUITS.slice().sort((a, b) => cnt(b) - cnt(a))[0] };
  }
  if (card === M.callCardOf(S.trump) && !S.hands[p].includes("JK")) return { call: M.teamOf(S, p) !== "gov" };
  return {};
}
export function evalDecision(S, p, chosen, chosenOpts, { K = 24, seed = 1 } = {}) {
  const legal = M.legalPlays(S, p);
  const rand = rng(seed);
  const worlds = [];
  for (let k = 0; k < K; k++) { const w = sampleWorld(S, p, rand); if (w) worlds.push(w); }
  if (!worlds.length) return null;
  const ev = {}, vals = {};
  for (const c of legal) {
    let sum = 0, n = 0;
    vals[c] = worlds.map((w, k) => {
      const v = rollout(clone(w), p, c, c === chosen ? chosenOpts : defaultOpts(S, p, c), rng(seed * 997 + k));
      if (v != null) { sum += v; n++; }
      return v;
    });
    if (n) ev[c] = sum / n;
  }
  // 같은 패 묶음에서의 차이(짝 비교)와 그 흔들림 — 우연한 차이를 걸러냄
  ev.__diff = (a, b) => {
    const d = vals[a].map((v, k) => (v != null && vals[b][k] != null ? v - vals[b][k] : null)).filter(x => x != null);
    if (d.length < 4) return { mean: 0, se: 99 };
    const mean = d.reduce((x, y) => x + y, 0) / d.length;
    const sd = Math.sqrt(d.reduce((x, y) => x + (y - mean) ** 2, 0) / (d.length - 1));
    return { mean, se: sd / Math.sqrt(d.length) };
  };
  return ev;
}

// ---------------------------------------------------------------------
// 기보 한 판 분석 → 수마다 지적
// opts: { sims(bool), K, who(사람 자리 목록), onProgress(done,total) }
// 반환: { notes: [{ step, p, kind: bad|good|tip, tag, text, ev? }], steps }
// ---------------------------------------------------------------------
export async function analyzeReplay(r, { sims = true, K = 24, onProgress, yieldEvery = 1 } = {}) {
  const { steps, final } = rebuild(r);
  const humans = r.players.map((x, i) => (!x.ai ? i : -1)).filter(i => i >= 0);
  const notes = [];
  const jobs = [];
  for (let i = 1; i < steps.length; i++) {
    const s = steps[i];
    if (s.kind !== "play" || !humans.includes(s.p)) continue;
    const S = steps[i - 1].st;
    const T = final.tricks.find(t => t.trickNo === s.tn);
    const legal = M.legalPlays(S, s.p);
    for (const n of patternNotes(S, s.p, s.card, T, legal)) notes.push({ step: i, p: s.p, ...n });
    if (sims && legal.length > 1) jobs.push({ i, S, s });
  }
  let done = 0;
  for (const { i, S, s } of jobs) {
    const rec = r.plays.find((x, k) => k === i - (steps.length - r.plays.length));
    const chosenOpts = rec ? { jokerSuit: rec[2] || undefined, call: !!rec[3] } : {};
    const ev = evalDecision(S, s.p, s.card, chosenOpts, { K, seed: i * 31 + 7 });
    if (ev && ev[s.card] != null) {
      const diffOf = ev.__diff; delete ev.__diff;
      const ranked = Object.entries(ev).sort((a, b) => b[1] - a[1]);
      const [bestC, bestV] = ranked[0];
      const mine = ev[s.card];
      const mineNotes = notes.filter(n => n.step === i);
      const sig = (a, b) => { const x = diffOf(a, b); return x.mean >= 1 && x.mean >= 2.2 * x.se; };
      if (bestC !== s.card && sig(bestC, s.card)) {
        notes.push({ step: i, p: s.p, kind: "bad", tag: "계산", ev,
          text: `컴퓨터 계산으로는 ${ct(bestC)} 카드를 냈으면 기대 점수가 ${(bestV - mine).toFixed(1)}점 더 높았어요 (낸 카드 ${fmt(mine)}점 → ${ct(bestC)} ${fmt(bestV)}점).` });
      } else {
        // 계산상 큰 차이가 없으면 패턴 지적은 "참고"로 낮춤
        for (const n of mineNotes) if (n.kind === "bad" && bestV - mine < 0.3) { n.kind = "tip"; n.text += " (이 판에서는 계산상 큰 차이가 없었어요)"; }
        const second = ranked.find(([c]) => c !== s.card);
        if (bestC === s.card && second && sig(s.card, second[0]) && !mineNotes.some(n => n.kind === "good")) {
          notes.push({ step: i, p: s.p, kind: "good", tag: "계산", ev, text: `좋은 선택이에요. 다른 카드보다 기대 점수가 ${(mine - second[1]).toFixed(1)}점 높았어요.` });
        }
      }
      for (const n of notes) if (n.step === i && !n.ev) n.ev = ev;
    }
    done++;
    onProgress?.(done, jobs.length);
    if (yieldEvery && done % yieldEvery === 0) await new Promise(res => setTimeout(res, 0));
  }
  notes.sort((a, b) => a.step - b.step);
  return { notes, steps };
}
const fmt = v => (v >= 0 ? "+" : "") + v.toFixed(1);

// 사람별 통계용: 패턴 검사만 빠르게
export async function patternStats(replays) {
  const by = {};
  for (const r of replays) {
    let res;
    try { res = await analyzeReplay(r, { sims: false, yieldEvery: 0 }); } catch { continue; }
    r.players.forEach((pl, i) => {
      if (pl.ai) return;
      const k = pl.name;
      by[k] ||= { name: k, deals: 0, tags: {}, good: 0 };
      by[k].deals++;
      for (const n of res.notes) if (n.p === i) {
        if (n.kind === "good") by[k].good++;
        else by[k].tags[n.tag] = (by[k].tags[n.tag] || 0) + 1;
      }
    });
  }
  return Object.values(by).sort((a, b) => b.deals - a.deals);
}
