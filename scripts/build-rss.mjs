// 자체 시세 요약 RSS 피드를 생성합니다. (rss.xml)
//
// 남의 뉴스(data/news.json)를 재배포하지 않습니다 — 저작권 문제이자
// 검색엔진에 '중복/재발행 콘텐츠'로 감점됩니다. 우리가 직접 집계한
// 시세 스냅샷만 항목으로 만듭니다.
//
// 시간당 1개 항목(정시 스냅샷)을 최근 48개(약 2일)까지 누적합니다.
import { readFile } from 'node:fs/promises';
import { readJSON, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/rss.json'; // 누적 상태
const XML = 'rss.xml';
const ORIGIN = 'https://modoosise.com';
const KEEP = 48;

const num = (n) => Number(n).toLocaleString('ko-KR');

async function loadJSON(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

const markets = await loadJSON('data/markets.json');
const lotto = await loadJSON('data/lotto.json');
if (!markets) throw new Error('markets.json 이 없습니다');

const byId = new Map(markets.items.map((i) => [i.id, i]));
const g = (id) => byId.get(id);

// 대표 지표로 한 줄 요약을 만듭니다.
const parts = [];
const push = (id, suffix = '') => {
  const it = g(id);
  if (it) parts.push(`${it.name} ${num(it.price)}${suffix}`);
};
push('kospi');
push('btc', '원');
push('usdkrw', '원');
push('gold_don', '원');
push('wti', ' USD');

const stampKST = nowKST();
const dateHour = stampKST.slice(0, 13); // 시간 단위 중복 방지 키

// 항목 제목·본문
const title = `${stampKST.slice(0, 16).replace('T', ' ')} 주요 시세 요약`;
const summary = parts.join(' · ');
let body = `<p>${summary}</p>`;
if (lotto?.rounds?.length) {
  const r = lotto.rounds.at(-1);
  body += `<p>로또 ${r.round}회 당첨번호: ${r.numbers.join(', ')} + 보너스 ${r.bonus}</p>`;
}
body += `<p><a href="${ORIGIN}/">모두의 시세에서 전체 시세 보기</a></p>`;

// 누적 상태 갱신 (같은 시간대면 덮어씀)
const state = await readJSON(OUT, { entries: [] });
const entries = state.entries.filter((e) => e.dateHour !== dateHour);
entries.unshift({
  dateHour,
  guid: `${ORIGIN}/#${dateHour}`,
  title,
  body,
  pubDate: new Date(stampKST).toUTCString(),
  isoDate: stampKST,
});
const kept = entries.slice(0, KEEP);
await writeJSON(OUT, { entries: kept });

// RSS 2.0 XML 생성
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const items = kept
  .map(
    (e) => `    <item>
      <title>${esc(e.title)}</title>
      <link>${ORIGIN}/</link>
      <guid isPermaLink="false">${esc(e.guid)}</guid>
      <pubDate>${e.pubDate}</pubDate>
      <description><![CDATA[${e.body}]]></description>
    </item>`
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>모두의 시세 — 주요 시세 요약</title>
    <link>${ORIGIN}/</link>
    <atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>
    <description>코인·주식·환율·금·유가 주요 시세를 매시간 요약해 제공합니다.</description>
    <language>ko</language>
    <lastBuildDate>${new Date(stampKST).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

const { writeFile } = await import('node:fs/promises');
await writeFile(XML, xml, 'utf8');
console.log(`RSS 생성: ${kept.length}개 항목 (최신: ${title})`);
