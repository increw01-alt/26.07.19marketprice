// Build small browser-facing summaries from the larger source datasets.
// The original files remain available for detail pages and on-demand archive loading.
// 홈 데이터 구성은 assets/home-render.js 의 composeHome 하나로 통일합니다 —
// 정적 프리렌더(build-static)와 런타임(home.json)이 절대 어긋나지 않게.
import { createRequire } from 'node:module';
import { readJSON, writeJSON } from './lib.mjs';

const require = createRequire(import.meta.url);
const HOME_RENDER = require('../assets/home-render.js');

const RECENT_ROUNDS = 160;

const [markets, dept, lotto, rates, manual, realestate] = await Promise.all([
  readJSON('data/markets.json', null),
  readJSON('data/giftcards-dept.json', null),
  readJSON('data/lotto.json', null),
  readJSON('data/rates.json', null),
  readJSON('data/giftcards.json', null),
  readJSON('data/realestate.json', null),
]);

if (!markets?.items?.length) throw new Error('data/markets.json is missing or empty');
if (!dept?.items?.length) throw new Error('data/giftcards-dept.json is missing or empty');
if (!lotto?.rounds?.length) throw new Error('data/lotto.json is missing or empty');

// 상품권 일별 이력 — 전일대비 계산용. 같은 날은 최신 값으로 덮고 60일만 유지합니다.
// (updatedAt 을 dept 스냅샷에서 파생시켜 같은 입력이면 같은 출력 — build-deploy --check 안전)
const HISTORY_KEEP_DAYS = 60;
const giftHistory = (await readJSON('data/giftcards-history.json', null)) || { days: {} };
{
  const day = String(dept.updatedAt || '').slice(0, 10);
  const snap = HOME_RENDER.giftSnapshot(dept, manual);
  if (day.length === 10 && Object.keys(snap).length) {
    giftHistory.days[day] = snap;
    const keys = Object.keys(giftHistory.days).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - HISTORY_KEEP_DAYS))) {
      delete giftHistory.days[k];
    }
    giftHistory.updatedAt = dept.updatedAt;
    await writeJSON('data/giftcards-history.json', giftHistory);
  }
}

await writeJSON(
  'data/home.json',
  HOME_RENDER.composeHome({ markets, rates, dept, manual, realestate, lotto, giftHistory })
);

const rounds = lotto.rounds
  .filter((round) => Number.isInteger(round.round))
  .slice()
  .sort((a, b) => b.round - a.round);

const frequency = Array(46).fill(0);
for (const round of rounds) {
  for (const number of round.numbers || []) {
    if (Number.isInteger(number) && number >= 1 && number <= 45) frequency[number]++;
  }
}

await writeJSON('data/lotto-recent.json', {
  updatedAt: lotto.updatedAt,
  gamePrice: lotto.gamePrice,
  totalRounds: rounds.length,
  frequency,
  rounds: rounds.slice(0, RECENT_ROUNDS),
});
