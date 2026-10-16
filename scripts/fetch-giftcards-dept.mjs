// 백화점 상품권 매입/판매 시세 — 각 상품권 업체 공식 시세 페이지에서 직접 수집합니다.
// 취합 사이트를 거치지 않고 1차 출처에서만 가져오며, 업체별 원문 링크를 함께 저장합니다.
import { getText, writeJSON, nowKST } from './lib.mjs';
import { pathToFileURL } from 'node:url';

const OUT = 'data/giftcards-dept.json';

/** 업체별 시세 페이지와 파서 */
const SHOPS = [
  { id: 'citypay', name: '씨티페이', site: 'https://city-pay.co.kr/', url: 'https://city-pay.co.kr/', parse: parseCitypay },
  { id: 'choigo', name: '최고상품권', site: 'https://www.choigoticket.com/', url: 'https://www.choigoticket.com/html/sub0101.php', parse: parseTable3 },
  { id: 'meee', name: '미래상품권', site: 'https://meee.co.kr/', url: 'https://meee.co.kr/', parse: parseMeee },
  { id: 'mingren', name: '명인상품권', site: 'https://mingren.co.kr/', url: 'https://mingren.co.kr/', parse: parseMingren },
  { id: 'wooticket', name: '우천상품권', site: 'http://www.wooticket.com/', url: 'http://www.wooticket.com/price_status.php', encoding: 'euc-kr', parse: parseWooticket },
  { id: 'worldticket', name: '월드티켓상품권', site: 'https://myeongdongworldticket.co.kr/', url: 'https://myeongdongworldticket.co.kr/sub/sub01_01.php', parse: parseWorldticket },
  { id: 'xegift', name: '엑스이상품권', site: 'http://xegift.co.kr/', url: 'http://xegift.co.kr/html/sub0101.php', parse: parseXegift },
  { id: 'centralgift', name: '중앙상품권', site: 'https://centralgift.imweb.me/', url: 'https://centralgift.imweb.me/', parse: parseCentralgift },
  { id: 'woorist', name: '우리에스티', site: 'http://woorist.co.kr/', url: 'http://woorist.co.kr/happyshop/show_pricelist_woori.php', encoding: 'euc-kr', parse: parseWoorist },
  { id: 'giftdept', name: '상품권백화점', site: 'http://www.xn--zf0bt1zcnd5pj69p6qc.com/', url: 'http://www.xn--zf0bt1zcnd5pj69p6qc.com/', parse: parseGiftdept },
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

// ---- 우리에스티 (http://woorist.co.kr/) ----
/**
 * 우리에스티(woorist): 상품권명 | 액면가 | 매입가 [할인율] | 판매가 [할인율] | 장바구니
 * EUC-KR 페이지라서 호출 측이 new TextDecoder('euc-kr') 로 디코딩한 문자열을 넘겨야 합니다.
 * 가격에 '원' 표기가 없고 "95,600 [4.40 %]" 꼴이라 parseMoney 대신 전용 헬퍼를 씁니다.
 */
function parseWoorist(html) {
  const FACES = new Set([10000, 50000, 100000, 500000]);
  // 백화점 상품권이 아닌 행(농협·금강제화·기프트카드·주유권·문화상품권·SPC 등) 제외
  const NON_DEPT = /주유|기프트|문화|농협|농산물|금강|제화|이랜드|삼성|SPC|파리|해피머니|도서|컬처|온누리|외식|카드|모바일/i;
  const DEPT = [
    [/신세계|이마트/, '신세계'], [/롯데/, '롯데'], [/현대/, '현대'],
    [/갤러리아/, '갤러리아'], [/국민관광/, '국민관광'], [/AK|에이케이/i, 'AK'],
  ];
  const deptCard = (name) => {
    if (NON_DEPT.test(name.label)) return null;
    if (name.card === '백화점 공통') return /백화점/.test(name.label) ? name.card : null;
    const hit = DEPT.find(([re]) => re.test(name.card));
    return hit ? hit[1] : null;
  };
  // "95,600 [4.40 %]" → { price: 95600, rate: 4.4 }
  const money = (cell) => {
    const t = clean(cell);
    if (!t || /매입중지|판매중지|시세문의|문의/.test(t)) return null;
    const price = t.match(/(\d{1,3}(?:,\d{3})+|\d{4,})/);
    const rate = t.match(/\[\s*(\d+(?:\.\d+)?)\s*%/);
    if (!price) return null;
    const n = Number(price[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return { price: n, rate: rate ? Number(rate[1]) : null };
  };
  // bgcolor 로 매입(#F3FEFF)/판매(#FFF6F6) 칸을 찾고, 없으면 자리(2,3)로 돌아갑니다.
  const cellByColor = (row, color) => {
    const m = row.match(new RegExp(`<td[^>]*bgcolor=['"]?#?${color}['"]?[^>]*>([\\s\\S]*?)<\\/td>`, 'i'));
    return m ? m[1] : null;
  };

  const out = [];
  for (const raw of rows(html)) {
    const row = raw.replace(/<!--[\s\S]*?-->/g, ''); // 주석 처리된 <td> 가 열 번호를 밀지 않도록
    const c = cells(row);
    if (c.length < 4) continue;
    const name = parseCardName(c[0]);
    if (!name || name.gift || !FACES.has(name.face)) continue;
    const card = deptCard(name);
    if (!card) continue;

    const buy = money(cellByColor(row, 'F3FEFF') ?? c[2]);
    const sell = money(cellByColor(row, 'FFF6F6') ?? c[3]);
    const buyOk = buy && sane(buy.price, name.face);
    const sellOk = sell && sane(sell.price, name.face);
    if (!buyOk && !sellOk) continue;

    out.push({
      card,
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

// ---- 상품권백화점 (http://www.xn--zf0bt1zcnd5pj69p6qc.com/) ----
/**
 * 상품권백화점(영카트 상품 리스트, UTF-8):
 *   li.sct_li > div.sct_txt > a(상품명) / div.sct_basic(액면) / span.sct_discountfirst(매입가) / span.sct_discount(판매가)
 * 페이지에 할인율 표기가 없어 액면가 대비로 계산합니다(소수 둘째 자리).
 */
function parseGiftdept(html) {
  const FACES = new Set([10000, 50000, 100000, 500000]);
  const NON_DEPT = /주유|기프트|문화|농협|농산물|금강|제화|이랜드|삼성|SPC|파리|해피머니|도서|컬처|온누리|외식|카드|모바일/i;
  const DEPT = [
    [/신세계|이마트/, '신세계'], [/롯데/, '롯데'], [/현대/, '현대'],
    [/갤러리아/, '갤러리아'], [/국민관광/, '국민관광'], [/AK|에이케이/i, 'AK'],
  ];
  const deptCard = (name) => {
    if (NON_DEPT.test(name.label)) return null;
    if (name.card === '백화점 공통') return /백화점/.test(name.label) ? name.card : null;
    const hit = DEPT.find(([re]) => re.test(name.card));
    return hit ? hit[1] : null;
  };
  const rateOf = (price, face) => Math.round(((face - price) / face) * 10000) / 100;
  const pick = (block, re) => {
    const m = block.match(re);
    return m ? m[1] : '';
  };

  const out = [];
  for (const li of html.matchAll(/<li[^>]*class=["'][^"']*\bsct_li\b[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const txtAt = li[1].search(/class=["'][^"']*\bsct_txt\b/);
    if (txtAt < 0) continue;
    const txt = li[1].slice(txtAt);

    const name = parseCardName(pick(txt, /<a[^>]*>([\s\S]*?)<\/a>/i));
    if (!name || name.gift || !FACES.has(name.face)) continue;
    const card = deptCard(name);
    if (!card) continue;
    // 액면 칸(sct_basic)이 있으면 상품명에서 읽은 액면과 맞는지 확인
    const basic = Number(clean(pick(txt, /class=["'][^"']*\bsct_basic\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)).replace(/[^\d]/g, ''));
    if (basic && basic !== name.face) continue;

    const buy = parseMoney(clean(pick(txt, /class=["'][^"']*\bsct_discountfirst\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)));
    const sell = parseMoney(clean(pick(txt, /class=["'][^"']*\bsct_discount\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)));
    const buyOk = buy && sane(buy.price, name.face);   // "0원"(매입중지) 은 parseMoney 가 null
    const sellOk = sell && sane(sell.price, name.face);
    if (!buyOk && !sellOk) continue;

    out.push({
      card,
      label: name.label,
      face: name.face,
      method: null,
      buy: buyOk ? buy.price : null,
      buyRate: buyOk ? rateOf(buy.price, name.face) : null,
      sell: sellOk ? sell.price : null,
      sellRate: sellOk ? rateOf(sell.price, name.face) : null,
    });
  }
  return out;
}

// ---- 우천상품권 (http://www.wooticket.com/) ----
/**
 * 우천상품권(wooticket): 상품권 명 | 매입가 | 판매가 | ▷ go (4열, EUC-KR → 디코딩된 문자열을 받음)
 * 금액 칸은 "477,500 (4.5%)" 처럼 '원' 표기가 없어 parseMoney 대신 전용 파서를 씁니다.
 * 백화점권(롯데/신세계/현대/갤러리아/국민관광/AK)만 남기고 호텔·주유·구두·기프트카드 등은 제외합니다.
 */
function parseWooticket(html) {
  const FACES = new Set([10000, 50000, 100000, 500000]);
  const DEPT = ['롯데', '신세계', '현대', '갤러리아', '국민관광', 'AK'];

  // "477,500 (4.5%)" / "9,500 (5%)" → { price, rate } — '원' 없음, 0원·0% 는 null
  const money = (text) => {
    const m = text.match(/([\d,]{4,})(?:\s*원)?\s*\(?\s*(\d+(?:\.\d+)?)\s*%/);
    if (!m) return null;
    const price = Number(m[1].replace(/,/g, ''));
    const rate = Number(m[2]);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(rate) || rate <= 0) return null;
    return { price, rate };
  };

  // parseCardName 결과를 백화점권 표준 이름으로 — 해당 없으면 null
  const deptCard = (name) => {
    const key = name.card.replace(/\s+/g, '').toUpperCase(); // "국민 관광" → "국민관광", "AK플라자" → "AK플라자"
    if (key === 'AK' || key === 'AK플라자') return 'AK';
    if (DEPT.includes(key)) return key;
    // "롯데/신세계/현대 (1만원권)" 또는 "백화점 1만원권(롯데,신세계,현대)" 처럼 여러 백화점 공통
    const hits = DEPT.filter((d) => name.label.toUpperCase().includes(d)).length;
    if ((name.card === '백화점 공통' || /[\/,·]/.test(name.card)) && hits >= 2) return '백화점 공통';
    return null;
  };

  const out = [];
  for (const row of rows(html)) {
    const c = cells(row);
    if (c.length < 3) continue;
    const name = parseCardName(c[0]);
    if (!name || name.gift || !FACES.has(name.face)) continue;
    if (/매입중지|시세문의|문의/.test(name.label)) continue;
    const card = deptCard(name);
    if (!card) continue;

    const buyText = clean(c[1]);
    const sellText = clean(c[2]);
    if (/매입중지|시세문의|문의/.test(buyText + sellText)) continue;

    const buy = money(buyText);
    const sell = money(sellText);
    const buyOk = buy && sane(buy.price, name.face);
    const sellOk = sell && sane(sell.price, name.face);
    if (!buyOk && !sellOk) continue;

    out.push({
      card,
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

// ---- 월드티켓상품권 (https://myeongdongworldticket.co.kr/) ----
/**
 * 월드티켓상품권(worldticket): thead 상품권명 | 매입가(원) | 판매가(원) (3열, UTF-8)
 * 셀은 "96,400원 (3.60%)" 형식이라 parseMoney 를 그대로 씁니다.
 * "롯데/신세계/현대상품권 (1만원권)" 은 '백화점 공통'으로, 농협·이랜드·금강은 제외합니다.
 */
function parseWorldticket(html) {
  const FACES = new Set([10000, 50000, 100000, 500000]);
  const DEPT = ['롯데', '신세계', '현대', '갤러리아', '국민관광', 'AK'];

  const deptCard = (name) => {
    const key = name.card.replace(/\s+/g, '').toUpperCase();
    if (key === 'AK' || key === 'AK플라자') return 'AK';
    if (DEPT.includes(key)) return key;
    const hits = DEPT.filter((d) => name.label.toUpperCase().includes(d)).length;
    if ((name.card === '백화점 공통' || /[\/,·]/.test(name.card)) && hits >= 2) return '백화점 공통';
    return null;
  };

  const out = [];
  for (const row of rows(html)) {
    const c = cells(row);
    if (c.length < 3) continue;
    const name = parseCardName(c[0]);
    if (!name || name.gift || !FACES.has(name.face)) continue;
    if (/매입중지|시세문의|문의/.test(name.label)) continue;
    const card = deptCard(name);
    if (!card) continue;

    const buyText = clean(c[1]);
    const sellText = clean(c[2]);
    if (/매입중지|시세문의|문의/.test(buyText + sellText)) continue;

    const buy = parseMoney(buyText);
    const sell = parseMoney(sellText);
    const buyOk = buy && buy.rate !== 0 && sane(buy.price, name.face);
    const sellOk = sell && sell.rate !== 0 && sane(sell.price, name.face);
    if (!buyOk && !sellOk) continue;

    out.push({
      card,
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

// ---- 엑스이상품권 (http://xegift.co.kr/) ----
/**
 * 엑스이상품권(그누보드5): <table class="tbl">, 상품권명 | td.blue=매입가 | td.red=판매가
 *  - 표기 불균일('96,200(3.8%)' 원 누락, '10000원' 콤마 누락) → looseMoney
 *  - '현대상품권(50/10만원)' 복수 액면 표기 → 액면별 후보를 만들고 표기 가격이 sane() 를 통과하는 쪽만 채택
 *  - '백화점 만원권' → card '백화점 공통', face 10000
 *  - 증정용·비백화점(이랜드/삼성/농협/금강/주유 등)·'매입중지'·'시세문의' 제외
 * 공용 헬퍼 rows/cells/clean/parseCardName/sane 를 사용합니다.
 */
function parseXegift(html) {
  const DEPT_CARDS = new Set(['신세계', '롯데', '현대', '갤러리아', '국민관광', 'AK', '백화점 공통']);
  const normalizeCard = (card) =>
    String(card || '').replace(/^AK\s*플라자$/i, 'AK').replace(/^국민\s*관광$/, '국민관광').trim();

  // "96,200(3.8%)", "10000원", "9,000원(10%)" 모두 처리. 네 자리 이상 숫자(콤마 포함)만 금액으로 봅니다.
  const looseMoney = (text) => {
    const t = clean(text);
    if (!t || /매입\s*중지|판매\s*중지|시세\s*문의|문의|매입\s*X|판매\s*X/i.test(t)) return null;
    const price = t.match(/(\d{1,3}(?:,\d{3})+|\d{4,})/);
    if (!price) return null;
    const n = Number(price[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    const rate = t.match(/(\d+(?:\.\d+)?)\s*%/);
    return { price: n, rate: rate ? Number(rate[1]) : null };
  };

  // 상품권명 → 후보 목록 [{ card, label, face, gift }]
  const cardNames = (raw) => {
    const label = clean(raw).replace(/[★☆]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!label) return [];
    // "만원권"(숫자 생략) → "1만원권". 바로 앞이 숫자가 아닐 때만 1을 채웁니다.
    const normalized = label.replace(/(^|[^\d])\s*만\s*원/g, (_, pre) => `${pre}1만원`);
    // "(50/10만원)" → 액면 50만·10만 두 후보
    const multi = normalized.match(/\(\s*((?:\d+\s*\/\s*)+\d+)\s*만\s*원\s*권?\s*\)/);
    const variants = multi
      ? multi[1].split('/').map((n) => normalized.replace(multi[0], `(${Number(n.trim())}만원)`))
      : [normalized];

    const out = [];
    for (const v of variants) {
      let name = parseCardName(v);
      if (!name) {
        // "백화점 1만원권" 처럼 card 가 비어 parseCardName 이 null 을 돌려주는 경우
        const face = v.match(/(\d+)\s*만\s*원/);
        if (!face || !/백화점/.test(v)) continue;
        name = { card: '백화점 공통', face: Number(face[1]) * 10000, gift: /증정/.test(label) };
      }
      out.push({ ...name, label, card: normalizeCard(name.card) });
    }
    return out;
  };

  const out = [];
  // blue/red 셀이 있는 시세 표만 대상으로, 없으면 문서 전체
  const tables = [...html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  const scope = tables.filter((t) => /class="[^"]*\b(?:blue|red)\b/i.test(t)).join('\n') || html;

  for (const row of rows(scope)) {
    const c = cells(row);
    if (c.length < 3) continue;
    const names = cardNames(c[0]);
    if (!names.length) continue;

    const blue = row.match(/<td[^>]*class="[^"]*\bblue\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const red = row.match(/<td[^>]*class="[^"]*\bred\b[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    const buy = looseMoney(blue ? blue[1] : c[1]);
    const sell = looseMoney(red ? red[1] : c[2]);

    for (const name of names) {
      if (name.gift || !DEPT_CARDS.has(name.card)) continue;
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
  }
  return out;
}

// ---- 중앙상품권 (https://centralgift.imweb.me/) ----
/**
 * 중앙상품권(아임웹): 리치텍스트 <table>, 4열 = 상품권명 | 액면가 | 매입가(고객이 파실 때) | 판매가(고객이 사실 때)
 *  - 셀 안의 <span>/<br> 중첩은 inlineText 로 평탄화 ("<span>96,30</span><span>0원</span>" → "96,300원")
 *  - 비백화점(삼성/이랜드/농협/홈플러스/금강/주유)·'시세문의'·'매입 X' 제외
 * 공용 헬퍼 rows/cells/clean/parseCardName/sane 를 사용합니다.
 */
function parseCentralgift(html) {
  const DEPT_CARDS = new Set(['신세계', '롯데', '현대', '갤러리아', '국민관광', 'AK', '백화점 공통']);
  const normalizeCard = (card) =>
    String(card || '').replace(/^AK\s*플라자$/i, 'AK').replace(/^국민\s*관광$/, '국민관광').trim();

  // 인라인 태그는 공백 없이 이어 붙이고 <br>·블록 태그만 공백으로 바꿉니다.
  const inlineText = (cell) =>
    clean(
      String(cell ?? '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/?(?:p|div|li|ul|ol|tr|td|th|table|h\d)\b[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, ''),
    );

  const looseMoney = (text) => {
    const t = clean(text);
    if (!t || /매입\s*중지|판매\s*중지|시세\s*문의|문의|매입\s*X|판매\s*X/i.test(t)) return null;
    const price = t.match(/(\d{1,3}(?:,\d{3})+|\d{4,})/);
    if (!price) return null;
    const n = Number(price[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    const rate = t.match(/(\d+(?:\.\d+)?)\s*%/);
    return { price: n, rate: rate ? Number(rate[1]) : null };
  };

  const out = [];
  for (const row of rows(html)) {
    const c = cells(row);
    if (c.length < 4) continue;

    const nameText = inlineText(c[0]);
    const faceText = inlineText(c[1]);
    if (!/\d\s*만\s*원/.test(faceText)) continue; // 헤더·'시세문의' 행 제외

    const name = parseCardName(`${nameText} ${faceText}`);
    if (!name || name.gift) continue;
    const card = normalizeCard(name.card);
    if (!DEPT_CARDS.has(card)) continue;

    const buy = looseMoney(inlineText(c[2]));
    const sell = looseMoney(inlineText(c[3]));
    const buyOk = buy && sane(buy.price, name.face);
    const sellOk = sell && sane(sell.price, name.face);
    if (!buyOk && !sellOk) continue;

    out.push({
      card,
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

// ---- 미래상품권 (https://meee.co.kr/) ----
/**
 * 미래상품권(meee.co.kr): 그누보드 표 1개에 기본 시세표 + 최고가/사은증정/대량 매입 하위 표가 섞여 있음.
 * 첫 번째 <table> 의 기본 시세표(첫 '0원(0%)' 구역 제목 행 이전)만 수집. 상품권명에 액면가가 없어 가격대로 액면가 추정.
 * th.price=매입가(손님 파실때) → buy, th.price2=판매가(손님 구매시) → sell. 이체/현금 구분 없음(method null).
 */
function parseMeee(html) {
  const FACES = [10000, 50000, 100000, 500000];
  const SECTION = /최고가|초고가|소량|사은|증정|이상|이하|매입\s*안|안내|문의|중지|현금영수증/;
  // 백화점 상품권 카드명 정규화 — 백화점이 아닌 상품권(이랜드·삼성·농협·금강·주유·문화 등)은 null
  const deptCard = (card) => {
    const s = String(card || '').replace(/\s+/g, '');
    if (!s) return null;
    if (/백화점공통/.test(s)) return '백화점 공통';
    if (/AK/i.test(s)) return 'AK';
    if (/신세계/.test(s)) return '신세계';
    if (/롯데/.test(s)) return '롯데';
    if (/현대/.test(s)) return '현대';
    if (/갤러리아/.test(s)) return '갤러리아';
    if (/국민관광/.test(s)) return '국민관광';
    return null;
  };

  const table = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!table) return [];

  const out = [];
  const seen = new Set();
  for (const row of rows(table[1])) {
    if (/<th[\s>]/i.test(row)) continue; // 머리글 행
    const c = cells(row);
    if (c.length < 3) continue;

    const label = clean(c[0]).replace(/[★☆]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!label) continue;
    const buy = parseMoney(clean(c[1]));
    const sell = parseMoney(clean(c[2]));

    // "최고가 현금 매입 (고객님 파실 때) | 0원(0%) | 0원(0%)" 같은 구역 제목 행 → 기본 시세표 끝
    if (SECTION.test(label) && !buy && !sell) break;
    if (SECTION.test(label) || /\[.*\]/.test(label)) continue; // "[사은증정]…", "500만원 이상" 등

    // 상품권명 → 카드·액면가. "(10만원)" 표기가 있으면 기존 헬퍼, 없으면 직접 해석
    const byHelper = parseCardName(label);
    if (byHelper && byHelper.gift) continue;
    let card = byHelper ? byHelper.card : null;
    let face = byHelper ? byHelper.face : null;
    if (!byHelper) {
      // "롯데상품권"(액면가 없음), "백화점 1만권 (롯,신,현,국광)"('만권' 형식)
      const m = label.match(/(\d+)\s*만\s*권?/);
      if (m) face = Number(m[1]) * 10000;
      card = /[,，]/.test(label)
        ? '백화점 공통'
        : label.replace(/\(.*?\)/g, ' ').replace(/\d+\s*만\s*권?/g, ' ').replace(/상품권/g, ' ').replace(/\s+/g, ' ').trim();
    }
    card = deptCard(card);
    if (!card) continue; // 이랜드 등 백화점 외 상품권 제외

    // 액면가 미표기 → 가격이 50%~100% 구간에 드는 액면가로 추정 (구간이 겹치지 않아 유일)
    if (!face) {
      const ref = (buy && buy.price) || (sell && sell.price);
      face = FACES.find((f) => sane(ref, f)) || null;
    }
    if (!FACES.includes(face)) continue;

    const buyOk = buy && sane(buy.price, face);
    const sellOk = sell && sane(sell.price, face);
    if (!buyOk && !sellOk) continue;

    const key = `${card}|${face}`;
    if (seen.has(key)) continue; // 하위 표에 같은 상품권이 다시 나와도 기본 시세표 값만 유지
    seen.add(key);

    out.push({
      card,
      label,
      face,
      method: null,
      buy: buyOk ? buy.price : null,
      buyRate: buyOk ? buy.rate : null,
      sell: sellOk ? sell.price : null,
      sellRate: sellOk ? sell.rate : null,
    });
  }
  return out;
}

// ---- 명인상품권 (https://mingren.co.kr/) ----
/**
 * 명인상품권(mingren.co.kr): '실시간 상품권 시세현황' 표 — 상품권명 | td.sise_td2=매입가 | td.sise_td3=판매가.
 * 빈칸·'매입중지'·'원'만 있는 행과, 50만원권 칸에 10만원권 가격이 적힌 오기(sane 미통과)는 제외.
 * "47,875%(4.25%)", "96,600(3.4%)" 처럼 '원'이 빠진 오기는 느슨하게 해석. 홈(/)과 sub1_1.php 모두 같은 마크업.
 */
function parseMingren(html) {
  const FACES = [10000, 50000, 100000, 500000];
  // 백화점 상품권 카드명 정규화 — 백화점이 아닌 상품권(삼성·홈플러스·금강·문화 등)은 null
  const deptCard = (card) => {
    const s = String(card || '').replace(/\s+/g, '');
    if (!s) return null;
    if (/백화점공통/.test(s)) return '백화점 공통';
    if (/AK/i.test(s)) return 'AK';
    if (/신세계/.test(s)) return '신세계';
    if (/롯데/.test(s)) return '롯데';
    if (/현대/.test(s)) return '현대';
    if (/갤러리아/.test(s)) return '갤러리아';
    if (/국민관광/.test(s)) return '국민관광';
    return null;
  };
  // 가격 문자열을 느슨하게 해석: 괄호 안 % 는 할인율, 그 밖의 첫 숫자 덩어리가 가격('원' 누락 허용)
  const parseMoneyLoose = (text) => {
    const t = clean(text);
    if (!t || /중지|문의/.test(t)) return null;
    const rate = t.match(/\(\s*(\d+(?:\.\d+)?)\s*%\s*\)/);
    const body = rate ? t.replace(rate[0], ' ') : t;
    const price = body.match(/(\d{1,3}(?:,\d{3})+|\d{4,})/);
    if (!price) return null;
    const n = Number(price[1].replace(/,/g, ''));
    if (!Number.isFinite(n) || n <= 0) return null;
    return { price: n, rate: rate ? Number(rate[1]) : null };
  };
  const cellByClass = (row, cls) => {
    const m = row.match(new RegExp('<td[^>]*class=[^>]*\\b' + cls + '\\b[^>]*>([\\s\\S]*?)<\\/td>', 'i'));
    return m ? m[1] : null;
  };

  const out = [];
  const seen = new Set();
  for (const row of rows(html)) {
    if (!/sise_td2/.test(row)) continue; // 시세 행만 (환율·테더 표도 같은 클래스지만 상품권명 파싱에서 걸러짐)
    const c = cells(row);
    if (c.length < 3) continue;

    const name = parseCardName(c[0]);
    if (!name || name.gift) continue;
    const card = deptCard(name.card);
    if (!card || !FACES.includes(name.face)) continue;

    const buy = parseMoneyLoose(cellByClass(row, 'sise_td2') ?? c[1]);
    const sell = parseMoneyLoose(cellByClass(row, 'sise_td3') ?? c[2]);
    const buyOk = buy && sane(buy.price, name.face);
    const sellOk = sell && sane(sell.price, name.face);
    if (!buyOk && !sellOk) continue;

    const key = `${card}|${name.face}`;
    if (seen.has(key)) continue; // 홈에는 같은 상품권이 빈 하위 표에 다시 나옴
    seen.add(key);

    out.push({
      card,
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
      const html = await getText(shop.url, {
        ...(shop.encoding ? { encoding: shop.encoding } : {}),
        headers: { 'accept-language': 'ko-KR,ko;q=0.9,en;q=0.5' },
      });
      const parsed = shop.parse(html);
      if (!parsed.length) throw new Error(`파싱 결과 0건 — 응답 ${html.length}자: ${clean(html).slice(0, 120)}`);

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
