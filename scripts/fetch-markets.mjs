// 주가지수 · 귀금속 · 환율(Yahoo Finance) + 암호화폐(업비트) 시세를 수집합니다.
//
// 2026년 stooq 가 자바스크립트 proof-of-work 봇 차단을 도입해 CSV 수집이 막혔습니다.
// 우회하지 않고 Yahoo Finance 차트 API 로 교체했습니다 (키 불필요, JSON).
import { getJSON, readJSON, writeJSON, nowKST } from './lib.mjs';

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

  // --- 에너지·원자재 (energy 그룹) ---
  { id: 'wti',    symbol: 'CL=F', name: 'WTI 원유',   group: 'energy', unit: 'USD/bbl' },
  { id: 'brent',  symbol: 'BZ=F', name: '브렌트유',  group: 'energy', unit: 'USD/bbl' },
  { id: 'natgas', symbol: 'NG=F', name: '천연가스',  group: 'energy', unit: 'USD/MMBtu' },
  { id: 'copper', symbol: 'HG=F', name: '구리',      group: 'energy', unit: 'USD/lb' },
  { id: 'palladium', symbol: 'PA=F', name: '팔라듐', group: 'energy', unit: 'USD/oz' },
  { id: 'wheat',  symbol: 'ZW=F', name: '밀',        group: 'energy', unit: 'USc/bu' },
  { id: 'corn',   symbol: 'ZC=F', name: '옥수수',    group: 'energy', unit: 'USc/bu' },

  // --- 매크로 지표 (macro 그룹) ---
  { id: 'dxy',    symbol: 'DX-Y.NYB', name: '달러 인덱스', group: 'macro', unit: 'pt' },
  { id: 'vix',    symbol: '^VIX',     name: 'VIX 변동성',  group: 'macro', unit: 'pt' },
  { id: 'ust10',  symbol: '^TNX',     name: '미 국채 10년', group: 'macro', unit: '%' },
  { id: 'hsi',    symbol: '^HSI',     name: '항셍',        group: 'macro', unit: 'pt' },
  { id: 'sse',    symbol: '000001.SS', name: '상해종합',   group: 'macro', unit: 'pt' },
  { id: 'dax',    symbol: '^GDAXI',   name: '독일 DAX',    group: 'macro', unit: 'pt' },
];

const STOCK_RANK_LIMIT = 100;
const STOCK_HISTORY_CONCURRENCY = 8;

const parseNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

async function mapConcurrent(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 국내 시가총액 상위 100종목을 시장별로 수집합니다.
 * 순위·현재가·시가총액은 네이버 금융 시장 목록을, 40거래일 차트는 종목별
 * 일별 가격 응답을 사용합니다. 개별 차트 실패 시에도 순위 목록은 유지됩니다.
 */
async function collectDomesticRanking(market, group) {
  const marketCode = market === 'KOSDAQ' ? 'KQ' : 'KS';
  const prefix = market === 'KOSDAQ' ? 'kq' : 'ks';
  const rankingBase = `https://m.stock.naver.com/api/stocks/marketValue/${market}`;
  const rankingOptions = { headers: { referer: 'https://m.stock.naver.com/' } };
  const firstPage = await getJSON(`${rankingBase}?page=1&pageSize=${STOCK_RANK_LIMIT}`, rankingOptions);
  const firstStocks = Array.isArray(firstPage?.stocks) ? firstPage.stocks : [];
  const isCommonStock = (item) => {
    const name = String(item?.stockName || '').trim();
    return item?.stockEndType === 'stock' &&
      /^\d{6}$/.test(String(item?.itemCode || '')) &&
      name &&
      !/(?:우|우B|우C)$/.test(name);
  };
  const firstValid = firstStocks.filter(isCommonStock);
  const secondPage = firstValid.length < STOCK_RANK_LIMIT
    ? await getJSON(`${rankingBase}?page=2&pageSize=${STOCK_RANK_LIMIT}`, rankingOptions)
    : null;
  const stocks = [...firstStocks, ...(Array.isArray(secondPage?.stocks) ? secondPage.stocks : [])];
  const valid = stocks
    .filter(isCommonStock)
    .slice(0, STOCK_RANK_LIMIT);
  if (valid.length !== STOCK_RANK_LIMIT) {
    throw new Error(`${market} 시가총액 순위가 ${valid.length}개만 수집되었습니다.`);
  }

  return mapConcurrent(valid, STOCK_HISTORY_CONCURRENCY, async (item, index) => {
    const code = String(item.itemCode);
    let history = [];
    try {
      const prices = await getJSON(
        `https://m.stock.naver.com/api/stock/${code}/price?page=1&pageSize=${DAYS}`,
        { headers: { referer: 'https://m.stock.naver.com/' } },
      );
      history = (Array.isArray(prices) ? prices : [])
        .map((row) => ({
          date: String(row.localTradedAt || '').slice(0, 10),
          close: parseNumber(row.closePrice),
          open: parseNumber(row.openPrice),
          high: parseNumber(row.highPrice),
          low: parseNumber(row.lowPrice),
          volume: parseNumber(row.accumulatedTradingVolume),
        }))
        .filter((row) => row.date && row.close != null)
        .reverse();
    } catch (error) {
      console.error(`${market} ${code} 차트 실패: ${error.message}`);
    }

    const latest = history.at(-1);
    const result = {
      id: `${prefix}_${code}`,
      code,
      market,
      name: String(item.stockName),
      group,
      unit: '원',
      rank: index + 1,
      price: parseNumber(item.closePriceRaw ?? item.closePrice),
      change: parseNumber(item.compareToPreviousClosePriceRaw ?? item.compareToPreviousClosePrice),
      changePct: parseNumber(item.fluctuationsRatio),
      date: String(item.localTradedAt || latest?.date || '').slice(0, 10),
      volume: parseNumber(item.accumulatedTradingVolumeRaw ?? item.accumulatedTradingVolume),
      tradedValue: parseNumber(item.accumulatedTradingValueRaw),
      marketCap: parseNumber(item.marketValueRaw),
      marketCapText: String(item.marketValueHangeul || ''),
      detailUrl: String(item.newPcUrl || item.endUrl || ''),
      logoUrl: String(item.itemLogoPngUrl || ''),
      spark: history.map((row) => row.close),
    };
    if (latest) {
      result.open = latest.open;
      result.high = latest.high;
      result.low = latest.low;
    }
    console.log(`${market} ${result.rank}. ${result.name}: ${result.price}`);
    return result;
  });
}

async function collectDomesticStocks() {
  try {
    const [kospi, kosdaq] = await Promise.all([
      collectDomesticRanking('KOSPI', 'stock'),
      collectDomesticRanking('KOSDAQ', 'kosdaq_stock'),
    ]);
    return [...kospi, ...kosdaq];
  } catch (error) {
    const previous = await readJSON(OUT, { items: [] });
    const fallback = (previous.items || []).filter((item) =>
      item.group === 'stock' || item.group === 'kosdaq_stock'
    );
    if (fallback.length >= STOCK_RANK_LIMIT * 2) {
      console.error(`국내 시총 순위 갱신 실패, 이전 100위 데이터 유지: ${error.message}`);
      return fallback;
    }
    throw error;
  }
}

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

      // 전일 종가는 일봉 시계열에서 직접 뽑습니다.
      // meta.chartPreviousClose 를 쓰면 안 됩니다 — 그 값은 "전일"이 아니라
      // "요청한 range 직전"의 종가라서, range=3mo 에서는 3개월 전 값이 나옵니다.
      // (실제로 코스피 -4.45% 인 날이 +4.78% 로 표시되는 부호 반전이 있었습니다.)
      // 장중이면 rows.at(-1) 이 오늘의 미완성 봉이고 그 종가가 곧 regularMarketPrice 이므로,
      // 장중·장마감 어느 쪽이든 직전 세션은 rows.at(-2) 입니다.
      const prevClose = rows.at(-2).close;

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

  const selected = [...picked.values()].sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h);
  const out = [];
  let rank = 0;
  for (const t of selected) {
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

/** 네이버 금융에서 한국거래소(KRX) 국내 금 현물 시세(원/g)를 가져옵니다. */
async function collectKrxGold() {
  const headers = { referer: 'https://m.stock.naver.com' };
  const base = 'https://m.stock.naver.com/front-api/marketIndex';
  const detail = await getJSON(`${base}/productDetail?category=metals&reutersCode=M04020000`, {
    headers,
  });
  const r = detail?.result;
  const price = Number(String(r?.closePrice).replace(/,/g, ''));
  if (!Number.isFinite(price) || price <= 0) throw new Error('국내 금값 파싱 실패');

  // 일별 시세로 스파크라인 + 전일 대비
  let spark = [];
  let prev = null;
  try {
    const rows = await getJSON(
      `${base}/prices?category=metals&reutersCode=M04020000&page=1&pageSize=40`,
      { headers }
    );
    const list = (rows?.result || [])
      .map((x) => Number(String(x.closePrice).replace(/,/g, '')))
      .filter((v) => Number.isFinite(v) && v > 0)
      .reverse(); // 과거 → 현재
    spark = list;
    prev = list.length >= 2 ? list.at(-2) : null;
  } catch (err) {
    console.error(`국내 금 차트 실패: ${err.message}`);
  }

  return {
    id: 'gold_krx',
    name: '금 (국내)',
    group: 'metal',
    unit: '원/g',
    price,
    change: prev == null ? null : price - prev,
    changePct: prev == null ? Number(r?.fluctuationsRatio) || null : ((price - prev) / prev) * 100,
    date: (r?.localTradedAt || '').slice(0, 10),
    spark,
    note: '한국거래소(KRX) 기준. 금은방·은행 시세와 다를 수 있습니다.',
  };
}

const [quotes, coins, krxGold, domesticStocks] = await Promise.all([
  collectQuotes(),
  collectCoins(),
  collectKrxGold().catch((err) => {
    console.error(`국내 금값 수집 실패: ${err.message}`);
    return null;
  }),
  collectDomesticStocks(),
]);
const items = [...quotes, ...coins, ...domesticStocks];
if (krxGold) items.push(krxGold);

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

// 금 1돈(3.75g). 국내 실거래가(KRX)가 있으면 그걸로, 없으면 국제가 환산으로.
const gold = items.find((i) => i.id === 'gold');
const usdkrw = items.find((i) => i.id === 'usdkrw');
if (krxGold) {
  items.push({
    id: 'gold_don',
    name: '금 1돈 (국내)',
    group: 'metal',
    unit: '원/3.75g',
    price: Math.round(krxGold.price * 3.75),
    change: krxGold.change == null ? null : Math.round(krxGold.change * 3.75),
    changePct: krxGold.changePct,
    spark: krxGold.spark.map((v) => v * 3.75),
    note: '한국거래소(KRX) 금값 × 3.75g. 부가세·세공비 미포함.',
  });
} else if (gold && usdkrw) {
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
    note: '국제 금시세 × 환율 환산값 (KRX 수집 실패 시 대체)',
  });
}

// 김치프리미엄 = (업비트 BTC 원화 − 글로벌 BTC 달러×환율) / 글로벌 × 100
// 국내 코인 시세가 해외보다 얼마나 비싼지를 보여주는 지표입니다.
const btc = items.find((i) => i.id === 'btc'); // 업비트 KRW-BTC
if (btc && usdkrw) {
  try {
    const g = await getJSON('https://api.coinbase.com/v2/prices/BTC-USD/spot');
    const usd = Number(g?.data?.amount);
    if (Number.isFinite(usd) && usd > 0) {
      const globalKrw = usd * usdkrw.price;
      const premium = ((btc.price - globalKrw) / globalKrw) * 100;
      items.push({
        id: 'kimchi',
        name: '김치프리미엄',
        group: 'macro',
        unit: '%',
        price: Math.round(premium * 100) / 100,
        change: null,
        changePct: null,
        spark: [],
        note: `업비트 ${(btc.price / 1e4).toFixed(0)}만 vs 글로벌 ${(globalKrw / 1e4).toFixed(0)}만원 환산`,
      });
      console.log(`김치프리미엄: ${premium.toFixed(2)}%`);
    }
  } catch (err) {
    console.error(`김치프리미엄 계산 실패: ${err.message}`);
  }
}

// 파생 계산에만 쓰인 보조 항목은 화면에 내보내지 않습니다.
const visible = items.filter((i) => !i.helper).map(({ helper, symbol, ...rest }) => rest);

await writeJSON(OUT, { updatedAt: nowKST(), items: visible });
const byGroup = {};
for (const i of visible) byGroup[i.group] = (byGroup[i.group] || 0) + 1;
console.log(`done: ${visible.length} items`, JSON.stringify(byGroup));
