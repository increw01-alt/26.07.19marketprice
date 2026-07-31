// 핫딜 커뮤니티의 공식 RSS 피드에서 딜을 수집합니다. (키 불필요)
//
// RSS 는 각 사이트가 배포(신디케이션) 목적으로 공식 제공하는 피드입니다.
// HTML 크롤링과 달리 재유통이 전제된 채널이라, 제목·링크를 발굴 신호로 쓰고
// 원문 링크를 함께 노출하는 이 방식은 저작권·ToS 위험이 낮습니다.
// 원문 본문은 가져오지 않으며(제목만), 화면에 반드시 출처와 원문 링크를 답니다.
import { getText, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/hotdeals.json';
const MAX = 40; // 피드에 유지할 최신 딜 수

/** 수집 대상 — 각 사이트의 핫딜 게시판 RSS */
const SOURCES = [
  { id: 'ppomppu', name: '뽐뿌', url: 'http://www.ppomppu.co.kr/rss.php?id=ppomppu' },
  { id: 'ruliweb', name: '루리웹', url: 'https://bbs.ruliweb.com/market/board/1020/rss' },
];

/** XML 엔티티만 풉니다. HTML 이스케이프는 렌더링(pages.js) 책임입니다. */
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();

/** 딜 제목에서 판매처([대괄호])와 가격((…원))을 뽑아냅니다.
 *  예: "[네이버]목우촌 팝콘치킨 420g, 3개 (9,900원/네멤무료)" */
function parseTitle(raw) {
  let title = raw;
  let mall = null;
  const mm = title.match(/^\s*\[([^\]]{1,20})\]\s*/);
  if (mm) {
    mall = mm[1].trim();
    title = title.slice(mm[0].length);
  }
  // 가장 뒤쪽 괄호의 "숫자원" 을 가격으로 봅니다 (원화만).
  let price = null;
  const pm = [...raw.matchAll(/([\d][\d,]*)\s*원/g)].pop();
  if (pm) {
    const n = Number(pm[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0) price = n;
  }
  return { title: title.trim(), mall, price };
}

function parseItems(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const it = m[1];
    const pick = (re) => {
      const r = it.match(re);
      return r ? decode(r[1]) : '';
    };
    const rawTitle = pick(/<title>([\s\S]*?)<\/title>/);
    const link = pick(/<link>([\s\S]*?)<\/link>/);
    const pubDate = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const category = pick(/<category>([\s\S]*?)<\/category>/);
    if (!rawTitle || !link) continue;

    const { title, mall, price } = parseTitle(rawTitle);
    if (!title) continue;
    const ts = Date.parse(pubDate);
    out.push({
      title,
      mall,
      price,
      category: category || null,
      link,
      source: src.name,
      sourceId: src.id,
      date: Number.isFinite(ts) ? new Date(ts).toISOString() : null,
    });
  }
  return out;
}

const all = [];
let okCount = 0;

for (const src of SOURCES) {
  try {
    const xml = await getText(src.url);
    const items = parseItems(xml, src);
    if (!items.length) throw new Error('딜 0건 — RSS 구조가 바뀌었을 수 있습니다');
    all.push(...items);
    okCount++;
    console.log(`${src.name}: ${items.length}건 (${items[0].title.slice(0, 30)}…)`);
  } catch (err) {
    console.error(`${src.name} 실패: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 800)); // 요청 간격 (서버 배려)
}

if (!okCount) throw new Error('모든 소스 수집 실패');

// 링크 기준 중복 제거 후 최신순 상위 MAX 개
const seen = new Set();
const deals = all
  .filter((d) => (seen.has(d.link) ? false : (seen.add(d.link), true)))
  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  .slice(0, MAX);

await writeJSON(OUT, { updatedAt: nowKST(), deals });
console.log(`done: ${deals.length}건 (${okCount}/${SOURCES.length} 소스)`);
