// 👀 관전자 해설 — 모두가 본 카드만 근거로 한 실시간 해설 (앉은 사람에게는 보이지 않음)
import * as M from "./mighty.js";

const ct = M.cardText;

// 이전 상태(prev)와 지금 상태(st)를 비교해 새로 생긴 해설 문장들
export function commentary(prev, st) {
  const out = [];
  if (!st) return out;
  const nm = p => st.players[p].name;
  const sameDeal = prev && prev.seed === st.seed && prev.dealNo === st.dealNo;
  if (!sameDeal) {
    if (st.phase === "bid") out.push(`🃏 ${st.dealNo}판째 시작 · 공약을 부르는 중`);
    prev = null;
  }
  // 공약이 정해짐
  if (st.contract && !prev?.contract) {
    out.push(`👑 ${nm(st.contract.declarer)}님이 주공 · ${M.bidText(st.contract)}`);
  }
  if (st.contract && prev?.contract && prev.contract.suit !== st.contract.suit) {
    out.push(`🔄 기루다를 바꿨어요 → ${M.bidText(st.contract)} (공약 +2장)`);
  }
  if (st.friend && !prev?.friend) {
    const f = st.friend;
    out.push(f.type === "none" ? "🙅 노프렌드! 주공 혼자 (점수 2배)"
      : f.type === "first" ? "🤝 프렌드는 첫 트릭을 이긴 사람 (초구)"
        : f.type === "player" ? `🤝 프렌드는 ${nm(f.idx)}님`
          : `🤝 프렌드는 ${ct(f.card)}를 가진 사람 — 아직 누군지 몰라요`);
    if (st.trump) out.push(`ℹ️ 마이티 ${ct(M.mightyCard(st))} · 조커 콜 카드 ${ct(M.callCardOf(st.trump))}`);
  }
  // 새로 나온 카드
  const old = prev?.played?.length || 0;
  const played = st.played || [];
  const m = st.trump ? M.mightyCard(st) : null;
  const trump = st.trump && st.trump !== "N" ? st.trump : null;
  for (const x of played.slice(old)) {
    const who = nm(x.p);
    if (x.pos === 0) {
      if (x.card === "JK") out.push(`🃏 ${who}: 조커로 선! ${M.SUIT_SYM[x.js] || ""}를 내라`);
      else if (x.call) out.push(`📣 ${who}: ${ct(x.card)}로 조커 콜! 조커를 가진 사람은 조커를 내야 해요`);
      else if (trump && M.suitOf(x.card) === trump && x.card !== m) out.push(`${who}: 기루다 ${ct(x.card)}로 선 — 기루다를 빼려는 수`);
      continue;
    }
    if (x.card === m) { out.push(`💥 ${who}: 마이티 ${ct(x.card)}!`); continue; }
    if (x.card === "JK") { out.push(`🃏 ${who}: 조커`); continue; }
    if (x.lead && M.suitOf(x.card) !== x.lead) {
      if (trump && M.suitOf(x.card) === trump) out.push(`✂️ ${who}: ${M.SUIT_SYM[x.lead]}가 없어서 기루다 ${ct(x.card)}로 잘랐어요`);
      else out.push(`${who}: ${M.SUIT_SYM[x.lead]}가 떨어졌어요 (${ct(x.card)}를 버림)`);
    }
  }
  // 프렌드가 드러남
  if (st.friend?.revealed && prev?.friend && !prev.friend.revealed && st.friend.idx != null && st.friend.idx >= 0) {
    out.push(`🤝 ${nm(st.friend.idx)}님이 프렌드로 드러났어요!`);
  }
  // 트릭이 끝남
  const tOld = prev?.tricks?.length || 0;
  for (const t of (st.tricks || []).slice(tOld)) {
    const pts = t.cards.filter(x => M.isPoint(x.card)).length;
    const d = st.contract.declarer, f = st.friend;
    const fk = f && f.revealed && f.idx != null && f.idx >= 0;
    const gov = st.taken[d].length + (fk ? st.taken[f.idx].length : 0);
    const left = st.contract.n - gov;
    let line = `🏁 ${t.trickNo}트릭: ${nm(t.winner)}님 승` + (pts ? ` (점수 ${pts}장)` : "");
    line += ` · 주공 편 ${gov}장` + (fk || f?.type === "none" ? "" : "+프렌드") + (left > 0 ? ` / 공약까지 ${left}장` : " · 공약 달성!");
    out.push(line);
    if (trump) {
      const seen = new Set(played.filter(x => x.trickNo <= t.trickNo).map(x => x.card));
      const left = M.fullDeck().filter(c => M.suitOf(c) === trump && c !== m && !seen.has(c)).length;
      out.push(`ℹ️ 아직 안 나온 기루다 ${left}장 · 마이티 ${seen.has(m) ? "나옴" : "안 나옴"} · 조커 ${seen.has("JK") ? "나옴" : "안 나옴"}`);
    }
  }
  if (st.phase === "dealEnd" && prev?.phase !== "dealEnd" && st.dealResult) {
    const r = st.dealResult;
    out.push(`${r.win ? "🎉 주공 편 승리" : "🛡️ 야당 승리"} · 주공 편 ${r.got}장 / 공약 ${st.contract.n}장 — '이 판 복기 보기'로 다섯 명 패와 해설을 볼 수 있어요`);
  }
  return out;
}
