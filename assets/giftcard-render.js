// 상품권 페이지 공용 렌더러 — 빌드 프리렌더(build-static.mjs)와 브라우저(pages.js)가 같은 코드를 씁니다.
// site-config.js / home-render.js 와 같은 UMD 패턴.
(function initGiftRender(root) {
  'use strict';

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  const won = (n) => Number(n).toLocaleString('ko-KR');
  const faceLabel = (n) => (n >= 10000 ? `${n / 10000}만원권` : `${won(n)}원권`);
  const safeHref = (u) => {
    try {
      const x = new URL(String(u));
      return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
    } catch {
      return null;
    }
  };

  // 표 열 순서 — 데이터에 있는 종류만 노출하고, 목록 밖 종류는 뒤에 붙입니다.
  const CARD_ORDER = ['신세계', '롯데', '현대', '갤러리아', 'AK', '국민관광', '백화점 공통'];

  /**
   * 거래소 × 상품권 종류 매트릭스 (선택 액면가).
   * 셀 = 살 때(거래소 판매가, 열 최저 강조) / 팔 때(거래소 매입가, 열 최고 강조).
   * 같은 업체에 이체·현금 등 여러 값이 있으면 손님에게 유리한 쪽을 씁니다.
   */
  function deptMatrix(items, shops, face) {
    const rows = (items || []).filter((i) => Number(i.face) === Number(face));
    const cards = CARD_ORDER.filter((c) => rows.some((i) => i.card === c));
    for (const c of [...new Set(rows.map((i) => i.card))]) if (!cards.includes(c)) cards.push(c);
    if (!cards.length) return '<!-- 거래소 매트릭스: 해당 액면가 데이터 없음 -->';

    const cell = {};
    for (const i of rows) {
      const byCard = (cell[i.shopId] ??= {});
      const e = (byCard[i.card] ??= { buy: null, sell: null });
      if (Number.isFinite(i.buy) && (e.buy == null || i.buy > e.buy)) e.buy = i.buy;
      if (Number.isFinite(i.sell) && (e.sell == null || i.sell < e.sell)) e.sell = i.sell;
    }
    const shopList = (shops || []).filter((s) => s.ok && cell[s.id]);
    if (!shopList.length) return '<!-- 거래소 매트릭스: 업체 데이터 없음 -->';

    const best = {};
    for (const c of cards) {
      let bb = null;
      let bs = null;
      for (const s of shopList) {
        const e = cell[s.id]?.[c];
        if (!e) continue;
        if (e.buy != null && (bb == null || e.buy > bb)) bb = e.buy;
        if (e.sell != null && (bs == null || e.sell < bs)) bs = e.sell;
      }
      best[c] = { buy: bb, sell: bs };
    }
    const coverage = (s) => cards.filter((c) => cell[s.id]?.[c]).length;
    shopList.sort((a, b) => coverage(b) - coverage(a) || String(a.name).localeCompare(String(b.name), 'ko'));

    const head = `<tr><th scope="col">거래소</th>${cards
      .map((c) => `<th scope="col" class="num">${esc(c)}</th>`)
      .join('')}</tr>`;
    const body = shopList
      .map((s) => {
        const href = safeHref(s.site);
        const label = href
          ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.name)}</a>`
          : esc(s.name);
        const tds = cards
          .map((c) => {
            const e = cell[s.id]?.[c];
            if (!e || (e.buy == null && e.sell == null)) return '<td class="num mx-empty">—</td>';
            const sell =
              e.sell != null
                ? `<span class="mx-sell${e.sell === best[c].sell ? ' is-best' : ''}"><small>살 때</small>${won(e.sell)}</span>`
                : '<span class="mx-sell mx-na"><small>살 때</small>—</span>';
            const buy =
              e.buy != null
                ? `<span class="mx-buy${e.buy === best[c].buy ? ' is-best' : ''}"><small>팔 때</small>${won(e.buy)}</span>`
                : '<span class="mx-buy mx-na"><small>팔 때</small>—</span>';
            return `<td class="num">${sell}${buy}</td>`;
          })
          .join('');
        return `<tr><th scope="row">${label}</th>${tds}</tr>`;
      })
      .join('\n');

    return `<h3 class="mx-title">거래소별 시세 · ${esc(faceLabel(face))} <small>살 때 = 거래소 판매가(열에서 가장 싼 곳 강조) · 팔 때 = 거래소 매입가(가장 비싸게 사주는 곳 강조) · 단위: 원</small></h3>
<div class="table-scroll">
  <table class="tbl mx-table">
    <thead>${head}</thead>
    <tbody>
${body}
    </tbody>
  </table>
</div>
<p class="note mx-note">업체명을 누르면 해당 업체 사이트로 이동합니다. 한 업체에 이체·현금 가격이 둘 다 있으면 손님에게 유리한 값을 표시합니다. 실제 거래 조건은 업체에서 확인하세요.</p>`;
  }

  const api = { deptMatrix };
  root.MODOO_GIFT_RENDER = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : this);
