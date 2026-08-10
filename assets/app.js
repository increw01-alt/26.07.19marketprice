'use strict';

/* ============================================================
   시세 — 대한민국 모든 시세 한눈에
   빌드 도구가 없는 정적 사이트라, 페이지 공통 셸(헤더·메뉴·푸터)을
   이 파일에서 한 번만 정의하고 각 페이지가 재사용합니다.
   페이지 구분은 <body data-page="..."> 로 합니다.
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SITE_CONFIG = globalThis.MODOO_SITE_CONFIG;
if (!SITE_CONFIG?.groups?.length || !SITE_CONFIG?.pages?.length) {
  throw new Error('사이트 카테고리 설정을 불러오지 못했습니다.');
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeHttpUrl(value, fallback = '#') {
  try {
    const base = globalThis.location?.href || 'https://modoosise.com/';
    const url = new URL(String(value ?? ''), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
    return escapeHTML(url.href);
  } catch {
    return fallback;
  }
}

globalThis.escapeHTML = escapeHTML;
globalThis.safeHttpUrl = safeHttpUrl;

const num = (n, d = 2) => {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });
};
const won = (n) => `${num(n, 0)}원`;

/** 큰 금액을 조/억 단위로 압축 */
function compactWon(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e12) return (value / 1e12).toFixed(1) + '조원';
  if (value >= 1e8) return Math.round(value / 1e8).toLocaleString('ko-KR') + '억원';
  if (value >= 1e4) return Math.round(value / 1e4).toLocaleString('ko-KR') + '만원';
  return won(Math.round(value));
}

function fmtPrice(v, group, unit = '') {
  // 원화 단위(국내 금값 등)는 소수점 없이 정수로 표시합니다.
  const value = Number(v);
  if (!Number.isFinite(value)) return '—';
  const normalizedUnit = String(unit ?? '');
  if (normalizedUnit.includes('원') || normalizedUnit === 'KRW') return num(value, 0);
  if (group === 'coin' || group === 'fx') return value >= 100 ? num(value, 0) : num(value, 2);
  return num(value, 2);
}

function dir(n) {
  const value = Number(n);
  if (n == null || !Number.isFinite(value) || Math.abs(value) < 1e-9) return 'flat';
  return value > 0 ? 'up' : 'down';
}

const icon = (id, cls = 'icon') =>
  `<svg class="${escapeHTML(cls)}" aria-hidden="true"><use href="#i-${escapeHTML(id)}"/></svg>`;

const fetchJSON = (path, options = {}) => fetch(path, options).then((r) => {
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
});

const SPRITE = `
<svg data-icon-sprite width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <symbol id="i-chart" viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/></symbol>
  <symbol id="i-gem" viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M2 9h20"/><path d="m10 3-2 6 4 12 4-12-2-6"/></symbol>
  <symbol id="i-fx" viewBox="0 0 24 24"><path d="M3 8h14l-3-3"/><path d="M21 16H7l3 3"/></symbol>
  <symbol id="i-coin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 8h4.5a2.5 2.5 0 0 1 0 5H9m0 0h5a2.5 2.5 0 0 1 0 5H9V8Zm2-3v3m0 10v3"/></symbol>
  <symbol id="i-ticket" viewBox="0 0 24 24"><path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4Z"/><path d="M14 6v12"/></symbol>
  <symbol id="i-cart" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></symbol>
  <symbol id="i-flame" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></symbol>
  <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></symbol>
  <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/></symbol>
  <symbol id="i-home" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/></symbol>
  <symbol id="i-oil" viewBox="0 0 24 24"><path d="M7 21h10M8 21V9a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12"/><path d="M12 7V4M9 4h6"/><path d="M18 11h1a2 2 0 0 1 2 2v3a1 1 0 0 1-2 0v-2"/></symbol>
  <symbol id="i-gauge" viewBox="0 0 24 24"><path d="M12 14a2 2 0 1 0 2-2"/><path d="M13.4 12.6 16 10"/><path d="M4 20a9 9 0 1 1 16 0"/></symbol>
  <symbol id="i-up" viewBox="0 0 24 24"><path d="m6 15 6-7 6 7"/></symbol>
  <symbol id="i-down" viewBox="0 0 24 24"><path d="m6 9 6 7 6-7"/></symbol>
  <symbol id="i-flat" viewBox="0 0 24 24"><path d="M6 12h12"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></symbol>
  <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
  <symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol>
  <symbol id="i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></symbol>
</svg>`;

function currentNavigation(page) {
  const activePage = SITE_CONFIG.pages.find((item) => item.id === page);
  const activeGroup = activePage
    ? SITE_CONFIG.groups.find((group) => group.id === activePage.groupId)
    : null;
  return { activePage, activeGroup };
}

function topNavMarkup(page) {
  const links = SITE_CONFIG.pages.map((item) => {
    const current = item.id === page ? ' aria-current="page"' : '';
    return `<a class="top-link" href="${escapeHTML(item.href)}"${current}>${escapeHTML(item.nav || item.label)}</a>`;
  }).join('');
  return `<nav class="top-nav" aria-label="주요 메뉴">
  <div class="wrap">${links}</div>
</nav>`;
}

function navigationMarkup(page) {
  const { activePage, activeGroup } = currentNavigation(page);
  const primary = SITE_CONFIG.groups.map((group) => {
    const href = group.pages[0]?.href || '/';
    const current = activeGroup?.id === group.id ? ' aria-current="location"' : '';
    return `<a class="nav-link nav-link-primary" href="${escapeHTML(href)}"${current}>${icon(group.icon)}<span>${escapeHTML(group.label)}</span></a>`;
  }).join('');
  const secondary = activeGroup && activeGroup.pages.length > 1
    ? `<nav class="secondary-nav wrap" aria-label="${escapeHTML(activeGroup.label)} 세부 메뉴">
  <p class="nav-section-title">${escapeHTML(activeGroup.label)} 세부 메뉴</p>
  <div class="nav-links">
    ${activeGroup.pages.map((item) =>
      `<a class="nav-link nav-link-secondary" href="${escapeHTML(item.href)}"${activePage?.id === item.id ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${escapeHTML(item.label)}</span></a>`,
    ).join('')}
  </div>
</nav>`
    : '';

  return `<div class="nav-backdrop" data-nav-dismiss hidden></div>
<div class="site-nav-panel" id="site-navigation" aria-labelledby="nav-drawer-title">
  <div class="nav-panel-head">
    <strong id="nav-drawer-title">카테고리</strong>
    <button class="nav-close" type="button" aria-label="카테고리 메뉴 닫기">${icon('x')}</button>
  </div>
  <nav class="primary-nav wrap" aria-label="주요 카테고리">
    <p class="nav-section-title">주요 카테고리</p>
    <div class="nav-links">${primary}</div>
  </nav>
  ${secondary}
</div>`;
}

function bindThemeToggle() {
  const themeToggle = $('#theme-toggle');
  if (!themeToggle || themeToggle.dataset.bound) return;
  const updateLabel = () => {
    const current = document.documentElement.dataset.theme === 'dark' ? '다크' : '라이트';
    themeToggle.setAttribute('aria-label', `${current} 테마 사용 중, 화면 테마 전환`);
  };
  updateLabel();
  themeToggle.addEventListener('click', () => {
    const root = document.documentElement;
    // 기본(속성 없음)이 라이트이므로, 다크가 아니면 다크로 전환합니다.
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    updateLabel();
    try {
      localStorage.setItem('theme', next);
    } catch (e) {}
  });
  themeToggle.dataset.bound = 'true';
}

function bindNavigationDrawer() {
  const toggle = $('.nav-toggle');
  const panel = $('#site-navigation');
  const closeButton = $('.nav-close', panel || document);
  const backdrop = $('[data-nav-dismiss]');
  if (!toggle || !panel || !closeButton || !backdrop || panel.dataset.bound) return;

  const mobile = matchMedia('(max-width: 767px)');
  let restoreFocus = false;
  const isOpen = () => panel.dataset.open === 'true';
  const focusable = () => $$('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])', panel)
    .filter((item) => !item.hidden);

  const close = (returnFocus = true) => {
    panel.dataset.open = 'false';
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    backdrop.hidden = true;
    if (mobile.matches) {
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('inert', '');
    }
    if (returnFocus && restoreFocus && mobile.matches) toggle.focus();
    restoreFocus = false;
  };

  const open = () => {
    restoreFocus = true;
    panel.dataset.open = 'true';
    panel.removeAttribute('aria-hidden');
    panel.removeAttribute('inert');
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    backdrop.hidden = false;
    closeButton.focus();
  };

  const syncViewport = () => {
    if (mobile.matches) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      if (!isOpen()) close(false);
    } else {
      panel.dataset.open = 'false';
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      panel.removeAttribute('aria-hidden');
      panel.removeAttribute('inert');
      document.body.classList.remove('nav-open');
      toggle.setAttribute('aria-expanded', 'false');
      backdrop.hidden = true;
    }
  };

  toggle.addEventListener('click', () => (isOpen() ? close() : open()));
  closeButton.addEventListener('click', () => close());
  backdrop.addEventListener('click', () => close());
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a[href]')) close(false);
  });
  document.addEventListener('keydown', (event) => {
    if (!mobile.matches || !isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable();
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', syncViewport);
  else mobile.addListener(syncViewport);
  panel.dataset.bound = 'true';
  syncViewport();
}

/** 헤더·메뉴·푸터를 주입하고 공통 상호작용을 연결합니다. */
function renderShell() {
  const page = document.body.dataset.navPage || document.body.dataset.page || 'home';
  const main = $('main');
  if (main && !main.id) main.id = 'main';

  if (!$('[data-icon-sprite]')) document.body.insertAdjacentHTML('afterbegin', SPRITE);

  if (!$('.site-header')) document.body.insertAdjacentHTML('afterbegin', `
<a class="skip-link" href="#main">본문 바로가기</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">
      <svg class="brand-logo" viewBox="0 0 46 56" aria-hidden="true">
        <rect x="2" y="20" width="9" height="22" rx="2" fill="#60a5fa"/><line x1="6.5" y1="12" x2="6.5" y2="48" stroke="#60a5fa" stroke-width="2.5"/>
        <rect x="18" y="10" width="9" height="24" rx="2" fill="#f87171"/><line x1="22.5" y1="4" x2="22.5" y2="40" stroke="#f87171" stroke-width="2.5"/>
        <rect x="34" y="16" width="9" height="18" rx="2" fill="#fbbf24"/><line x1="38.5" y1="8" x2="38.5" y2="42" stroke="#fbbf24" stroke-width="2.5"/>
      </svg>
      <span class="brand-mark">모두의 시세</span>
      <span class="brand-text">대한민국 모든 시세 한눈에</span>
    </a>
    <p class="status" id="updated"><span class="dot"></span>불러오는 중…</p>
    <div class="header-actions">
      <button class="theme-toggle" id="theme-toggle" type="button" aria-label="화면 테마 전환">
        ${icon('sun', 'icon icon-sun')}${icon('moon', 'icon icon-moon')}
      </button>
      <button class="nav-toggle" type="button" aria-controls="site-navigation" aria-expanded="false">
        ${icon('menu')}<span>카테고리</span>
      </button>
    </div>
  </div>
</header>
${topNavMarkup(page)}
${navigationMarkup(page)}`);
  else if (!$('.skip-link')) document.body.insertAdjacentHTML('afterbegin', '<a class="skip-link" href="#main">본문 바로가기</a>');

  if (!$('.site-footer')) document.body.insertAdjacentHTML(
    'beforeend',
    `<footer class="site-footer">
  <div class="wrap foot-grid">
    <div class="foot-brand">
      <span class="brand-mark">모두의 시세</span>
      <p>대한민국 모든 시세를 한눈에 제공하는 시장 정보 서비스입니다. 코인·주식·환율·금·상품권·부동산·로또까지 매시간 갱신합니다.</p>
    </div>
    <nav class="foot-col" aria-label="서비스 메뉴">
      <strong>서비스</strong>
      <div class="foot-menu"><a href="/coin">코인시세</a><a href="/stock">주식시세</a><a href="/kosdaq">코스닥시세</a><a href="/fx">환율시세</a><a href="/metal">금시세</a><a href="/energy">유가</a><a href="/macro">경제지표</a><a href="/giftcard">상품권시세</a><a href="/realestate">부동산시세</a><a href="/hotdeal">핫딜</a><a href="/lotto">로또</a></div>
    </nav>
    <nav class="foot-col" aria-label="안내">
      <strong>안내</strong>
      <div class="foot-menu"><a href="/about">모두의 시세 소개</a><a href="/rss.xml">RSS 피드</a></div>
    </nav>
  </div>
  <div class="wrap foot-legal">
    <p>시세는 참고용이며 실제 거래가와 다를 수 있습니다. 투자 판단의 근거로 사용하지 마세요.</p>
    <p class="src">출처: 동행복권 · Yahoo Finance · 업비트 · 각 상품권 업체 · 국토교통부 · 한국은행 · 오피넷</p>
  </div>
</footer>`,
  );

  bindThemeToggle();
  bindNavigationDrawer();
}

/** 헤더의 갱신 시각 표시 */
function setStatus(stamp, msg) {
  const el = $('#updated');
  if (!el) return;
  el.className = stamp ? 'status is-live' : 'status is-error';
  const dot = document.createElement('span');
  dot.className = 'dot';
  const text = stamp
    ? `최종 갱신 ${new Date(stamp).toLocaleString('ko-KR')}`
    : String(msg || '데이터를 불러오지 못했습니다.');
  el.replaceChildren(dot, document.createTextNode(text));
}

// ---------- 공용 조각 ----------
function sparkline(values) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const points = values.map(Number);
  if (points.some((value) => !Number.isFinite(value))) return '';
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pts = points
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`)
    .join(' ');
  const cls = points.at(-1) >= points[0] ? 'up' : 'down';
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
  const index = Number.isInteger(i) && i >= 0 ? i : 0;
  return `<article class="card" style="--i:${index}">
    ${item.rank ? `<span class="rank">${escapeHTML(item.rank)}</span>` : ''}
    <div class="name">${escapeHTML(item.name)}</div>
    <div class="price">${fmtPrice(item.price, item.group, item.unit)}<span class="unit">${escapeHTML(item.unit)}</span></div>
    <div class="delta ${d}">${pct}${abs}</div>
    ${item.volume ? `<div class="memo">24h 거래대금 ${compactWon(item.volume)}</div>` : ''}
    ${item.note ? `<div class="memo">${escapeHTML(item.note)}</div>` : ''}
    <span class="${d}">${sparkline(item.spark)}</span>
  </article>`;
}

/** markets.json 의 특정 그룹을 그리드에 렌더링 */
// 그룹 내 표시 순서 (국내 금값을 앞에). 목록에 없는 id 는 뒤로.
const GROUP_ORDER = {
  metal: ['gold_krx', 'gold_don', 'gold', 'silver', 'plat'],
};

async function renderMarketGroup(groupOrIds, mountSel) {
  const data = await fetchJSON('/data/markets.json');
  let pick = Array.isArray(groupOrIds)
    ? groupOrIds.map((id) => data.items.find((i) => i.id === id)).filter(Boolean)
    : data.items.filter((i) => i.group === groupOrIds);
  const order = !Array.isArray(groupOrIds) && GROUP_ORDER[groupOrIds];
  if (order) {
    const rank = (id) => (order.indexOf(id) + 1 || 99);
    pick = pick.slice().sort((a, b) => rank(a.id) - rank(b.id));
  }
  const el = $(mountSel);
  if (el) {
    el.innerHTML = pick.length
      ? pick.map((it, i) => card(it, i)).join('')
      : '<p class="empty">데이터를 불러오지 못했습니다.</p>';
  }
  return { data, pick };
}

// 정적 HTML에서도 테마와 모바일 내비게이션이 즉시 동작하게 합니다.
// pages.js가 다시 호출해도 각 바인딩은 data-bound로 한 번만 연결됩니다.
renderShell();
