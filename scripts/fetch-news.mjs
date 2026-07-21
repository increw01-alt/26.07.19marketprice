// 메뉴별 관련 뉴스를 구글뉴스 RSS 에서 수집합니다. (키 불필요)
// 링크는 news.google.com 리다이렉트 URL 그대로 저장합니다 — 원문 URL 을 얻으려면
// 기사마다 추가 요청이 필요해서, 매시간 수집에는 과합니다.
import { getText, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/news.json';
const PER_TOPIC = 8;

/** 메뉴 id → 검색어. 페이지 쪽(pages.js)은 이 id 로 뉴스를 찾습니다. */
const TOPICS = [
  { id: 'coin', q: '암호화폐 비트코인 시세' },
  { id: 'stock', q: '코스피 증시' },
  { id: 'kosdaq', q: '코스닥' },
  { id: 'fx', q: '원달러 환율' },
  { id: 'metal', q: '금값 금시세' },
  { id: 'energy', q: '국제유가 WTI 원자재' },
  { id: 'macro', q: '환율 금리 증시 경제지표' },
  { id: 'giftcard', q: '상품권 시세' },
  { id: 'realestate', q: '아파트 실거래가' },
  { id: 'lotto', q: '로또 판매' },
];

const rss = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;

/** XML 엔티티만 풉니다. HTML 이스케이프는 렌더링 쪽 책임입니다. */
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

function parseItems(xml) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const pick = (re) => {
      const r = it.match(re);
      return r ? decode(r[1]) : '';
    };
    let title = pick(/<title>([\s\S]*?)<\/title>/);
    const link = pick(/<link>([\s\S]*?)<\/link>/);
    const pubDate = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const source = pick(/<source[^>]*>([\s\S]*?)<\/source>/);
    if (!title || !link) continue;

    // 구글뉴스 제목은 "제목 - 언론사" 형식이라 출처가 중복됩니다.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));

    const ts = Date.parse(pubDate);
    out.push({
      title,
      link,
      source: source || null,
      date: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
    });
  }
  return out;
}

const topics = {};
let okCount = 0;

for (const t of TOPICS) {
  try {
    const xml = await getText(rss(t.q));
    const items = parseItems(xml)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, PER_TOPIC);
    if (!items.length) throw new Error('기사 0건');
    topics[t.id] = items;
    okCount++;
    console.log(`${t.id}: ${items.length}건 (${items[0].title.slice(0, 30)}…)`);
  } catch (err) {
    console.error(`${t.id} 실패: ${err.message}`);
    topics[t.id] = [];
  }
  await new Promise((r) => setTimeout(r, 500)); // 요청 간격
}

if (!okCount) throw new Error('모든 토픽 수집 실패');

await writeJSON(OUT, { updatedAt: nowKST(), topics });
console.log(`done: ${okCount}/${TOPICS.length} topics`);
