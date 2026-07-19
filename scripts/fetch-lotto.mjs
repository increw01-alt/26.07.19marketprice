// 동행복권 회차별 당첨 정보를 누적 수집합니다.
// 총판매금액으로 회차별 판매 게임 수(= 구매 규모)를 계산합니다.
import { getJSON, readJSON, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/lotto.json';
const API = (n) => `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${n}`;
const GAME_PRICE = 1000; // 1게임 1,000원

/** 1회차 추첨일(2002-12-07) 기준으로 오늘까지 나왔을 최대 회차 */
function maxPossibleRound() {
  const first = Date.UTC(2002, 11, 7);
  const today = Date.now();
  return Math.floor((today - first) / (7 * 86400_000)) + 1;
}

async function fetchRound(n) {
  const d = await getJSON(API(n));
  if (d.returnValue !== 'success') return null;
  const sales = Number(d.totSellamnt) || 0;
  return {
    round: d.drwNo,
    date: d.drwNoDate,
    sales,                                   // 총 판매금액(원)
    games: Math.round(sales / GAME_PRICE),   // 판매 게임 수
    numbers: [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6],
    bonus: d.bnusNo,
    firstPrize: Number(d.firstWinamnt) || 0, // 1등 1인당 당첨금
    firstWinners: Number(d.firstPrzwnerCo) || 0,
    firstTotal: Number(d.firstAccumamnt) || 0,
  };
}

const prev = await readJSON(OUT, { rounds: [] });
const known = new Map(prev.rounds.map((r) => [r.round, r]));

const start = known.size ? Math.max(...known.keys()) + 1 : 1;
const end = maxPossibleRound();
let added = 0;

for (let n = start; n <= end; n++) {
  const r = await fetchRound(n);
  if (!r) {
    console.log(`round ${n}: not published yet — stopping`);
    break;
  }
  known.set(n, r);
  added++;
  console.log(`round ${n} (${r.date}) games=${r.games.toLocaleString()}`);
  await new Promise((res) => setTimeout(res, 120)); // 서버 부하 배려
}

const rounds = [...known.values()].sort((a, b) => a.round - b.round);
await writeJSON(OUT, { updatedAt: nowKST(), gamePrice: GAME_PRICE, rounds });
console.log(`done: +${added} rounds, total ${rounds.length}`);
