// [임시 실험] 핫딜 40건을 네이버 쇼핑에 매칭해 정확도를 눈으로 확인합니다.
// 결과를 Actions 로그로 출력만 하고, 파일은 쓰지 않습니다.
// 판단이 끝나면 이 스크립트와 experiment-match.yml 은 삭제합니다.
import { getJSON, readJSON } from './lib.mjs';

const ID = process.env.NAVER_ID;
const SECRET = process.env.NAVER_SECRET;
if (!ID || !SECRET) {
  console.error('NAVER_ID / NAVER_SECRET 없음');
  process.exit(1);
}
const headers = { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET };
const API = 'https://openapi.naver.com/v1/search/shop.json';

const strip = (s) =>
  String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/** 딜 제목 → 검색어: 괄호(가격·배송) 제거 + 흔한 노이즈 토큰 제거 */
function toQuery(title) {
  return title
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/무료배송|무료|특가|최저가|핫딜|쿠폰|카드할인|행사/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 한글/영숫자 2글자+ 토큰 집합 */
const tokens = (s) =>
  new Set((s.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || []));

/** query 토큰이 매치 제목에 얼마나 포함되는지 (0~1) */
function containment(q, t) {
  const a = tokens(q), b = tokens(t);
  if (!a.size) return 0;
  let hit = 0;
  for (const x of a) if (b.has(x)) hit++;
  return hit / a.size;
}

async function naver(query) {
  const url = `${API}?query=${encodeURIComponent(query)}&display=30&sort=sim`;
  const res = await getJSON(url, { headers });
  const items = Array.isArray(res.items) ? res.items : [];
  // 카탈로그 제외한 실제 판매처만
  const real = items.filter(
    (it) => !/\/catalog\//.test(it.link) && strip(it.mallName) !== '네이버' && Number(it.lprice) > 0
  );
  if (!real.length) return null;
  const top = real[0]; // 정확도 1위 (매치 판정용)
  const low = real.reduce((m, it) => Math.min(m, Number(it.lprice)), Infinity);
  return { topTitle: strip(top.title), low, count: real.length };
}

const data = await readJSON('data/hotdeals.json', { deals: [] });
const deals = data.deals.slice(0, 40);
console.log(`핫딜 ${deals.length}건 매칭 실험 시작\n`);

let ok = 0, weak = 0, nodata = 0;
for (const d of deals) {
  const q = toQuery(d.title);
  let r = null;
  try {
    r = await naver(q);
  } catch (e) {
    console.log(`✗ ERROR  ${d.title.slice(0, 30)} — ${e.message}`);
    await new Promise((s) => setTimeout(s, 300));
    continue;
  }
  if (!r) {
    nodata++;
    console.log(`○ NODATA [${d.mall || '?'}] ${d.title.slice(0, 34)} | 딜 ${d.price || '?'}`);
  } else {
    const conf = containment(q, r.topTitle);
    const grade = conf >= 0.6 ? 'OK  ' : conf >= 0.35 ? 'WEAK' : 'MISS';
    if (grade === 'OK  ') ok++; else weak++;
    const diff = d.price ? Math.round(((r.low - d.price) / d.price) * 100) : null;
    const diffStr = diff == null ? '?' : diff > 0 ? `딜이 ${diff}% 저렴` : diff < 0 ? `딜이 ${-diff}% 비쌈` : '동일';
    console.log(
      `● ${grade}(${conf.toFixed(2)}) [${d.mall || '?'}] 딜"${d.title.slice(0, 26)}" ${d.price || '?'}원\n` +
      `        └ 네이버최저 ${r.low.toLocaleString()}원 (${diffStr}) | 매치"${r.topTitle.slice(0, 40)}"`
    );
  }
  await new Promise((s) => setTimeout(s, 300));
}

console.log(`\n=== 요약 ===`);
console.log(`OK(매치 확실) ${ok} · WEAK/MISS(의심) ${weak} · NODATA(결과없음) ${nodata} / 총 ${deals.length}`);
console.log(`→ 신뢰도 필터로 "OK"만 배지 달면 약 ${Math.round((ok / deals.length) * 100)}% 딜에 가격비교가 붙음`);
