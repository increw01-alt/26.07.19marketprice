// 주가지수 · 귀금속 · 환율(stooq) + 암호화폐(업비트) 시세를 수집합니다.
import { getJSON, getText, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/markets.json';
const DAYS = 40; // 스파크라인용 최근 거래일 수

const STOOQ = [
  { id: 'kospi',  symbol: '^kospi', name: '코스피',      group: 'index',  unit: 'pt' },
  { id: 'kosdaq', symbol: '^kosdq', name: '코스닥',      group: 'index',  unit: 'pt' },
  { id: 'spx',    symbol: '^spx',   name: 'S&P 500',     group: 'index',  unit: 'pt' },
  { id: 'ndq',    symbol: '^ndq',   name: '나스닥 100',  group: 'index',  unit: 'pt' },
  { id: 'dji',    symbol: '^dji',   name: '다우존스',    group: 'index',  unit: 'pt' },
  { id: 'nkx',    symbol: '^nkx',   name: '닛케이 225',  group: 'index',  unit: 'pt' },

  { id: 'gold',   symbol: 'xauusd', name: '금 (국제)',   group: 'metal',  unit: 'USD/oz' },
  { id: 'silver', symbol: 'xagusd', name: '은 (국제)',   group: 'metal',  unit: 'USD/oz' },
  { id: 'plat',   symbol: 'xptusd', name: '백금 (국제)', group: 'metal',  unit: 'USD/oz' },

  { id: 'usdkrw', symbol: 'usdkrw', name: '달러/원',     group: 'fx',     unit: 'KRW' },
  { id: 'jpykrw', symbol: 'jpykrw', name: '엔/원',       group: 'fx',     unit: 'KRW' },
  { id: 'eurkrw', symbol: 'eurkrw', name: '유로/원',     group: 'fx',     unit: 'KRW' },
  { id: 'cnykrw', symbol: 'cnykrw', name: '위안/원',     group: 'fx',     unit: 'KRW' },
];

const COINS = [
  { id: 'btc', market: 'KRW-BTC', name: '비트코인' },
  { id: 'eth', market: 'KRW-ETH', name: '이더리움' },
  { id: 'xrp', market: 'KRW-XRP', name: '리플' },
  { id: 'sol', market: 'KRW-SOL', name: '솔라나' },
  { id: 'doge', market: 'KRW-DOGE', name: '도지코인' },
];

const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');

async function stooqHistory(symbol) {
  const to = new Date();
  const from = new Date(Date.now() - DAYS * 2 * 86400_000); // 휴장일 감안해 넉넉히
  const url = `https://stooq.com/q/d/l/?s=${symbol}&d1=${ymd(from)}&d2=${ymd(to)}&i=d`;
  const csv = await getText(url);
  const lines = csv.trim().split('\n').slice(1); // 헤더 제거
  const rows = lines
    .map((l) => l.split(','))
    .filter((c) => c.length >= 5 && c[4] && !Number.isNaN(Number(c[4])))
    .map((c) => ({ date: c[0], close: Number(c[4]) }));
  return rows.slice(-DAYS);
}

async function collectStooq() {
  const out = [];
  for (const item of STOOQ) {
    try {
      const hist = await stooqHistory(item.symbol);
      if (hist.length < 2) throw new Error('데이터 부족');
      const last = hist.at(-1);
      const prev = hist.at(-2);
      out.push({
        ...item,
        price: last.close,
        date: last.date,
        change: last.close - prev.close,
        changePct: ((last.close - prev.close) / prev.close) * 100,
        spark: hist.map((h) => h.close),
      });
      console.log(`${item.id}: ${last.close} (${last.date})`);
    } catch (err) {
      console.error(`${item.id} 실패: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return out;
}

async function collectCoins() {
  const markets = COINS.map((c) => c.market).join(',');
  const tickers = await getJSON(`https://api.upbit.com/v1/ticker?markets=${markets}`);
  const byMarket = new Map(tickers.map((t) => [t.market, t]));
  const out = [];

  for (const c of COINS) {
    const t = byMarket.get(c.market);
    if (!t) continue;
    let spark = [];
    try {
      const candles = await getJSON(
        `https://api.upbit.com/v1/candles/days?market=${c.market}&count=${DAYS}`
      );
      spark = candles.map((k) => k.trade_price).reverse();
    } catch (err) {
      console.error(`${c.id} 캔들 실패: ${err.message}`);
    }
    out.push({
      id: c.id,
      name: c.name,
      group: 'coin',
      unit: 'KRW',
      price: t.trade_price,
      change: t.signed_change_price,
      changePct: t.signed_change_rate * 100,
      spark,
    });
    console.log(`${c.id}: ${t.trade_price.toLocaleString()}`);
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}

const [stooq, coins] = await Promise.all([collectStooq(), collectCoins()]);
const items = [...stooq, ...coins];

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

await writeJSON(OUT, { updatedAt: nowKST(), items });
console.log(`done: ${items.length} items`);
