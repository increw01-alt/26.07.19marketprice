// 동행복권 회차별 당첨 정보를 누적 수집합니다.
// 총판매금액으로 회차별 판매 게임 수(= 구매 규모)를 계산합니다.
//
// 2026년 동행복권 사이트 개편으로 구 API(common.do?method=getLottoNumber)가 폐기됐습니다.
// 현재는 추첨결과 페이지가 쓰는 selectPstLt645InfoNew.do 를 사용하며,
// 한 번 호출에 요청 회차부터 과거로 10회차씩 돌려줍니다.
import { getJSON, readJSON, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/lotto.json';
const API = (n) =>
  `https://www.dhlottery.co.kr/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=${n}`;
const GAME_PRICE = 1000; // 1게임 1,000원

/** 1회차 추첨일(2002-12-07) 기준으로 오늘까지 나왔을 최대 회차 */
function maxPossibleRound() {
  const first = Date.UTC(2002, 11, 7);
  return Math.floor((Date.now() - first) / (7 * 86400_000)) + 1;
}

/** "20260718" → "2026-07-18" */
const toDate = (ymd) =>
  String(ymd).length === 8
    ? `${String(ymd).slice(0, 4)}-${String(ymd).slice(4, 6)}-${String(ymd).slice(6, 8)}`
    : String(ymd);

function normalize(row) {
  const sales = Number(row.wholEpsdSumNtslAmt) || 0;
  return {
    round: Number(row.ltEpsd),
    date: toDate(row.ltRflYmd),
    sales, // 총 판매금액(원)
    games: Math.round(sales / GAME_PRICE), // 판매 게임 수
    numbers: [row.tm1WnNo, row.tm2WnNo, row.tm3WnNo, row.tm4WnNo, row.tm5WnNo, row.tm6WnNo].map(
      Number
    ),
    bonus: Number(row.bnsWnNo),
    firstPrize: Number(row.rnk1WnAmt) || 0, // 1등 1인당 당첨금
    firstWinners: Number(row.rnk1WnNope) || 0,
    firstTotal: Number(row.rnk1SumWnAmt) || 0,
  };
}

/** 한 번 호출로 요청 회차 포함 과거 10회차를 받아옵니다. */
async function fetchBatch(round) {
  const res = await getJSON(API(round), {
    headers: { referer: 'https://www.dhlottery.co.kr/lt645/result' },
  });
  const list = res?.data?.list;
  if (!Array.isArray(list)) throw new Error('예상치 못한 응답 구조 — API가 또 바뀌었을 수 있습니다');
  return list
    .filter((r) => r && Number(r.ltEpsd) > 0 && Number(r.wholEpsdSumNtslAmt) > 0)
    .map(normalize);
}

const prev = await readJSON(OUT, { rounds: [] });
const known = new Map(prev.rounds.map((r) => [r.round, r]));
const before = known.size;

// 실제 최신 회차를 먼저 확인합니다 (미추첨 회차를 요청하면 그보다 과거 목록이 옵니다).
const probe = await fetchBatch(maxPossibleRound());
const latest = Math.max(...probe.map((r) => r.round));
probe.forEach((r) => known.set(r.round, r));
console.log(`최신 회차: ${latest}`);

// 아직 없는 회차만 10개 단위로 역순 수집
for (let n = latest; n >= 1; n -= 10) {
  const window = [];
  for (let i = n; i > n - 10 && i >= 1; i--) window.push(i);
  if (window.every((r) => known.has(r))) continue;

  const batch = await fetchBatch(n);
  if (!batch.length) break;
  batch.forEach((r) => known.set(r.round, r));
  console.log(`${n}회차 묶음: ${batch.length}건 (누적 ${known.size})`);
  await new Promise((res) => setTimeout(res, 200)); // 서버 부하 배려
}

const rounds = [...known.values()].sort((a, b) => a.round - b.round);
if (!rounds.length) throw new Error('수집된 회차가 없습니다');

await writeJSON(OUT, { updatedAt: nowKST(), gamePrice: GAME_PRICE, rounds });
console.log(`done: +${rounds.length - before} rounds, total ${rounds.length}`);
