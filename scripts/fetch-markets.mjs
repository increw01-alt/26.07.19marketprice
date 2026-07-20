// 주가지수 · 귀금속 · 환율(Yahoo Finance) + 암호화폐(업비트) 시세를 수집합니다.
//
// 2026년 stooq 가 자바스크립트 proof-of-work 봇 차단을 도입해 CSV 수집이 막혔습니다.
// 우회하지 않고 Yahoo Finance 차트 API 로 교체했습니다 (키 불필요, JSON).
import { getJSON, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/markets.json';
const DAYS = 40; // 스파크라인용 최근 거래일 수

const QUOTES = [
  { id: 'kospi',  symbol: '^KS11',    name: '코스피',      group: 'index', unit: 'pt' },
  { id: 'kosdaq', symbol: '^KQ11',    name: '코스닥',      group: 'index', unit: 'pt' },
  { id: 'spx',    symbol: '^GSPC',    name: 'S&P 500',     group: 'index', unit: 'pt' },
  { id: 'ndq',    symbol: '^NDX',     name: '나스닥 100',  group: 'index', unit: 'pt' },
  { id: 'dji',    symbol: '^DJI',     name: '다우존스',    group: 'index', unit: 'pt' },
  { id: 'nkx',    symbol: '^N225',    name: '닛케이 225',  group: 'index', unit: 'pt' },

  { id: 'gold',   symbol: 'GC=F',     name: '금 (국제)',   group: 'metal', unit: 'USD/oz' },
  { id: 'silver', symbol: 'SI=F',     name: '은 (국제)',   group: 'metal', unit: 'USD/oz' },
  { id: 'plat',   symbol: 'PL=F',     name: '백금 (국제)', group: 'metal', unit: 'USD/oz' },

  { id: 'usdkrw', symbol: 'KRW=X',    name: '달러/원',     group: 'fx',    unit: 'KRW' },
  { id: 'jpykrw', symbol: 'JPYKRW=X', name: '엔/원',       group: 'fx',    unit: 'KRW' },
  { id: 'eurkrw', symbol: 'EURKRW=X', name: '유로/원',     group: 'fx',    unit: 'KRW' },

  // 위안/원 직접 크로스(CNYKRW=X)는 Yahoo 에 과거 이력이 없어 현재가 1개만 옵니다.
  // 달러/원 ÷ 달러/위안 으로 파생시키기 위한 보조 항목입니다 (화면에는 안 나갑니다).
  { id: 'usdcny', symbol: 'CNY=X', name: '달러/위안', group: 'fx', unit: 'CNY', helper: true },
];

const COIN_TOP = 10; // 24시간 거래대금 상위 N개
/** 거래대금 순위와 무관하게 항상 포함할 대표 코인 */
const COIN_ALWAYS = ['KRW-BTC', 'KRW-ETH'];

/** Yahoo 차트 API — 최근 3개월 일봉에서 종가 시계열을 뽑습니다. */
async function yahooHistory(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=3mo&interval=1d`;
  const res = await getJSON(url);
  const r = res?.chart?.result?.[0];
  if (!r) throw new Error(res?.chart?.error?.description || '응답에 result 없음');

  const ts = r.timestamp || [];
  const closes = r.indicators?.quote?.[0]?.close || [];
  const rows = ts
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] }))
    .filter((x) => x.close != null && Number.isFinite(x.close));

  return { rows: rows.slice(-DAYS), meta: r.meta };
}

async function collectQuotes() {
  const out = [];
  for (const item of QUOTES) {
    try {
      const { rows, meta } = await yahooHistory(item.symbol);
      if (rows.length < 2) throw new Error('데이터 부족');

      // 장중에는 meta.regularMarketPrice 가 마지막 일봉보다 최신입니다.
      const last = rows.at(-1);
      const price = Number.isFinite(meta?.regularMarketPrice) ? meta.regularMarketPrice : last.close;
      const prevClose = Number.isFinite(meta?.chartPreviousClose)
        ? meta.chartPreviousClose
        : rows.at(-2).close;

      out.push({
        ...item,
        price,
        date: last.date,
        change: price - prevClose,
        changePct: ((price - prevClose) / prevClose) * 100,
        spark: rows.map((h) => h.close),
      });
      console.log(`${item.id}: ${price} (${last.date})`);
    } catch (err) {
      console.error(`${item.id} 실패: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

async function collectCoins() {
  // 1) KRW 마켓 전체 목록 (한글명 포함)
  const all = await getJSON('https://api.upbit.com/v1/market/all');
  const krw = all.filter((m) => m.market.startsWith('KRW-'));
  const nameOf = new Map(krw.map((m) => [m.market, m.korean_name]));

  // 2) 시세를 100개씩 나눠 조회 (URL 길이 제한 회피)
  const tickers = [];
  for (let i = 0; i < krw.length; i += 100) {
    const chunk = krw.slice(i, i + 100).map((m) => m.market).join(',');
    tickers.push(...(await getJSON(`https://api.upbit.com/v1/ticker?markets=${chunk}`)));
    await new Promise((r) => setTimeout(r, 200));
  }

  // 3) 24시간 거래대금 상위 N개 + 대표 코인은 항상 포함
  tickers.sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h);
  const picked = new Map();
  for (const m of COIN_ALWAYS) {
    const t = tickers.find((x) => x.market === m);
    if (t) picked.set(m, t);
  }
  for (const t of tickers) {
    if (picked.size >= COIN_TOP) break;
    picked.set(t.market, t);
  }

  const out = [];
  let rank = 0;
  for (const t of picked.values()) {
    rank++;
    let spark = [];
    try {
      const candles = await getJSON(
        `https://api.upbit.com/v1/candles/days?market=${t.market}&count=${DAYS}`
      );
      spark = candles.map((k) => k.trade_price).reverse();
    } catch (err) {
      console.error(`${t.market} 캔들 실패: ${err.message}`);
    }
    out.push({
      id: t.market.replace('KRW-', '').toLowerCase(),
      name: nameOf.get(t.market) || t.market,
      group: 'coin',
      unit: 'KRW',
      rank,
      price: t.trade_price,
      change: t.signed_change_price,
      changePct: t.signed_change_rate * 100,
      volume: t.acc_trade_price_24h, // 24시간 거래대금(원)
      spark,
    });
    console.log(`${rank}. ${nameOf.get(t.market)}: ${t.trade_price.toLocaleString()}`);
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}

const [quotes, coins] = await Promise.all([collectQuotes(), collectCoins()]);
const items = [...quotes, ...coins];

if (!items.length) throw new Error('수집된 항목이 없습니다 — 모든 소스 실패');

// 위안/원 = 달러/원 ÷ 달러/위안
const usdcny = items.find((i) => i.id === 'usdcny');
const usdkrwForCny = items.find((i) => i.id === 'usdkrw');
if (usdcny && usdkrwForCny) {
  // 두 시계열의 뒤쪽 n개를 맞춰 같은 날짜끼리 나눕니다.
  const n = Math.min(usdcny.spark.length, usdkrwForCny.spark.length);
  const krwTail = usdkrwForCny.spark.slice(-n);
  const cnyTail = usdcny.spark.slice(-n);
  const spark = krwTail.map((krw, k) => krw / cnyTail[k]);
  const price = usdkrwForCny.price / usdcny.price;
  const prev = spark.length >= 2 ? spark.at(-2) : null;
  items.push({
    id: 'cnykrw',
    name: '위안/원',
    group: 'fx',
    unit: 'KRW',
    price,
    date: usdkrwForCny.date,
    change: prev == null ? null : price - prev,
    changePct: prev == null ? null : ((price - prev) / prev) * 100,
    spark,
    note: '달러/원 ÷ 달러/위안 환산값',
  });
}

// 국제 금시세 + 달러/원으로 국내 금 1돈(3.75g) 환산값을 파생합니다.
const gold = items.find((i) => i.id === 'gold');
const usdkrw = items.find((i) => i.id === 'usdkrw');
if (gold && usdkrw) {
  const perDon = (gold.price / 31.1035) * 3.75 * usdkrw.price;
  items.push({
    id: 'gold_don',
    name: '금 1돈 환산',
    group: 'metal',
    unit: 'KRW/3.75g',
    price: Math.round(perDon),
    change: null,
    changePct: gold.changePct,
    spark: [],
    note: '국제 금시세 × 환율 환산값 (부가세·공임 미포함)',
  });
}

// 파생 계산에만 쓰인 보조 항목은 화면에 내보내지 않습니다.
const visible = items.filter((i) => !i.helper).map(({ helper, symbol, ...rest }) => rest);

await writeJSON(OUT, { updatedAt: nowKST(), items: visible });
console.log(`done: ${visible.length} items`);
