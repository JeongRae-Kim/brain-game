// 💬 카카오톡 초대장 — 카카오 JavaScript SDK의 카톡 공유(기본 텍스트 템플릿)
// 카카오를 못 쓰면(키·도메인 문제, PC에 카톡 없음 등) 휴대폰 공유 창 → 링크 복사 순서로 대신함
const KAKAO_JS_KEY = "44cfdda0eaeb2672072da3c52b4098c0";   // 웹페이지에 공개되는 키 (등록된 도메인에서만 동작)
const SDK = "https://t1.kakaocdn.net/kakao_js_sdk/2.8.2/kakao.min.js";
const SDK_SRI = "sha384-zt/G7/KfaRQ9dT/QIkS0ujMtzouJqzuSJcXVQu50x0rl/+mD1dc70AeOejVbMD9E";

let loading = null;
export function loadKakao() {
  if (window.Kakao?.isInitialized?.()) return Promise.resolve(true);
  if (loading) return loading;
  loading = new Promise(resolve => {
    const s = document.createElement("script");
    s.src = SDK; s.integrity = SDK_SRI; s.crossOrigin = "anonymous"; s.async = true;
    s.onload = () => {
      try { if (!window.Kakao.isInitialized()) window.Kakao.init(KAKAO_JS_KEY); resolve(true); }
      catch { resolve(false); }
    };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
  return loading;
}

// 초대 링크 만들기 (go=mighty 이면 바로 마이티 탁자로)
export function inviteUrl(room, go) {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set("room", room);
  if (go) u.searchParams.set("go", go);
  return u.toString();
}

// text: 카톡에 보일 글, url: 버튼 링크, button: 버튼 글자
export async function sendInvite({ text, url, button = "들어가기", toast }) {
  // 클릭 직후에 바로 보내야 팝업이 막히지 않으므로, SDK는 미리 불러 둠(loadKakao)
  if (window.Kakao?.isInitialized?.()) {
    try {
      window.Kakao.Share.sendDefault({
        objectType: "text",
        text: text.slice(0, 200),
        link: { mobileWebUrl: url, webUrl: url },
        buttonTitle: button.slice(0, 14)
      });
      return true;
    } catch (e) { console.warn("카톡 공유 실패", e); }
  }
  try {
    if (navigator.share) { await navigator.share({ title: "가족 두뇌게임", text, url }); return true; }
  } catch { return false; /* 취소 */ }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast?.("초대 글과 링크를 복사했어요. 카톡에 붙여 넣으세요"); }
  catch { prompt("이 링크를 복사하세요", url); }
  return true;
}
