import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GIFT_CARD_CHECKLIST,
  GIFT_CARD_FAQ,
  GIFT_CARD_FAQ_UPDATED,
  GIFT_CARD_OFFICIAL_LINKS,
} from './giftcard-faq.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SITE_CONFIG = require('../assets/site-config.js');
// 홈 화면 렌더러 — 프리렌더와 브라우저 하이드레이션이 같은 코드를 씁니다.
const HOME_RENDER = require('../assets/home-render.js');
const checkOnly = process.argv.includes('--check');
const ASSET_VERSION = '20260831-gift1';

const esc = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const won = (value) => `${Number(value).toLocaleString('ko-KR')}원`;
const num = (value, digits = 2) =>
  Number(value).toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

function compactWon(value) {
  const n = Number(value);
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}조원`;
  if (n >= 1e8) return `${Math.round(n / 1e8).toLocaleString('ko-KR')}억원`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만원`;
  return won(Math.round(n));
}

function fmtPrice(value, group, unit = '') {
  const v = Number(value);
  if (String(unit).includes('원') || unit === 'KRW') return num(v, 0);
  if (group === 'coin' || group === 'fx') return v >= 100 ? num(v, 0) : num(v, 2);
  return num(v, 2);
}

function direction(value) {
  if (value == null || Math.abs(Number(value)) < 1e-9) return 'flat';
  return Number(value) > 0 ? 'up' : 'down';
}

const icon = (id, cls = 'icon') =>
  `<svg class="${esc(cls)}" aria-hidden="true"><use href="#i-${esc(id)}"/></svg>`;

function sparkline(values) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const nums = values.map(Number);
  if (nums.some((value) => !Number.isFinite(value))) return '';
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const points = nums
    .map((value, index) => `${(index / (nums.length - 1)) * 100},${28 - ((value - min) / span) * 26}`)
    .join(' ');
  const cls = nums.at(-1) >= nums[0] ? 'up' : 'down';
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
  <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" class="${cls}" />
</svg>`;
}

function marketCard(item, index = 0) {
  const d = direction(item.changePct);
  const label = d === 'up' ? '상승' : d === 'down' ? '하락' : '보합';
  const pct =
    item.changePct == null
      ? ''
      : `${icon(d)}<span class="sr-label">${label}</span>${num(Math.abs(item.changePct), 2)}%`;
  const absolute =
    item.change == null
      ? ''
      : `(${Number(item.change) > 0 ? '+' : '-'}${num(Math.abs(item.change), 2)})`;

  return `<article class="card" style="--i:${index}">
  ${item.rank ? `<span class="rank">${esc(item.rank)}</span>` : ''}
  <div class="name">${esc(item.name)}</div>
  <div class="price">${fmtPrice(item.price, item.group, item.unit)}<span class="unit">${esc(item.unit)}</span></div>
  <div class="delta ${d}">${pct}${absolute}</div>
  ${item.volume ? `<div class="memo">24h 거래대금 ${compactWon(item.volume)}</div>` : ''}
  ${item.note ? `<div class="memo">${esc(item.note)}</div>` : ''}
  <span class="${d}">${sparkline(item.spark)}</span>
</article>`;
}

function formatStamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return esc(value);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
    return esc(url.href);
  } catch {
    throw new Error(`허용되지 않은 외부 URL: ${value}`);
  }
}

function giftCardFaqHtml() {
  const questions = GIFT_CARD_FAQ.map(
    ({ question, paragraphs }) => `<details class="faq-item">
  <summary>${esc(question)}</summary>
  <div class="faq-answer">${paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}</div>
</details>`,
  ).join('\n');
  const checklist = GIFT_CARD_CHECKLIST.map((item) => `<li>${esc(item)}</li>`).join('\n');
  const officialLinks = GIFT_CARD_OFFICIAL_LINKS.map(
    ({ label, href }) =>
      `<li><a href="${safeHttpUrl(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></li>`,
  ).join('\n');
  const updated = GIFT_CARD_FAQ_UPDATED.split('-').map(Number);
  const updatedLabel = `${updated[0]}. ${updated[1]}. ${updated[2]}.`;

  return `<section class="panel faq-panel" id="giftcard-faq" aria-labelledby="giftcard-faq-title">
  <div class="faq-heading">
    <div>
      <span class="eyebrow">상품권 이용 가이드</span>
      <h2 id="giftcard-faq-title">상품권 상테크 자주 묻는 질문</h2>
    </div>
    <time class="faq-updated" datetime="${esc(GIFT_CARD_FAQ_UPDATED)}">내용 확인 ${esc(updatedLabel)}</time>
  </div>
  <p class="faq-intro">실제 상품권·카드 이용자 대화에서 반복된 질문을 익명으로 묶고, 변동될 수 있는 정책은 공식 확인 절차 중심으로 정리했습니다.</p>
  <div class="faq-method" role="note" aria-label="상품권 예상 순손익 계산 방법">
    <strong>예상 순손익 계산</strong>
    <code>최종 회수금액 또는 실제 사용가치 − 실제 결제금액 − 전환·정산 등 기타 비용</code>
    <span>카드 혜택은 지급 조건과 월 한도를 확인한 경우에만 더하세요.</span>
  </div>
  <div class="faq-list">${questions}</div>
  <aside class="faq-check" aria-labelledby="giftcard-check-title">
    <div>
      <h3 id="giftcard-check-title">결제 전 30초 체크리스트</h3>
      <p>큰 금액을 한 번에 결제하기보다 먼저 소액으로 구매·등록·사용 과정을 확인하면 위험을 줄일 수 있습니다.</p>
    </div>
    <ul>${checklist}</ul>
  </aside>
  <div class="faq-references">
    <h3>공식 확인처</h3>
    <ul>${officialLinks}</ul>
    <p>수수료·한도·사용처·카드 실적은 변경될 수 있습니다. 구매일의 판매 상세페이지, 발행사 약관, 전환 화면과 카드 상품설명서가 우선하며 이 안내는 수익이나 거래 안전을 보장하지 않습니다.</p>
  </div>
</section>`;
}

function giftCardFaqJsonLd() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': 'https://modoosise.com/giftcard#faq',
    url: 'https://modoosise.com/giftcard#giftcard-faq',
    inLanguage: 'ko',
    dateModified: GIFT_CARD_FAQ_UPDATED,
    mainEntity: GIFT_CARD_FAQ.map(({ question, paragraphs }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: paragraphs.join(' '),
      },
    })),
  };
  const json = JSON.stringify(structuredData).replaceAll('<', '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function faceLabel(value) {
  const n = Number(value);
  return n >= 10000 ? `${n / 10000}만원권` : `${n.toLocaleString('ko-KR')}원권`;
}

const shopLabel = (item) => esc(item.method ? `${item.shop} · ${item.method}` : item.shop);

function deptCards(items, face) {
  const rows = items.filter((item) => Number(item.face) === face);
  const cards = [...new Set(rows.map((item) => item.card))];

  return cards
    .map((cardName, index) => {
      const list = rows.filter((item) => item.card === cardName);
      const bestBuy = list
        .filter((item) => item.buy != null)
        .slice()
        .sort((a, b) => b.buy - a.buy)[0];
      const bestSell = list
        .filter((item) => item.sell != null)
        .slice()
        .sort((a, b) => a.sell - b.sell)[0];
      const best = (item, kind) => {
        if (!item) {
          return `<div class="best"><span class="k">${kind}</span><span class="v flat">—</span></div>`;
        }
        const isBuy = kind === '최고 매입가';
        const rate = isBuy ? item.buyRate : item.sellRate;
        return `<div class="best">
  <span class="k">${kind}<small>${isBuy ? '팔 때' : '살 때'}</small></span>
  <span class="v">${won(isBuy ? item.buy : item.sell)}</span>
  <span class="m">${rate != null ? `${num(rate, 2)}% · ` : ''}${shopLabel(item)}</span>
</div>`;
      };
      const detail = list
        .slice()
        .sort((a, b) => (b.buy ?? 0) - (a.buy ?? 0))
        .map(
          (item) => `<tr>
  <td>${shopLabel(item)}</td>
  <td class="num${item === bestBuy ? ' is-best' : ''}">${item.buy != null ? won(item.buy) : '—'}</td>
  <td class="num${item === bestSell ? ' is-best' : ''}">${item.sell != null ? won(item.sell) : '—'}</td>
</tr>`,
        )
        .join('\n');

      return `<article class="gc" style="--i:${index}">
  <header class="gc-head"><h3>${esc(cardName)}</h3><span class="gc-face">${faceLabel(face)}</span></header>
  <div class="gc-best">${best(bestBuy, '최고 매입가')}${best(bestSell, '최저 판매가')}</div>
  <details class="gc-all">
    <summary>업체별 전체 ${list.length}건</summary>
    <div class="table-scroll">
      <table class="tbl">
        <thead><tr><th>업체</th><th class="num">매입가</th><th class="num">판매가</th></tr></thead>
        <tbody>${detail}</tbody>
      </table>
    </div>
  </details>
</article>`;
    })
    .join('\n');
}

function manualGiftRows(data) {
  return data.items
    .map((item) => {
      const hasRate = typeof item.rate === 'number';
      return `<tr>
  <td>${esc(item.name)}</td>
  <td class="num">${won(item.face)}</td>
  <td class="num">${hasRate ? `${num(item.rate, 1)}%` : '<span class="flat">미입력</span>'}</td>
  <td class="num">${hasRate ? won(Math.round((item.face * item.rate) / 100)) : '<span class="flat">—</span>'}</td>
</tr>`;
    })
    .join('\n');
}

async function readJson(relativePath) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  const value = JSON.parse(source);
  if (!value || typeof value !== 'object') throw new Error(`${relativePath}: JSON 객체가 아닙니다.`);
  return value;
}

function count(source, needle) {
  let total = 0;
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    total += 1;
    offset += needle.length;
  }
  return total;
}

function indentBlock(html, indent) {
  return html
    .trim()
    .split('\n')
    .map((line) => (line.trimEnd() ? `${indent}${line.trimEnd()}` : ''))
    .join('\n');
}

function replaceRegion(source, key, rendered, file) {
  const start = `<!-- prerender:${key}:start -->`;
  const end = `<!-- prerender:${key}:end -->`;
  if (count(source, start) !== 1 || count(source, end) !== 1) {
    throw new Error(`${file}: ${key} 마커는 시작과 끝이 각각 정확히 1개여야 합니다.`);
  }
  if (!rendered.trim()) throw new Error(`${file}: ${key} 생성 결과가 비었습니다.`);
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  if (endAt < startAt) throw new Error(`${file}: ${key} 마커 순서가 잘못됐습니다.`);
  const lineAt = source.lastIndexOf('\n', startAt) + 1;
  const markerIndent = source.slice(lineAt, startAt);
  const content = `\n${indentBlock(rendered, `${markerIndent}  `)}\n${markerIndent}`;
  return source.slice(0, startAt + start.length) + content + source.slice(endAt);
}

function staticNavigation(page) {
  const activePage = SITE_CONFIG.pages.find((item) => item.id === page);
  const activeGroup = activePage
    ? SITE_CONFIG.groups.find((group) => group.id === activePage.groupId)
    : null;
  const primary = SITE_CONFIG.groups.map((group) => {
    const href = group.pages[0]?.href || '/';
    const current = activeGroup?.id === group.id ? ' aria-current="location"' : '';
    return `<a class="nav-link nav-link-primary" href="${esc(href)}"${current}>${icon(group.icon)}<span>${esc(group.label)}</span></a>`;
  }).join('');
  const secondary = activeGroup && activeGroup.pages.length > 1
    ? `<nav class="secondary-nav wrap" aria-label="${esc(activeGroup.label)} 세부 메뉴">
  <p class="nav-section-title">${esc(activeGroup.label)} 세부 메뉴</p>
  <div class="nav-links">
    ${activeGroup.pages.map((item) =>
      `<a class="nav-link nav-link-secondary" href="${esc(item.href)}"${activePage?.id === item.id ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${esc(item.label)}</span></a>`,
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

function staticTopNav(page) {
  const links = SITE_CONFIG.pages.map((item) => {
    const current = item.id === page ? ' aria-current="page"' : '';
    return `<a class="top-link" href="${esc(item.href)}"${current}>${esc(item.nav || item.label)}</a>`;
  }).join('');
  return `<nav class="top-nav" aria-label="주요 메뉴">
  <div class="wrap">${links}</div>
</nav>`;
}

function staticHeader(page, stamp, hideStatus = false) {
  const status = hideStatus
    ? '<p class="status" id="updated" hidden><span class="dot"></span></p>'
    : `<p class="status is-live" id="updated"><span class="dot"></span>최종 갱신 ${formatStamp(stamp)}</p>`;
  return `<a class="skip-link" href="#main">본문 바로가기</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/">
      <svg class="brand-logo" viewBox="0 0 46 56" aria-hidden="true">
        <rect x="2" y="20" width="9" height="22" rx="2" fill="#60a5fa"/><line x1="6.5" y1="12" x2="6.5" y2="48" stroke="#60a5fa" stroke-width="2.5"/>
        <rect x="18" y="10" width="9" height="24" rx="2" fill="#f87171"/><line x1="22.5" y1="4" x2="22.5" y2="40" stroke="#f87171" stroke-width="2.5"/>
        <rect x="34" y="16" width="9" height="18" rx="2" fill="#fbbf24"/><line x1="38.5" y1="8" x2="38.5" y2="42" stroke="#fbbf24" stroke-width="2.5"/>
      </svg>
      <span class="brand-mark">모두의 <b>시세</b></span>
      <span class="brand-text">대한민국 모든 시세 한눈에</span>
    </a>
    ${status}
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
${staticTopNav(page)}
${staticNavigation(page)}`;
}

const staticFooter = `<footer class="site-footer">
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
    <p class="copyright">© 2026 MODOOSISE. All rights reserved.</p>
  </div>
</footer>`;

const BRAND_PAGES = [
  {
    key: 'lotte',
    card: '롯데',
    file: 'giftcard/lotte.html',
    pathname: '/giftcard/lotte',
    title: '롯데상품권 시세·매입가 비교 | 모두의 시세',
    h1: '롯데상품권 시세',
    description:
      '롯데백화점 상품권 5만·10만·50만원권의 업체별 매입가와 판매가를 비교합니다. 출처, 최종 갱신 시각, 거래 전 확인사항도 함께 제공합니다.',
    guideTitle: '롯데 지류 상품권과 모바일 교환권은 구분해서 확인하세요',
    guide: [
      '현재 비교표는 수집 업체가 롯데백화점 상품권으로 게시한 지류권 가격을 액면가별로 정리한 것입니다.',
      '모바일 교환권은 지류 상품권과 교환·사용 조건이 다를 수 있으므로 이 표의 가격을 그대로 적용하지 말고, 거래 전에 상품권 형태를 먼저 알려야 합니다.',
      '수집 데이터에는 현재 5만·10만·50만원권이 포함됩니다. 롯데가 발행하는 전체 권종과 사용처는 공식 안내에서 별도로 확인하세요.',
    ],
    officialLabel: '롯데백화점 상품권 공식 안내',
    officialUrl: 'https://www.lotteshopping.com/serviceInformation/voucher',
  },
  {
    key: 'shinsegae',
    card: '신세계',
    file: 'giftcard/shinsegae.html',
    pathname: '/giftcard/shinsegae',
    title: '신세계상품권 시세·매입가 비교 | 모두의 시세',
    h1: '신세계상품권 시세',
    description:
      '신세계상품권 5만·10만·50만원권의 업체별 매입가와 판매가를 비교합니다. 출처, 최종 갱신 시각, 거래 전 확인사항도 함께 제공합니다.',
    guideTitle: '신세계 지류 상품권의 종류와 전환 가능 여부를 확인하세요',
    guide: [
      '현재 비교표는 수집 업체가 신세계상품권으로 게시한 지류권 가격을 기준으로 하며, 모바일 쿠폰이나 교환권 가격은 포함하지 않습니다.',
      'SSG MONEY 전환 가능 여부와 절차는 상품권 종류와 상태에 따라 달라질 수 있습니다. 전환을 전제로 거래한다면 공식 안내에서 조건을 먼저 확인하세요.',
      '수집 데이터에는 현재 5만·10만·50만원권이 포함됩니다. 사용처와 잔액 관련 조건은 거래 시세와 별개의 사항입니다.',
    ],
    officialLabel: '신세계백화점 상품권 공식 안내',
    officialUrl: 'https://www.shinsegae.com/service/membership/certificate.do',
  },
  {
    key: 'hyundai',
    card: '현대',
    file: 'giftcard/hyundai.html',
    pathname: '/giftcard/hyundai',
    title: '현대백화점 상품권 시세·매입가 비교 | 모두의 시세',
    h1: '현대백화점 상품권 시세',
    description:
      '현대백화점 상품권 5만·10만·50만원권의 업체별 매입가와 판매가를 비교합니다. 출처, 최종 갱신 시각, 거래 전 확인사항도 함께 제공합니다.',
    guideTitle: '현대백화점 상품권의 구입 형태와 지류권 상태를 확인하세요',
    guide: [
      '현재 비교표는 수집 업체가 현대백화점 상품권으로 게시한 지류권 가격을 액면가별로 정리한 것입니다.',
      '백화점 판매 데스크 구입과 온라인 배송은 절차가 다를 수 있습니다. 공식 구입 안내와 외부 상품권 업체의 거래 조건을 서로 구분해서 확인하세요.',
      '수집 데이터에는 현재 5만·10만·50만원권이 포함됩니다. 훼손 여부, 수량, 결제 방식에 따라 현장 가격이 달라질 수 있습니다.',
    ],
    officialLabel: '현대백화점 상품권 공식 안내',
    officialUrl: 'https://www.ehyundai.com/mobile/event/VC/voucher03.do',
  },
];

function brandSubnav(currentKey) {
  const links = [
    { key: 'all', href: '/giftcard', label: '전체 상품권' },
    ...BRAND_PAGES.map(({ key, pathname, card }) => ({ key, href: pathname, label: `${card}상품권` })),
  ];
  return `<nav class="seg brand-subnav" aria-label="백화점 상품권 종류">
  ${links
    .map(
      (link) =>
        `<a class="seg-btn" href="${link.href}"${link.key === currentKey ? ' aria-current="page"' : ''}>${link.label}</a>`,
    )
    .join('\n  ')}
</nav>`;
}

function discountRate(item, field, face) {
  const saved = field === 'buy' ? item.buyRate : item.sellRate;
  if (typeof saved === 'number') return saved;
  return ((face - Number(item[field])) / face) * 100;
}

function brandCards(items) {
  const faces = [...new Set(items.map((item) => Number(item.face)))].sort((a, b) => a - b);
  return faces
    .map((face, index) => {
      const list = items.filter((item) => Number(item.face) === face);
      const bestBuy = list
        .filter((item) => item.buy != null)
        .slice()
        .sort((a, b) => b.buy - a.buy)[0];
      const bestSell = list
        .filter((item) => item.sell != null)
        .slice()
        .sort((a, b) => a.sell - b.sell)[0];
      const best = (item, kind, field) => {
        if (!item) {
          return `<div class="best"><span class="k">${kind}</span><span class="v flat">—</span></div>`;
        }
        return `<div class="best">
  <span class="k">${kind}<small>${field === 'buy' ? '내가 팔 때' : '내가 살 때'}</small></span>
  <span class="v">${won(item[field])}</span>
  <span class="m">액면가 대비 ${num(discountRate(item, field, face), 2)}% 차감 · ${shopLabel(item)}</span>
</div>`;
      };
      const rows = list
        .slice()
        .sort((a, b) => (b.buy ?? 0) - (a.buy ?? 0))
        .map(
          (item) => `<tr>
  <td>${shopLabel(item)}</td>
  <td class="num${item === bestBuy ? ' is-best' : ''}">${item.buy != null ? won(item.buy) : '—'}</td>
  <td class="num${item === bestSell ? ' is-best' : ''}">${item.sell != null ? won(item.sell) : '—'}</td>
</tr>`,
        )
        .join('\n');
      return `<article class="gc" style="--i:${index}">
  <header class="gc-head"><h3>${faceLabel(face)}</h3><span class="gc-face">${esc(items[0].card)}</span></header>
  <div class="gc-best">${best(bestBuy, '최고 매입가', 'buy')}${best(
        bestSell,
        '최저 판매가',
        'sell',
      )}</div>
  <details class="gc-all">
    <summary>업체·결제방식별 전체 ${list.length}건</summary>
    <div class="table-scroll">
      <table class="tbl">
        <thead><tr><th>업체</th><th class="num">매입가</th><th class="num">판매가</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </details>
</article>`;
    })
    .join('\n');
}

function brandJsonLd(config, data, items) {
  const url = `https://modoosise.com${config.pathname}`;
  const basedOn = data.shops
    .filter((shop) => shop.ok && items.some((item) => item.shopId === shop.id))
    .map((shop) => shop.site);
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: config.title,
        description: config.description,
        inLanguage: 'ko',
        dateModified: isoStamp(data.updatedAt),
        isPartOf: { '@type': 'WebSite', name: '모두의 시세', url: 'https://modoosise.com/' },
        mainEntity: { '@id': `${url}#dataset` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: 'https://modoosise.com/' },
          {
            '@type': 'ListItem',
            position: 2,
            name: '상품권시세',
            item: 'https://modoosise.com/giftcard',
          },
          { '@type': 'ListItem', position: 3, name: config.h1, item: url },
        ],
      },
      {
        '@type': 'Dataset',
        '@id': `${url}#dataset`,
        name: `${config.h1} 업체별 비교 데이터`,
        description: config.description,
        inLanguage: 'ko',
        dateModified: isoStamp(data.updatedAt),
        creator: { '@type': 'Organization', name: '모두의 시세', url: 'https://modoosise.com/' },
        variableMeasured: ['상품권 액면가', '업체별 매입가', '업체별 판매가'],
        isBasedOn: basedOn,
      },
    ],
  };
  return JSON.stringify(graph, null, 2).replaceAll('<', '\\u003c');
}

function renderBrandPage(config, data) {
  const items = data.items.filter((item) => item.card === config.card);
  const uniqueShops = new Set(items.map((item) => item.shopId));
  const uniqueFaces = new Set(items.map((item) => item.face));
  if (items.length === 0 || uniqueShops.size < 2 || uniqueFaces.size < 2) {
    throw new Error(`${config.card} 상품권 상세 페이지 게시 기준을 충족하지 못했습니다.`);
  }
  const sources = data.shops
    .map((shop) => {
      const reflected = items.filter((item) => item.shopId === shop.id).length;
      const state = shop.ok ? (reflected ? `${reflected}건 반영` : '해당 상품 없음') : '수집 실패';
      return `<li><a href="${safeHttpUrl(shop.site)}" target="_blank" rel="noopener noreferrer nofollow">${esc(
        shop.name,
      )}</a><span class="src-state ${shop.ok ? 'ok' : 'ng'}">${state}</span></li>`;
    })
    .join('\n');
  const canonical = `https://modoosise.com${config.pathname}`;
  const updated = formatStamp(data.updatedAt);

  return `<!doctype html>
<!-- 이 파일은 scripts/build-static.mjs가 최신 상품권 데이터로 자동 생성합니다. -->
<html lang="ko">
<head>
<meta charset="utf-8">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-D5NLQZ3DST"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-D5NLQZ3DST');</script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.title)}</title>
<meta name="description" content="${esc(config.description)}">
<link rel="alternate" type="application/rss+xml" title="모두의 시세 — 주요 시세 요약" href="/rss.xml">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#f4f6fb">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="모두의 시세">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(config.title)}">
<meta property="og:description" content="${esc(config.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="https://modoosise.com/assets/og.png">
<meta property="og:image:alt" content="모두의 시세 — 대한민국 모든 시세 한눈에">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(config.title)}">
<meta name="twitter:description" content="${esc(config.description)}">
<meta name="twitter:image" content="https://modoosise.com/assets/og.png">
<meta name="color-scheme" content="light dark">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/assets/style.css?v=${ASSET_VERSION}">
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<script type="application/ld+json">
${brandJsonLd(config, data, items)}
</script>
</head>
<body data-page="giftcard-brand" data-nav-page="giftcard" data-giftcard-brand="${esc(config.card)}">

${staticRegionBlock('header', staticHeader('giftcard', data.updatedAt))}

<main id="main" class="wrap">
  <div class="page-head">
    <nav class="breadcrumbs" aria-label="현재 위치"><a href="/">홈</a><span aria-hidden="true">›</span><a href="/giftcard">상품권시세</a><span aria-hidden="true">›</span><span>${esc(
      config.h1,
    )}</span></nav>
    <h1>${esc(config.h1)}</h1>
    <p class="lead">업체별 매입가와 판매가를 액면가별로 비교합니다.</p>
  </div>

  ${brandSubnav(config.key)}

  <section class="panel">
    <h2>${esc(config.card)}상품권 액면가별 시세 <span class="tag">자동 수집</span></h2>
    <p class="note">${uniqueShops.size}개 업체의 공개 시세 ${items.length}건 · <time datetime="${esc(
      data.updatedAt,
    )}">최종 갱신 ${updated}</time></p>
    <div class="grid grid-gc">${brandCards(items)}</div>
  </section>

  <section class="panel brand-guide">
    <h2>시세 읽는 법</h2>
    <div class="brand-facts">
      <div class="brand-fact"><h3>매입가</h3><p>상품권 업체에 내가 팔 때 받는 금액입니다. 높을수록 유리합니다.</p></div>
      <div class="brand-fact"><h3>판매가</h3><p>상품권 업체에서 내가 살 때 내는 금액입니다. 낮을수록 유리합니다.</p></div>
      <div class="brand-fact"><h3>액면가 대비 차감</h3><p>액면가와 표시 가격의 차이를 백분율로 나타냅니다. 일반적인 수익률 의미가 아닙니다.</p></div>
    </div>
  </section>

  <section class="panel brand-guide">
    <h2>${esc(config.guideTitle)}</h2>
    ${config.guide.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('\n    ')}
    <p><a href="${safeHttpUrl(
      config.officialUrl,
    )}" target="_blank" rel="noopener noreferrer">${esc(config.officialLabel)}에서 권종·사용 조건 확인</a></p>
  </section>

  <section class="panel">
    <h2>가격 출처와 수집 상태</h2>
    <p>업체가 공개한 시세 페이지를 매시간 확인해 정리합니다. 수집에 실패한 업체도 숨기지 않고 아래에 표시합니다.</p>
    <ul class="source-list">${sources}</ul>
  </section>

  <section class="panel brand-guide">
    <h2>거래 전 확인사항</h2>
    <ul>
      <li>표시 가격은 실제 거래를 보장하지 않으며 결제 방식, 상품권 상태, 수량, 방문 지점에 따라 달라질 수 있습니다.</li>
      <li>모바일 교환권과 지류 상품권은 같은 시세로 해석하지 말고 거래할 상품권 형태를 업체에 먼저 확인하세요.</li>
      <li>송금하거나 방문하기 직전에 해당 업체 사이트와 연락처에서 최종 가격·수수료·거래 조건을 다시 확인하세요.</li>
    </ul>
  </section>
</main>

${staticRegionBlock('footer', staticFooter)}

<script src="/assets/site-config.js?v=${ASSET_VERSION}"></script>
<script src="/assets/app.js?v=${ASSET_VERSION}"></script>
<script src="/assets/pages.js?v=${ASSET_VERSION}"></script>
</body>
</html>
`;
}

function replaceStaticRegion(source, key, rendered, file) {
  const start = `<!-- static-shell:${key}:start -->`;
  const end = `<!-- static-shell:${key}:end -->`;
  const starts = count(source, start);
  const ends = count(source, end);
  if (starts === 0 && ends === 0) return null;
  if (starts !== 1 || ends !== 1) {
    throw new Error(`${file}: static-shell ${key} 마커는 시작과 끝이 각각 정확히 1개여야 합니다.`);
  }
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  if (endAt < startAt) throw new Error(`${file}: static-shell ${key} 마커 순서가 잘못됐습니다.`);
  const lineAt = source.lastIndexOf('\n', startAt) + 1;
  const markerIndent = source.slice(lineAt, startAt);
  const content = `\n${indentBlock(rendered, markerIndent)}\n${markerIndent}`;
  return source.slice(0, startAt + start.length) + content + source.slice(endAt);
}

function staticRegionBlock(key, rendered) {
  return `<!-- static-shell:${key}:start -->\n${rendered.trim()}\n<!-- static-shell:${key}:end -->`;
}

function ensureMainTarget(source, file) {
  const main = source.match(/<main\b([^>]*)>/i);
  if (!main || main.index == null) throw new Error(`${file}: main 요소를 찾지 못했습니다.`);
  if (/\bid\s*=\s*["']main["']/i.test(main[0])) return source;
  if (/\bid\s*=/i.test(main[0])) throw new Error(`${file}: main 요소의 id는 main이어야 합니다.`);
  const replacement = `<main id="main"${main[1]}>`;
  return source.slice(0, main.index) + replacement + source.slice(main.index + main[0].length);
}

function ensureSiteConfigScript(source, file) {
  if (/<script\s+src=["'][^"']*assets\/site-config\.js/i.test(source)) return source;
  const app = source.match(/<script\s+src=(["'])(\/?assets\/)app\.js[^"']*\1[^>]*><\/script>/i);
  if (!app || app.index == null) throw new Error(`${file}: app.js 스크립트를 찾지 못했습니다.`);
  const script = `<script src="${app[2]}site-config.js?v=${ASSET_VERSION}"></script>\n`;
  return source.slice(0, app.index) + script + source.slice(app.index);
}

function upsertStaticShell(source, file, page, stamp, hideStatus = false) {
  const header = staticHeader(page, stamp, hideStatus);
  const replacedHeader = replaceStaticRegion(source, 'header', header, file);
  if (replacedHeader == null) {
    const body = source.match(/<body\b[^>]*>/i);
    if (!body || body.index == null) throw new Error(`${file}: body 요소를 찾지 못했습니다.`);
    const at = body.index + body[0].length;
    source = source.slice(0, at) + `\n\n${staticRegionBlock('header', header)}` + source.slice(at);
  } else {
    source = replacedHeader;
  }

  const replacedFooter = replaceStaticRegion(source, 'footer', staticFooter, file);
  if (replacedFooter == null) {
    const script = source.match(/<script src="\/?assets\/app\.js[^>]*><\/script>/i);
    if (!script || script.index == null) throw new Error(`${file}: app.js 스크립트를 찾지 못했습니다.`);
    source =
      source.slice(0, script.index) +
      `${staticRegionBlock('footer', staticFooter)}\n\n` +
      source.slice(script.index);
  } else {
    source = replacedFooter;
  }
  source = ensureMainTarget(source, file);
  return ensureSiteConfigScript(source, file);
}

function latestStamp(...values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.valueOf()))
    .sort((a, b) => b - a)[0]
    ?.toISOString();
}

function isoStamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`올바르지 않은 lastmod 값: ${value}`);
  return date.toISOString();
}

const xmlEsc = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function buildSitemap(pages) {
  const rows = pages.map(
    ({ pathname, lastmod, changefreq, priority }) =>
      `  <url><loc>${xmlEsc(`https://modoosise.com${pathname}`)}</loc><lastmod>${xmlEsc(
        /^\d{4}-\d{2}-\d{2}$/.test(lastmod) ? lastmod : isoStamp(lastmod),
      )}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</urlset>
`;
}

const [markets, dept, manualGift, lotto, oil, rates, hotdeals, realestate] = await Promise.all([
  readJson('data/markets.json'),
  readJson('data/giftcards-dept.json'),
  readJson('data/giftcards.json'),
  readJson('data/lotto.json'),
  readJson('data/oil.json'),
  readJson('data/rates.json'),
  readJson('data/hotdeals.json'),
  readJson('data/realestate.json'),
]);

for (const [label, value, key] of [
  ['markets', markets, 'items'],
  ['giftcards-dept', dept, 'items'],
  ['giftcards', manualGift, 'items'],
  ['lotto', lotto, 'rounds'],
  ['oil', oil, 'items'],
  ['rates', rates, 'items'],
]) {
  if (!Array.isArray(value[key])) throw new Error(`data/${label}.json: ${key} 배열이 없습니다.`);
}

const byId = new Map(markets.items.map((item) => [item.id, item]));
const pickIds = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);
const pickGroup = (group) => markets.items.filter((item) => item.group === group);
const marketGrid = (items) => items.map((item, index) => marketCard(item, index)).join('\n');

// 홈 데이터·마크업 — home-render.js 가 단일 소스입니다 (런타임 home.json 과 동일 함수).
// 상품권 이력은 첫 실행 전엔 없을 수 있으므로 없으면 전일대비 없이 렌더합니다.
let giftHistory = null;
try {
  giftHistory = await readJson('data/giftcards-history.json');
} catch {
  giftHistory = null;
}
const homeData = HOME_RENDER.composeHome({
  markets,
  rates,
  dept,
  manual: manualGift,
  realestate,
  lotto,
  giftHistory,
});
if (!homeData.markets.length) throw new Error('홈 프리렌더에 필요한 시세 데이터가 없습니다.');

const faces = [...new Set(dept.items.map((item) => Number(item.face)))].sort((a, b) => a - b);
if (!faces.length || faces.some((value) => !Number.isFinite(value))) {
  throw new Error('상품권 액면가 데이터가 올바르지 않습니다.');
}
const defaultFace = faces.includes(100000) ? 100000 : faces[0];
const faceButtons = faces
  .map(
    (value) =>
      `<button type="button" class="seg-btn" data-face="${value}" aria-pressed="${value === defaultFace}">${faceLabel(value)}</button>`,
  )
  .join('\n');
const sourceRows = dept.shops
  .map(
    (shop) =>
      `<li><a href="${safeHttpUrl(shop.site)}" target="_blank" rel="noopener noreferrer nofollow">${esc(shop.name)}</a><span class="src-state ${shop.ok ? 'ok' : 'ng'}">${shop.ok ? `${esc(shop.count)}건` : '수집 실패'}</span></li>`,
  )
  .join('\n');
const successfulShops = dept.shops.filter((shop) => shop.ok).length;
const deptNote = `${successfulShops}개 업체 공식 시세 페이지에서 직접 수집했습니다. 최종 갱신: ${formatStamp(dept.updatedAt)}`;
const pricedManual = manualGift.items.filter((item) => typeof item.rate === 'number');
const manualNote = pricedManual.length
  ? `수동 관리 데이터입니다. 최종 갱신: ${formatStamp(manualGift.updatedAt)}`
  : '문화상품권·해피머니·온라인 캐시 등은 업체가 시세를 공개하지 않아 수동으로 입력합니다. 현재 확인 가능한 시세가 없습니다.';

const renderPlan = {
  'index.html': [
    ['hero-live', HOME_RENDER.heroLive(homeData)],
    ['hero-stats', HOME_RENDER.heroStats(homeData)],
    ['hero-pill', HOME_RENDER.heroPill(homeData)],
    ['cat-grid', HOME_RENDER.catCards(homeData)],
    ['kpi-grid', HOME_RENDER.kpiCards(homeData)],
    ['btc-block', HOME_RENDER.btcBlock(homeData)],
    ['gift-rows', HOME_RENDER.giftRows(homeData)],
    ['quick-grid', HOME_RENDER.quickCards()],
  ],
  'coin.html': [['grid-coin', marketGrid(pickGroup('coin'))]],
  'stock.html': [
    ['grid-stock', marketGrid(pickIds(['kospi', 'spx', 'ndq', 'dji', 'nkx', 'hsi', 'sse', 'dax']))],
    ['grid-stock-items', marketGrid(pickGroup('stock'))],
  ],
  'kosdaq.html': [
    ['grid-kosdaq', marketGrid(pickIds(['kosdaq']))],
    ['grid-kosdaq-items', marketGrid(pickGroup('kosdaq_stock'))],
  ],
  'fx.html': [['grid-fx', marketGrid(pickGroup('fx'))]],
  'metal.html': [['grid-metal', marketGrid(pickIds(['gold_krx', 'gold_don', 'gold', 'silver', 'plat', 'palladium']))]],
  'energy.html': [
    ['grid-energy', marketGrid(pickIds(['wti', 'brent', 'natgas', 'copper', 'wheat', 'corn']))],
    ['grid-oil', marketGrid(oil.items)],
  ],
  'macro.html': [
    ['grid-macro', marketGrid(pickIds(['dxy', 'vix', 'ust10', 'kimchi']))],
    ['grid-rates', marketGrid(rates.items)],
  ],
  'giftcard.html': [
    ['giftcard-faq-jsonld', giftCardFaqJsonLd()],
    ['dept-note', deptNote],
    ['face-seg', faceButtons],
    ['grid-dept', deptCards(dept.items, defaultFace)],
    ['dept-sources', sourceRows],
    ['gift-note', manualNote],
    ['gift-rows', manualGiftRows(manualGift)],
    ['giftcard-faq', giftCardFaqHtml()],
  ],
};

const shellPlan = {
  'index.html': { page: 'home', stamp: markets.updatedAt },
  'coin.html': { page: 'coin', stamp: markets.updatedAt },
  'stock.html': { page: 'stock', stamp: markets.updatedAt },
  'kosdaq.html': { page: 'kosdaq', stamp: markets.updatedAt },
  'fx.html': { page: 'fx', stamp: markets.updatedAt },
  'metal.html': { page: 'metal', stamp: markets.updatedAt },
  'energy.html': { page: 'energy', stamp: latestStamp(markets.updatedAt, oil.updatedAt) },
  'macro.html': { page: 'macro', stamp: latestStamp(markets.updatedAt, rates.updatedAt) },
  'giftcard.html': { page: 'giftcard', stamp: dept.updatedAt },
  'hotdeal.html': { page: 'hotdeal', stamp: hotdeals.updatedAt },
  'realestate.html': { page: 'realestate', stamp: realestate.updatedAt },
  'lotto.html': { page: 'lotto', stamp: lotto.updatedAt },
  'shopping.html': { page: 'shopping-retired', hideStatus: true },
  'about.html': { page: 'about', hideStatus: true },
};

const documents = new Map();
async function getDocument(file) {
  if (!documents.has(file)) {
    const absolute = path.join(root, file);
    let original = '';
    try {
      original = await readFile(absolute, 'utf8');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    documents.set(file, { file, absolute, original, next: original });
  }
  return documents.get(file);
}

for (const [file, regions] of Object.entries(renderPlan)) {
  const document = await getDocument(file);
  for (const [key, html] of regions) {
    document.next = replaceRegion(document.next, key, html, file);
  }
}

for (const [file, shell] of Object.entries(shellPlan)) {
  const document = await getDocument(file);
  document.next = upsertStaticShell(
    document.next,
    file,
    shell.page,
    shell.stamp,
    shell.hideStatus,
  );
  document.next = document.next.replace(
    /((?:\/)?assets\/(?:style\.css|site-config\.js|app\.js|pages\.js))\?v=[^"']+/g,
    `$1?v=${ASSET_VERSION}`,
  );
}

const brandLastmods = new Map();
for (const config of BRAND_PAGES) {
  const document = await getDocument(config.file);
  try {
    document.next = renderBrandPage(config, dept);
    brandLastmods.set(config.key, dept.updatedAt);
  } catch (error) {
    if (!document.original) throw error;
    const snapshotStamp = document.original.match(/<time datetime="([^"]+)"/)?.[1];
    if (!snapshotStamp) throw error;
    document.next = document.original;
    brandLastmods.set(config.key, snapshotStamp);
    console.warn(`${config.card} 상품권 데이터가 게시 기준에 못 미쳐 기존 상세 페이지를 유지합니다.`);
  }
}

const sitemapPages = [
  {
    pathname: '/',
    lastmod: latestStamp(markets.updatedAt, dept.updatedAt, lotto.updatedAt),
    changefreq: 'hourly',
    priority: '1.0',
  },
  { pathname: '/coin', lastmod: markets.updatedAt, changefreq: 'hourly', priority: '0.9' },
  { pathname: '/stock', lastmod: markets.updatedAt, changefreq: 'hourly', priority: '0.9' },
  { pathname: '/kosdaq', lastmod: markets.updatedAt, changefreq: 'hourly', priority: '0.8' },
  { pathname: '/fx', lastmod: markets.updatedAt, changefreq: 'hourly', priority: '0.8' },
  { pathname: '/metal', lastmod: markets.updatedAt, changefreq: 'hourly', priority: '0.8' },
  {
    pathname: '/energy',
    lastmod: latestStamp(markets.updatedAt, oil.updatedAt),
    changefreq: 'hourly',
    priority: '0.8',
  },
  {
    pathname: '/macro',
    lastmod: latestStamp(markets.updatedAt, rates.updatedAt),
    changefreq: 'hourly',
    priority: '0.8',
  },
  { pathname: '/giftcard', lastmod: dept.updatedAt, changefreq: 'hourly', priority: '0.8' },
  ...BRAND_PAGES.map(({ key, pathname }) => ({
    pathname,
    lastmod: brandLastmods.get(key),
    changefreq: 'hourly',
    priority: '0.7',
  })),
  { pathname: '/hotdeal', lastmod: hotdeals.updatedAt, changefreq: 'hourly', priority: '0.8' },
  {
    pathname: '/realestate',
    lastmod: realestate.updatedAt,
    changefreq: 'daily',
    priority: '0.8',
  },
  { pathname: '/lotto', lastmod: lotto.updatedAt, changefreq: 'weekly', priority: '0.7' },
  { pathname: '/about', lastmod: '2026-08-04', changefreq: 'monthly', priority: '0.6' },
];
const sitemapDocument = await getDocument('sitemap.xml');
sitemapDocument.next = buildSitemap(sitemapPages);

const updates = [...documents.values()].filter(({ next, original, file }) => {
  if (/\b(?:undefined|NaN|Infinity)\b/.test(next)) {
    throw new Error(`${file}: 생성 결과에 올바르지 않은 값이 있습니다.`);
  }
  return next !== original;
});

if (checkOnly) {
  if (updates.length) {
    console.error(`정적 산출물이 최신 데이터와 다릅니다: ${updates.map(({ file }) => file).join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('정적 산출물이 최신 데이터와 일치합니다.');
  }
} else {
  for (const { absolute, next } of updates) {
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, next, 'utf8');
  }
  console.log(updates.length ? `정적 산출물 갱신: ${updates.map(({ file }) => file).join(', ')}` : '정적 산출물 변경 없음');
}
