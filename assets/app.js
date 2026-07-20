'use strict';

/* ============================================================
   시세 — 대한민국 모든 시세 한눈에
   빌드 도구가 없는 정적 사이트라, 페이지 공통 셸(헤더·메뉴·푸터)을
   이 파일에서 한 번만 정의하고 각 페이지가 재사용합니다.
   페이지 구분은 <body data-page="..."> 로 합니다.
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const won = (n) => n.toLocaleString('ko-KR') + '원';
const num = (n, d = 2) =>
  n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 큰 금액을 조/억 단위로 압축 */
function compactWon(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + '조원';
  if (n >= 1e8) return Math.round(n / 1e8).toLocaleString('ko-KR') + '억원';
  if (n >= 1e4) return Math.round(n / 1e4).toLocaleString('ko-KR') + '만원';
  return won(Math.round(n));
}

function fmtPrice(v, group) {
  if (group === 'coin' || group === 'fx') return v >= 100 ? num(v, 0) : num(v, 2);
  return num(v, 2);
}

function dir(n) {
  if (n == null || Math.abs(n) < 1e-9) return 'flat';
  return n > 0 ? 'up' : 'down';
}

const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const fetchJSON = (path) => fetch(path, { cache: 'no-store' }).then((r) => {
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
});

// ---------- 메뉴 정의 ----------
// 링크에 .html 을 유지합니다. Cloudflare Pages 는 /coin.html 을 /coin 으로
// 308 리다이렉트하지만, .html 을 빼면 로컬 정적 서버에서 404 가 나 검증이 막힙니다.
// 리다이렉트 1회 비용보다 양쪽에서 동작하는 쪽이 낫습니다.
const MENUS = [
  { id: 'home', href: 'index.html', label: '홈', icon: 'layers' },
  { id: 'coin', href: 'coin.html', label: '코인시세', icon: 'coin' },
  { id: 'stock', href: 'stock.html', label: '주식시세', icon: 'chart' },
  { id: 'kosdaq', href: 'kosdaq.html', label: '코스닥시세', icon: 'chart' },
  { id: 'fx', href: 'fx.html', label: '환율시세', icon: 'fx' },
  { id: 'metal', href: 'metal.html', label: '금·은시세', icon: 'gem' },
  { id: 'giftcard', href: 'giftcard.html', label: '상품권시세', icon: 'ticket' },
  { id: 'realestate', href: 'realestate.html', label: '부동산시세', icon: 'home' },
  { id: 'lotto', href: 'lotto.html', label: '로또', icon: 'target' },
];

const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="i-chart" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/></symbol>
  <symbol id="i-gem" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M2 9h20"/><path d="m10 3-2 6 4 12 4-12-2-6"/></symbol>
  <symbol id="i-fx" viewBox="0 0 24 24"><path d="M3 8h14l-3-3"/><path d="M21 16H7l3 3"/></symbol>
  <symbol id="i-coin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 8h4.5a2.5 2.5 0 0 1 0 5H9m0 0h5a2.5 2.5 0 0 1 0 5H9V8Zm2-3v3m0 10v3"/></symbol>
  <symbol id="i-ticket" viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M14 6v12"/></symbol>
  <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/></symbol>
  <symbol id="i-home" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></symbol>
  <symbol id="i-up" viewBox="0 0 24 24"><path d="m6 15 6-7 6 7"/></symbol>
  <symbol id="i-down" viewBox="0 0 24 24"><path d="m6 9 6 7 6-7"/></symbol>
  <symbol id="i-flat" viewBox="0 0 24 24"><path d="M6 12h12"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></symbol>
</svg>`;

/** 헤더·메뉴·푸터를 주입합니다. */
function renderShell() {
  const page = document.body.dataset.page || 'home';

  document.body.insertAdjacentHTML('afterbegin', SPRITE + `
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="index.html">
      <span class="brand-mark">시세</span>
      <span class="brand-text">대한민국 모든 시세 한눈에</span>
    </a>
    <p class="status" id="updated"><span class="dot"></span>불러오는 중…</p>
    <button class="theme-toggle" id="theme-toggle" type="button" aria-label="화면 테마 전환">
      ${icon('sun', 'icon icon-sun')}${icon('moon', 'icon icon-moon')}
    </button>
  </div>
</header>

<nav class="tabs wrap" aria-label="시세 메뉴">
  ${MENUS.map(
    (m) =>
      `<a class="tab" href="${m.href}"${m.id === page ? ' aria-current="page"' : ''}>${icon(m.icon)}${m.label}</a>`
  ).join('')}
</nav>`);

  document.body.insertAdjacentHTML(
    'beforeend',
    `<footer class="site-footer wrap">
  <p>시세는 참고용이며 실제 거래가와 다를 수 있습니다. 투자 판단의 근거로 사용하지 마세요.</p>
  <p class="src">출처: 동행복권 · Yahoo Finance · 업비트 · 각 상품권 업체 · 국토교통부</p>
</footer>`
  );

  // 기본은 네이비입니다. data-theme 이 없으면 네이비로 봅니다.
  $('#theme-toggle').addEventListener('click', () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch (e) {}
  });
}

/** 헤더의 갱신 시각 표시 */
function setStatus(stamp, msg) {
  const el = $('#updated');
  if (!el) return;
  el.className = stamp ? 'status is-live' : 'status is-error';
  el.innerHTML =
    '<span class="dot"></span>' +
    (stamp ? `최종 갱신 ${new Date(stamp).toLocaleString('ko-KR')}` : msg || '데이터를 불러오지 못했습니다.');
}

// ---------- 공용 조각 ----------
function sparkline(values) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`)
    .join(' ');
  const cls = values.at(-1) >= values[0] ? 'up' : 'down';
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"
      vector-effect="non-scaling-stroke" class="${cls}" />
  </svg>`;
}

function card(item, i = 0) {
  const d = dir(item.changePct);
  const label = d === 'up' ? '상승' : d === 'down' ? '하락' : '보합';
  const pct =
    item.changePct == null
      ? ''
      : `${icon(d)}<span class="sr-label">${label}</span>${num(Math.abs(item.changePct), 2)}%`;
  const abs =
    item.change == null ? '' : `(${item.change > 0 ? '+' : '-'}${num(Math.abs(item.change), 2)})`;
  return `<article class="card" style="--i:${i}">
    ${item.rank ? `<span class="rank">${item.rank}</span>` : ''}
    <div class="name">${item.name}</div>
    <div class="price">${fmtPrice(item.price, item.group)}<span class="unit">${item.unit}</span></div>
    <div class="delta ${d}">${pct}${abs}</div>
    ${item.volume ? `<div class="memo">24h 거래대금 ${compactWon(item.volume)}</div>` : ''}
    ${item.note ? `<div class="memo">${item.note}</div>` : ''}
    <span class="${d}">${sparkline(item.spark)}</span>
  </article>`;
}

/** markets.json 의 특정 그룹을 그리드에 렌더링 */
async function renderMarketGroup(groupOrIds, mountSel) {
  const data = await fetchJSON('/data/markets.json');
  const pick = Array.isArray(groupOrIds)
    ? groupOrIds.map((id) => data.items.find((i) => i.id === id)).filter(Boolean)
    : data.items.filter((i) => i.group === groupOrIds);
  const el = $(mountSel);
  if (el) {
    el.innerHTML = pick.length
      ? pick.map((it, i) => card(it, i)).join('')
      : '<p class="empty">데이터를 불러오지 못했습니다.</p>';
  }
  return { data, pick };
}
