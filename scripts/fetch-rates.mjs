// 한국은행 ECOS — 기준금리·예금금리·국고채 금리를 수집합니다.
// 인증키는 환경변수 ECOS_KEY 로만 받습니다 (GitHub Actions Secret).
import { getJSON, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/rates.json';

const KEY = process.env.ECOS_KEY;
if (!KEY) {
  console.error('환경변수 ECOS_KEY 가 없습니다.');
  process.exit(1);
}

/** KST 기준 YYYYMMDD / YYYYMM */
const kst = () => new Date(Date.now() + 9 * 3600_000);
const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');
const ym = (d) => d.toISOString().slice(0, 7).replace('-', '');

function monthsAgo(n) {
  const d = kst();
  d.setUTCMonth(d.getUTCMonth() - n);
  return d;
}
function daysAgo(n) {
  return new Date(kst().getTime() - n * 86400_000);
}

/**
 * ECOS 통계 조회. 주기(M/D)에 따라 기간 형식이 다릅니다.
 * 응답: StatisticSearch.row[] (없으면 RESULT 에 에러 코드)
 */
async function ecos(stat, cycle, from, to, item) {
  const url =
    `https://ecos.bok.or.kr/api/StatisticSearch/${KEY}/json/kr/1/500/` +
    `${stat}/${cycle}/${from}/${to}/${item}`;
  const res = await getJSON(url);
  const rows = res?.StatisticSearch?.row;
  if (!Array.isArray(rows) || !rows.length) {
    const err = res?.RESULT ? `${res.RESULT.CODE} ${res.RESULT.MESSAGE}` : '데이터 없음';
    throw new Error(err);
  }
  return rows
    .map((r) => ({ time: r.TIME, value: Number(r.DATA_VALUE) }))
    .filter((r) => Number.isFinite(r.value));
}

const SERIES = [
  { id: 'base_rate', name: '한국 기준금리', stat: '722Y001', cycle: 'M', item: '0101000' },
  { id: 'deposit', name: '정기예금 금리', stat: '121Y002', cycle: 'M', item: 'BEABAA2', note: '예금은행 저축성수신, 신규취급액 기준' },
  { id: 'call', name: '콜금리', stat: '817Y002', cycle: 'D', item: '010101000' },
  { id: 'ktb3', name: '국고채 3년', stat: '817Y002', cycle: 'D', item: '010200000' },
  { id: 'ktb10', name: '국고채 10년', stat: '817Y002', cycle: 'D', item: '010210000' },
];

const items = [];
for (const s of SERIES) {
  try {
    const [from, to] =
      s.cycle === 'M'
        ? [ym(monthsAgo(24)), ym(kst())]
        : [ymd(daysAgo(90)), ymd(kst())];
    const rows = await ecos(s.stat, s.cycle, from, to, s.item);
    const last = rows.at(-1);
    const prev = rows.at(-2);
    items.push({
      id: s.id,
      name: s.name,
      group: 'rates',
      unit: '%',
      price: last.value,
      change: prev ? Math.round((last.value - prev.value) * 1000) / 1000 : null,
      changePct: null, // 금리는 %p 변화만 보여줍니다 (비율 변화율은 오해 소지)
      date: last.time,
      spark: rows.slice(-40).map((r) => r.value),
      note: s.note || null,
    });
    console.log(`${s.name}: ${last.value}% (${last.time})`);
  } catch (err) {
    console.error(`${s.name} 실패: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}

if (!items.length) throw new Error('모든 금리 수집 실패');
await writeJSON(OUT, { updatedAt: nowKST(), items });
console.log(`done: ${items.length}/${SERIES.length}`);
