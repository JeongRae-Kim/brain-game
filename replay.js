// 📜 마이티 복기 — 판이 끝나면 기보를 조용히 저장하고, 관리자만 다시 보며 기보를 글로 복사
// 저장 위치: replays/{방}/{push} (보안 규칙으로 관리자만 읽기, 새로 쓰기만 허용)
import * as M from "./mighty.js";
import { el } from "./ui-mighty.js";

const KEEP = 200;            // 방마다 최근 몇 판까지 남길지
let D = null;                // deps: { db, ref, push, get, set, ROOM, uid(), myName(), toast, show, onBack }
const saved = new Set();     // 같은 판 두 번 저장 방지

export function initReplay(deps) { D = deps; }

// ---------- 저장 ----------
function friendSpec(st) {
  const f = st.friend || {};
  if (f.type === "card") return { type: "card", card: f.card };
  if (f.type === "player") return { type: "player", player: f.idx };
  return { type: f.type || "none" };
}
export function buildReplay(st, mode) {
  return {
    v: 1, at: Date.now(), mode, room: D?.ROOM || "", seed: st.seed, dealNo: st.dealNo, dealer: st.dealer,
    // 연습판의 "나"는 실제 기기 아이디로 바꿔 저장 (복기에서 내 자리를 알아보게)
    players: st.players.map(p => ({ id: p.id === "me" && D?.uid ? D.uid() : String(p.id), name: p.name, ai: !!p.ai })),
    opts: { mightyFixed: !!st.opts?.mightyFixed, aiLevel: st.opts?.aiLevel || "mid" },
    hands0: st.hands0, kitty0: st.kitty0, bids: st.bidLog || [], kitty: st.kittyLog,
    friend: friendSpec(st),
    plays: (st.played || []).map(x => [x.p, x.card, x.js || 0, x.call ? 1 : 0]),
    result: { win: st.dealResult.win, got: st.dealResult.got, V: st.dealResult.V, delta: st.dealResult.delta },
    scoresAfter: st.scores.slice()
  };
}
export function saveReplay(st, mode) {
  if (!D || st.phase !== "dealEnd" || !st.hands0 || !st.dealResult) return;
  const key = `${st.seed}-${st.dealNo}`;
  if (saved.has(key)) return;
  saved.add(key);
  const r = buildReplay(st, mode);
  const c = st.contract;
  D.push(D.ref(D.db, `replays/${D.ROOM}`), {
    v: 1, at: r.at, mode,
    names: r.players.map(p => p.name).join(","),
    ids: r.players.filter(p => !p.ai).map(p => p.id).join(","),
    sum: `${st.players[c.declarer].name} ${M.bidText(c)} · ${r.result.win ? "주공 승" : "야당 승"}`,
    json: JSON.stringify(r)
  }).catch(() => { /* 규칙을 아직 안 붙였으면 조용히 넘어감 */ });
}

// ---------- 다시 만들기 ----------
export function rebuild(r) {
  const players = r.players.map(p => ({ ...p }));
  const st = M.newMatch({ players, seed: r.seed, length: { deals: 99 }, opts: { ...r.opts } });
  Object.assign(st, {
    dealNo: r.dealNo, dealer: r.dealer, hands: r.hands0.map(h => h.slice()), kitty: r.kitty0.slice(),
    bids: new Array(5).fill(null), turn: (r.dealer + 1) % 5, phase: "bid", played: [], tricks: [], log: [],
    scores: r.scoresAfter.map((s, i) => s - r.result.delta[i])
  });
  const nm = p => st.players[p].name;
  const steps = [{ st: structuredClone(st), text: "패를 나눴어요" }];
  for (const b of r.bids) {
    M.applyBid(st, b.p, b.a);
    steps.push({ st: structuredClone(st), text: `${nm(b.p)}: ${b.a === "pass" ? "패스" : M.bidText(b.a)}`, kind: "bid" });
  }
  const d = st.contract.declarer;
  if (r.kitty) {
    M.applyKitty(st, d, r.kitty);
    steps.push({ st: structuredClone(st), text: `${nm(d)} 주공: ${r.kitty.discards.map(M.cardText).join(" ")} 버림`
      + (r.kitty.newTrump ? ` · 기루다 변경 → ${M.bidText(st.contract)}` : ""), kind: "kitty" });
  }
  M.applyFriend(st, d, r.friend);
  steps.push({ st: structuredClone(st), text: `프렌드: ${friendText(st)}`, kind: "friend" });
  for (const [p, card, js, call] of r.plays) {
    const tn = st.trickNo;
    M.applyPlay(st, p, card, { jokerSuit: js || undefined, call: !!call });
    const done = st.tricks.length && st.tricks.at(-1).trickNo === tn && (st.trickNo !== tn || st.phase === "dealEnd");
    steps.push({ st: structuredClone(st), text: `${tn}트릭 · ${nm(p)}: ${M.cardText(card)}${js ? ` (${M.SUIT_SYM[js]} 내라)` : ""}${call ? " 조커 콜!" : ""}`,
      kind: "play", p, card, tn, trickEnd: done });
  }
  return { steps, final: st };
}
function friendText(st) {
  const f = st.friend;
  if (!f) return "";
  if (f.type === "none") return "노프렌드";
  if (f.type === "first") return "초구 프렌드";
  if (f.type === "player") return st.players[f.idx].name;
  return `${M.cardText(f.card)} 가진 사람` + (f.idx != null && f.idx >= 0 ? ` (= ${st.players[f.idx].name})` : "");
}

// ---------- 기보 글 ----------
const fmtDate = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
function sortCards(h, trump) {
  const order = { S: 0, D: 1, H: 2, C: 3, J: -1 };
  return h.slice().sort((a, b) => ((order[M.suitOf(a)] - order[M.suitOf(b)]) || (M.rankOf(b) - M.rankOf(a))));
}
export function kifuText(r, me) {
  const { steps, final: st } = rebuild(r);
  const nm = p => st.players[p].name + (me && st.players[p].id === me ? "(나)" : "");
  const L = [];
  L.push(`[마이티 기보] ${fmtDate(r.at)} · 방 ${r.room} · ${r.mode === "practice" ? "연습판" : "탁자"} · ${r.dealNo}판째`);
  L.push(`규칙: 마이티 ${r.opts.mightyFixed ? "항상 ♠A" : "♠A (♠기루다면 ◆A)"} · 컴퓨터 ${M.AI_LEVELS[r.opts.aiLevel] || ""}`);
  L.push(`자리: ${st.players.map((p, i) => `${i + 1}.${nm(i)}`).join(" / ")}  (선: ${nm((r.dealer + 1) % 5)})`);
  L.push("", "처음 패:");
  r.hands0.forEach((h, i) => L.push(`  ${nm(i)}: ${sortCards(h).map(M.cardText).join(" ")}`));
  L.push(`  남은 3장: ${r.kitty0.map(M.cardText).join(" ")}`);
  L.push("", "공약: " + r.bids.map(b => `${nm(b.p)} ${b.a === "pass" ? "패스" : M.bidText(b.a)}`).join(" → "));
  const c = st.contract;
  L.push(`주공: ${nm(c.declarer)} · 최종 ${M.bidText(c)}` + (r.kitty?.newTrump ? " (기루다 변경 +2)" : ""));
  if (r.kitty) L.push(`버린 3장: ${r.kitty.discards.map(M.cardText).join(" ")}`);
  L.push(`프렌드: ${friendText(st)} · 마이티 ${M.cardText(M.mightyCard(st))} · 조커 콜 카드 ${M.cardText(M.callCardOf(st.trump))}`);
  L.push("", "트릭:");
  for (const t of st.tricks) {
    const pts = t.cards.filter(x => M.isPoint(x.card)).length;
    L.push(`  ${t.trickNo}) ` + t.cards.map(x => `${nm(x.p)} ${M.cardText(x.card)}`).join(" → ") + `  ⇒ ${nm(t.winner)} 승` + (pts ? ` (점수 ${pts}장)` : ""));
  }
  const res = r.result;
  L.push("", `결과: 주공 편 ${res.got}장 / 공약 ${c.n}장 → ${res.win ? "주공 승리" : "야당 승리"} (기본 점수 ${res.V})`);
  L.push("점수: " + st.players.map((p, i) => `${nm(i)} ${res.delta[i] >= 0 ? "+" : ""}${res.delta[i]}`).join(", "));
  return L.join("\n");
}

// ---------- 화면: 목록 ----------
export async function openReplayList(view) {
  view.textContent = "";
  const card = el("div", "card");
  card.appendChild(el("h2", null, "📜 마이티 복기 (관리자)"));
  card.appendChild(el("p", "note", "판이 끝나면 자동으로 저장돼요. 다섯 명 패를 모두 펼쳐 한 수씩 다시 볼 수 있어요."));
  const onlyMine = el("label", "rp-mine");
  const cb = el("input"); cb.type = "checkbox"; cb.checked = true;
  onlyMine.append(cb, el("span", null, " 내가 참여한 판만"));
  card.appendChild(onlyMine);
  const list = el("ol", "rp-list");
  card.appendChild(list);
  const back = el("button", "btn", "대기실로");
  back.addEventListener("click", () => D.onBack());
  view.append(card, back);
  list.appendChild(el("li", "note", "불러오는 중…"));
  let rows = [];
  try {
    const snap = await D.get(D.ref(D.db, `replays/${D.ROOM}`));
    const v = snap.val() || {};
    rows = Object.entries(v).map(([k, x]) => ({ k, ...x })).sort((a, b) => b.at - a.at);
    // 오래된 기보 정리
    for (const old of rows.slice(KEEP)) D.set(D.ref(D.db, `replays/${D.ROOM}/${old.k}`), null).catch(() => {});
    rows = rows.slice(0, KEEP);
  } catch {
    list.textContent = "";
    list.appendChild(el("li", "note", "불러오지 못했어요. 관리 코드와 보안 규칙을 확인해 주세요."));
    return;
  }
  const me = D.uid(), myName = D.myName();
  const mine = r => (r.ids || "").split(",").includes(me) || (r.names || "").split(",").includes(myName);
  const draw = () => {
    list.textContent = "";
    const shown = rows.filter(r => !cb.checked || mine(r));
    if (!shown.length) { list.appendChild(el("li", "note", cb.checked ? "내가 참여한 판이 아직 없어요" : "저장된 판이 아직 없어요")); return; }
    for (const r of shown) {
      const li = el("li", "rp-item");
      li.appendChild(el("b", null, `${fmtDate(r.at).slice(5)} · ${r.mode === "practice" ? "연습" : "탁자"}`));
      li.appendChild(el("span", null, r.sum || ""));
      li.appendChild(el("small", null, (r.names || "").split(",").join(", ")));
      li.addEventListener("click", () => {
        try { openReplay(view, JSON.parse(r.json)); } catch (e) { D.toast("이 기보는 열 수 없어요"); console.error(e); }
      });
      list.appendChild(li);
    }
  };
  cb.addEventListener("change", draw);
  draw();
}

// ---------- 화면: 복기 ----------
export function openReplay(view, r) {
  const { steps } = rebuild(r);
  const me = D.uid();
  let i = 0;
  const root = el("div", "rp");
  view.textContent = "";
  view.appendChild(root);
  const go = n => { i = Math.max(0, Math.min(steps.length - 1, n)); draw(); };
  const trickStart = dir => {
    // 다음/이전 트릭의 끝으로 이동
    let n = i + dir;
    while (n > 0 && n < steps.length - 1 && !steps[n].trickEnd && steps[n].kind === "play") n += dir;
    go(n);
  };

  function draw() {
    const s = steps[i], st = s.st;
    root.textContent = "";
    const top = el("div", "rp-top");
    top.appendChild(el("b", null, `${i}/${steps.length - 1}`));
    top.appendChild(el("span", "rp-now", s.text));
    root.appendChild(top);
    const ctl = el("div", "rp-ctl");
    for (const [label, fn] of [["⏮", () => trickStart(-1)], ["◀", () => go(i - 1)], ["▶", () => go(i + 1)], ["⏭", () => trickStart(1)]]) {
      const b = el("button", "btn", label); b.addEventListener("click", fn); ctl.appendChild(b);
    }
    root.appendChild(ctl);
    // 정보
    const info = el("div", "mt-info");
    if (st.contract) {
      info.appendChild(el("span", "trump-chip" + (st.contract.suit === "D" || st.contract.suit === "H" ? " red" : ""),
        st.contract.suit === "N" ? "노기루다" : `기루다 ${M.SUIT_SYM[st.contract.suit]}`));
      info.appendChild(el("span", null, `공약 ${st.contract.n}장 (주공 ${st.players[st.contract.declarer].name})`));
      if (st.friend) info.appendChild(el("span", null, `프렌드 ${friendText(st)}`));
      info.appendChild(el("span", null, `마이티 ${M.cardText(M.mightyCard(st))} · 콜 ${M.cardText(M.callCardOf(st.trump))}`));
    } else info.appendChild(el("span", null, "공약 중"));
    root.appendChild(info);
    // 지금 트릭
    if (st.phase === "play" || st.phase === "dealEnd") {
      const t = s.trickEnd ? st.tricks.at(-1) : st.trick;
      const box = el("div", "mt-center");
      if (t?.cards?.length) {
        if (s.trickEnd) box.appendChild(el("div", "mt-win", `${st.players[t.winner].name} 승!`));
        const row = el("div", "mt-trick");
        for (const x of t.cards) {
          const w = el("div", "mt-played" + (s.trickEnd && x.p === t.winner ? " win" : ""));
          w.appendChild(cardChip(x.card, x.p === s.p && x.card === s.card));
          w.appendChild(el("small", null, st.players[x.p].name));
          row.appendChild(w);
        }
        box.appendChild(row);
      }
      if (st.contract) {
        const d = st.contract.declarer, f = st.friend;
        const fk = f && f.idx != null && f.idx >= 0;
        const gov = st.taken[d].length + (fk ? st.taken[f.idx].length : 0);
        const all = st.taken.reduce((a, x) => a + x.length, 0);
        box.appendChild(el("div", "rp-tally", `주공 편 ${gov}장 · 상대 편 ${all - gov}장`));
      }
      root.appendChild(box);
    }
    // 다섯 명 패
    const seats = el("div", "rp-hands");
    st.players.forEach((p, q) => {
      const d = st.contract?.declarer, f = st.friend;
      const role = q === d ? "👑 " : f && f.idx === q ? "🤝 " : "";
      const row = el("div", "rp-hand" + (q === s.p ? " act" : "") + (p.id === me ? " me" : ""));
      const head = el("div", "rp-name");
      head.appendChild(el("b", null, `${role}${p.name}${p.id === me ? " (나)" : ""}`));
      if (st.taken) head.appendChild(el("small", null, ` 점수 ${st.taken[q].length}장`));
      if (st.phase === "bid" || s.kind === "bid") { const b = st.bids?.[q]; if (b) head.appendChild(el("small", null, ` · ${b === "pass" ? "패스" : M.bidText(b)}`)); }
      row.appendChild(head);
      const cards = el("div", "rp-cards");
      for (const c of sortCards(st.hands[q])) cards.appendChild(cardChip(c));
      row.appendChild(cards);
      seats.appendChild(row);
    });
    root.appendChild(seats);
    // 기억 정보
    if (st.phase === "play" || st.phase === "dealEnd") root.appendChild(memoryBox(st));
    if (i === steps.length - 1) {
      const res = r.result;
      root.appendChild(el("p", "mt-status", `${res.win ? "🎉 주공 승리" : "🛡️ 야당 승리"} · 주공 편 ${res.got}장 · `
        + st.players.map((p, q) => `${p.name} ${res.delta[q] >= 0 ? "+" : ""}${res.delta[q]}`).join(", ")));
    }
    // 아래 버튼
    const bottom = el("div", "row");
    const copy = el("button", "btn primary", "📋 기보 복사");
    copy.addEventListener("click", async () => {
      const text = kifuText(r, me);
      try { await navigator.clipboard.writeText(text); D.toast("기보를 복사했어요. Claude 채팅에 붙여 넣으면 해설해 드려요"); }
      catch { showText(text); }
    });
    const list = el("button", "btn", "목록으로");
    list.addEventListener("click", () => openReplayList(view));
    bottom.append(copy, list);
    root.appendChild(bottom);
  }
  function showText(text) {
    const ta = el("textarea", "rp-text"); ta.value = text; ta.readOnly = true;
    root.appendChild(el("p", "note", "아래 글을 길게 눌러 전체 선택 후 복사하세요"));
    root.appendChild(ta); ta.focus(); ta.select();
  }
  draw();
}

function cardChip(c, hot = false) {
  const red = c !== "JK" && (c[0] === "H" || c[0] === "D");
  const b = el("span", "mc small" + (red ? " red" : "") + (hot ? " picked" : ""));
  if (c === "JK") b.textContent = "🃏";
  else { b.appendChild(el("span", "r", M.RANK_TXT[M.rankOf(c)] || M.rankOf(c))); b.appendChild(el("span", "s", M.SUIT_SYM[M.suitOf(c)])); }
  return b;
}

// 그 시점까지 나온 카드로 본 정보 (모두가 알 수 있는 것)
function memoryBox(st) {
  const box = el("div", "rp-mem");
  const played = st.played || [];
  const m = M.mightyCard(st), callC = M.callCardOf(st.trump);
  const out = new Set(played.map(x => x.card));
  const trump = st.trump !== "N" ? st.trump : null;
  const lines = [];
  lines.push(`마이티 ${out.has(m) ? "나옴" : "안 나옴"} · 조커 ${out.has("JK") ? "나옴" : "안 나옴"} · 콜 카드 ${out.has(callC) ? "나옴" : "안 나옴"}`);
  if (trump) {
    const left = 13 - [...out].filter(c => c !== m && c !== "JK" && M.suitOf(c) === trump).length - (M.suitOf(m) === trump ? 1 : 0);
    lines.push(`기루다(${M.SUIT_SYM[trump]}) 남은 수: ${left}장 (버린 3장 포함)`);
  }
  for (const s of M.SUITS) {
    const cs = played.filter(x => M.suitOf(x.card) === s).map(x => x.card).sort((a, b) => M.rankOf(b) - M.rankOf(a));
    if (cs.length) lines.push(`나온 ${M.SUIT_SYM[s]}: ${cs.map(c => M.RANK_TXT[M.rankOf(c)] || M.rankOf(c)).join(" ")}`);
  }
  const voids = st.players.map((p, q) => {
    const v = new Set();
    for (const x of played) if (x.p === q && x.pos > 0 && x.lead && x.card !== "JK" && x.card !== m && M.suitOf(x.card) !== x.lead) v.add(x.lead);
    return v.size ? `${p.name} ${[...v].map(s => M.SUIT_SYM[s]).join("")}` : null;
  }).filter(Boolean);
  lines.push("떨어진 무늬: " + (voids.length ? voids.join(", ") : "아직 없음"));
  for (const t of lines) box.appendChild(el("div", null, t));
  return box;
}
