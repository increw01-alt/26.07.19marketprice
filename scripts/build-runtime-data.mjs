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

await writeJSON(
  'data/home.json',
  HOME_RENDER.composeHome({ markets, rates, dept, manual, realestate, lotto })
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
