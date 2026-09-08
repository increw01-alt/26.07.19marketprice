(() => {
  "use strict";

  const script = document.currentScript;
  if (!script || document.querySelector("[data-kgc-popup]")) return;

  const baseUrl = new URL(".", script.src || document.baseURI);
  const asset = (path) => new URL(path, baseUrl).href;
  const storageKey = script.dataset.storageKey || "kgc-popup-hidden-until";
  const delay = Math.max(0, Number(script.dataset.delay || 650));
  const hideHours = Math.max(1, Number(script.dataset.hours || 24));
  const href = script.dataset.href ||
    "https://koreagiftcard.channel.io/home?page=%ED%99%88%ED%8E%98%EC%9D%B4%EC%A7%80%ED%8C%9D%EC%97%85";

  const hiddenUntil = (() => {
    try { return Number(localStorage.getItem(storageKey) || 0); }
    catch { return 0; }
  })();

  if (hiddenUntil > Date.now()) return;

  const popup = document.createElement("aside");
  popup.className = "kgc-popup";
  popup.dataset.kgcPopup = "";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "한국상품권협회 상담 안내");
  popup.setAttribute("aria-modal", "false");
  popup.innerHTML = `
    <div class="kgc-popup__box">
      <div class="kgc-popup__bg" aria-hidden="true"></div>
      <div class="kgc-popup__noise" aria-hidden="true"></div>
      <div class="kgc-popup__frame" aria-hidden="true"></div>
      <div class="kgc-popup__controls">
        <button class="kgc-popup__today" type="button">오늘 하루 보지 않기</button>
        <button class="kgc-popup__close" type="button" aria-label="팝업 닫기"></button>
      </div>
      <img class="kgc-popup__logo" src="${asset("assets/association-logo.png")}" alt="한국상품권협회">
      <span class="kgc-popup__dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <div class="kgc-popup__copy">
        <p class="kgc-popup__headline">
          상품권 <span class="kgc-popup__gold">구입</span>부터<br>
          <span class="kgc-popup__gold">판매</span>까지, <span class="kgc-popup__gradient">한 번에.</span>
        </p>
        <p class="kgc-popup__subcopy">
          전문 매니저 1:1 맞춤 상담<br>
          구입 + 판매 = <strong>안전한 현금화</strong>
        </p>
      </div>
      <div class="kgc-popup__phone" aria-hidden="true">
        <img src="${asset("assets/popup-card.png")}" alt="">
      </div>
      <div class="kgc-popup__chips">
        <span class="kgc-popup__chips-label">거래 방식</span>
        <div class="kgc-popup__chips-row">
          <span class="kgc-popup__chip">신용카드</span>
          <span class="kgc-popup__chip">휴대폰결제</span>
          <span class="kgc-popup__chip">할인판매</span>
          <span class="kgc-popup__chip">할부구매</span>
        </div>
      </div>
      <a class="kgc-popup__cta" href="${href}" target="_blank" rel="noopener noreferrer">
        <span>지금 채널톡 문의하기</span>
        <span class="kgc-popup__cta-arrow" aria-hidden="true">→</span>
      </a>
    </div>`;

  document.body.appendChild(popup);

  let removed = false;
  const close = () => {
    if (removed) return;
    removed = true;
    popup.classList.remove("is-visible");
    popup.classList.add("is-closing");
    popup.addEventListener("animationend", () => popup.remove(), { once: true });
    window.setTimeout(() => popup.remove(), 350);
  };

  popup.querySelector(".kgc-popup__close").addEventListener("click", close);
  popup.querySelector(".kgc-popup__today").addEventListener("click", () => {
    try { localStorage.setItem(storageKey, String(Date.now() + hideHours * 60 * 60 * 1000)); }
    catch { /* Storage may be disabled; closing still works. */ }
    close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && popup.isConnected) close();
  });

  window.setTimeout(() => popup.classList.add("is-visible"), delay);
})();
