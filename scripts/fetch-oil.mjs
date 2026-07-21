// 오피넷(한국석유공사) — 전국 주유소 평균 판매가를 수집합니다.
// 인증키는 환경변수 OPINET_KEY 로만 받습니다 (GitHub Actions Secret).
import { getJSON, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/oil.json';

const KEY = process.env.OPINET_KEY;
if (!KEY) {
  console.error('환경변수 OPINET_KEY 가 없습니다.');
  process.exit(1);
}

/** 오피넷 제품코드 → 표기명 */
const PRODUCTS = {
  B034: { id: 'premium', name: '고급 휘발유' },
  B027: { id: 'gasoline', name: '휘발유' },
  D047: { id: 'diesel', name: '경유' },
  C004: { id: 'kerosene', name: '실내등유' },
  K015: { id: 'lpg', name: 'LPG (부탄)' },
};

const res = await getJSON(`https://www.opinet.co.kr/api/avgAllPrice.do?out=json&code=${KEY}`);
const rows = res?.RESULT?.OIL;
if (!Array.isArray(rows) || !rows.length) {
  throw new Error(`예상치 못한 응답: ${JSON.stringify(res).slice(0, 200)}`);
}

const items = [];
for (const r of rows) {
  const p = PRODUCTS[r.PRODCD];
  if (!p) {
    console.warn(`알 수 없는 제품코드 건너뜀: ${r.PRODCD}`);
    continue;
  }
  const price = Number(r.PRICE);
  const diff = Number(r.DIFF);
  if (!Number.isFinite(price) || price <= 0) continue;
  items.push({
    id: p.id,
    name: p.name,
    group: 'oil',
    unit: '원/L',
    price: Math.round(price * 100) / 100,
    change: Number.isFinite(diff) ? diff : null, // 전일 대비 (원)
    changePct: Number.isFinite(diff) && price - diff > 0
      ? ((diff / (price - diff)) * 100)
      : null,
    date: r.TRADE_DT || null,
    spark: [],
    note: '전국 주유소 평균 판매가 (오피넷)',
  });
  console.log(`${p.name}: ${price}원/L (전일 대비 ${diff})`);
}

if (!items.length) throw new Error('유가 항목이 없습니다');
await writeJSON(OUT, { updatedAt: nowKST(), items });
console.log(`done: ${items.length}개`);
