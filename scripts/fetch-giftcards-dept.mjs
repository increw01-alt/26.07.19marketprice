// 백화점 상품권 매입/판매 시세 — 각 상품권 업체 공식 시세 페이지에서 직접 수집합니다.
// 취합 사이트를 거치지 않고 1차 출처에서만 가져오며, 업체별 원문 링크를 함께 저장합니다.
import { getText, writeJSON, nowKST } from './lib.mjs';
import { pathToFileURL } from 'node:url';

const OUT = 'data/giftcards-dept.json';

/** 업체별 시세 페이지와 파서 */
const SHOPS = [
  { id: 'citypay', name: '씨티페이', site: 'https://city-pay.co.kr/', url: 'https://city-pay.co.kr/', parse: parseCitypay },
  { id: 'choigo', name: '최고상품권', site: 'https://www.choigoticket.com/', url: 'https://www.choigoticket.com/html/sub0101.php', parse: parseTable3 },
  { id: 'mingren', name: '명인상품권', site: 'https://mingren.co.kr/', url: 'https://mingren.co.kr/sub1_1.php', parse: parseTable3 },
];

// ---------- HTML 유틸 ----------
const stripTags = (s) => s.replace(/<[^>]+>/g, ' ');
const codePoint = (raw, radix) => {
  const value = Number.parseInt(raw, radix);
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : ' ';
};
const decodeOnce = (s) =>
  s
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => codePoint(hex, 16))
    .replace(/&#(\d+);?/g, (_, dec) => codePoint(dec, 10))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
const decode = (input) => {
  let value = String(input ?? '');
  // Decode nested entities before stripping tags so encoded markup cannot reappear later.
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(value);
    if (next === value) break;
    value = next;
  }
  return value;
};
export const clean = (s) =>
  stripTags(decode(s))
    .replace(/[<>&]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

function rows(html) {
  return [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
}
function cells(row) {
  return [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
}

/** "96,300원 (3.70%)" → { price: 96300, rate: 3.7 } */
function parseMoney(text) {
  const price = text.match(/([\d,]{4,})\s*원/);
  const rate = text.match(/\(?\s*(\d+(?:\.\d+)?)\s*%/);
  if (!price) return null;
  const n = Number(price[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return { price: n, rate: rate ? Number(rate[1]) : null };
}

/**
 * "롯데백화점 10만원권", "롯데 상품권 (50만원)", "신세계상품권(5만원)"
 *   → { card: '롯데', face: 100000, label: 원문 상품권명 }
 */
function parseCardName(raw) {
  const label = clean(raw).replace(/[★☆]/g, ' ').replace(/\s+/g, ' ').trim();
  const face = label.match(/(\d+)\s*만\s*원/);
  if (!face) return null;

  let card = label
    .replace(/\(?\s*\d+\s*만\s*원\s*권?\s*\)?/g, ' ')
    .replace(/상품권/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // "백화점 1만원권(롯데,신세계,현대)" 처럼 여러 백화점 공통으로 쓰이는 상품
  if (card.includes(',')) card = '백화점 공통';
  else card = card.replace(/백화점/g, '').replace(/\s+/g, ' ').trim();

  if (!card) return null;

  return { card, label, face: Number(face[1]) * 10000, gift: /증정/.test(label) };
}

/**
 * 액면가 대비 말이 되는 가격인지 확인합니다.
 * 업체 사이트의 오기(예: 50만원권 칸에 10만원권 가격)를 걸러냅니다.
 */
function sane(price, face) {
  return Number.isFinite(price) && price > face * 0.5 && price < face;
}

// ---------- 파서 ----------

/** 씨티페이: 매입 칸에 이체·현금이 함께 들어 있습니다. */
function parseCitypay(html) {
  const out = [];
  for (const row of rows(html)) {
    const c = cells(row);
    if (c.length < 3) continue;
    const name = parseCardName(c[0]);
    if (!name || name.gift) continue;

    const sell = parseMoney(clean(c[2]));
    const buyText = clean(c[1]);

    // "96,300원 (3.70%) 이체 96,250원 (3.75%) 현금" → 결제수단별로 분리
    const parts = [...buyText.matchAll(/([\d,]{4,})\s*원\s*\(?\s*(\d+(?:\.\d+)?)\s*%\)?\s*(이체|현금)?/g)];
    for (const p of parts) {
      const price = Number(p[1].replace(/,/g, ''));
      if (!sane(price, name.face)) continue; // 0% 증정용·업체 오기 제외
      const sellOk = sell && sane(sell.price, name.face);
      out.push({
        card: name.card,
        label: name.label,
        face: name.face,
        method: p[3] || null,
        buy: price,
        buyRate: Number(p[2]),
        sell: sellOk ? sell.price : null,
        sellRate: sellOk ? sell.rate : null,
      });
    }
  }
  return out;
}

/** 최고·명인 공통: 상품권명 | 매입가 | 판매가 (3열) */
function parseTable3(html) {
  const out = [];
  for (const row of rows(html)) {
    const c = cells(row);
    if (c.length < 3) continue;
    const name = parseCardName(c[0]);
    if (!name || name.gift) continue;

    const buy = parseMoney(clean(c[1]));
    const sell = parseMoney(clean(c[2]));
    const buyOk = buy && sane(buy.price, name.face);
    const sellOk = sell && sane(sell.price, name.face);
    if (!buyOk && !sellOk) continue;

    out.push({
      card: name.card,
      label: name.label,
      face: name.face,
      method: null,
      buy: buyOk ? buy.price : null,
      buyRate: buyOk ? buy.rate : null,
      sell: sellOk ? sell.price : null,
      sellRate: sellOk ? sell.rate : null,
    });
  }
  return out;
}

// ---------- 실행 ----------
async function main() {
  const shops = [];
  const items = [];

  for (const shop of SHOPS) {
    try {
      const html = await getText(shop.url);
      const parsed = shop.parse(html);
      if (!parsed.length) throw new Error('파싱 결과 0건 — 페이지 구조가 바뀌었을 수 있습니다');

      for (const p of parsed) items.push({ shopId: shop.id, shop: shop.name, ...p });
      shops.push({ id: shop.id, name: shop.name, site: shop.site, url: shop.url, ok: true, count: parsed.length });
      console.log(`${shop.name}: ${parsed.length}건`);
    } catch (err) {
      shops.push({ id: shop.id, name: shop.name, site: shop.site, url: shop.url, ok: false, count: 0, error: String(err.message || err) });
      console.error(`${shop.name} 실패: ${err.message || err}`);
    }
    // 상대 서버 배려 — 업체 간 1초 간격
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!items.length) throw new Error('모든 업체 수집에 실패했습니다');

  await writeJSON(OUT, {
    updatedAt: nowKST(),
    note: '각 상품권 업체 공식 시세 페이지에서 직접 수집한 값입니다. 실제 거래 조건은 업체 사이트에서 확인하세요.',
    shops,
    items,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
