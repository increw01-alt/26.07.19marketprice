// Build small browser-facing summaries from the larger source datasets.
// The original files remain available for detail pages and on-demand archive loading.
import { readJSON, writeJSON } from './lib.mjs';

const HOME_IDS = ['kospi', 'kosdaq', 'btc', 'kimchi', 'usdkrw', 'gold_don', 'wti', 'ust10'];
const RECENT_ROUNDS = 160;

const [markets, giftcards, lotto] = await Promise.all([
  readJSON('data/markets.json', null),
  readJSON('data/giftcards-dept.json', null),
  readJSON('data/lotto.json', null),
]);

if (!markets?.items?.length) throw new Error('data/markets.json is missing or empty');
if (!giftcards?.items?.length) throw new Error('data/giftcards-dept.json is missing or empty');
if (!lotto?.rounds?.length) throw new Error('data/lotto.json is missing or empty');

const marketById = new Map(markets.items.map((item) => [item.id, item]));
const homeMarkets = HOME_IDS.map((id) => marketById.get(id))
  .filter(Boolean)
  .map(({ id, name, group, unit, price, date, change, changePct, spark }) => ({
    id,
    name,
    group,
    unit,
    price,
    date,
    change,
    changePct,
    spark: Array.isArray(spark) ? spark.slice(-40) : [],
  }));

const bestGiftcard = giftcards.items
  .filter((item) => item.card === '롯데' && item.face === 100000 && Number.isFinite(item.buy))
  .sort((a, b) => b.buy - a.buy)[0];

const rounds = lotto.rounds
  .filter((round) => Number.isInteger(round.round))
  .slice()
  .sort((a, b) => b.round - a.round);
const latest = rounds[0];

await writeJSON('data/home.json', {
  updatedAt: markets.updatedAt,
  markets: homeMarkets,
  giftcard: bestGiftcard
    ? {
        shop: bestGiftcard.shop,
        method: bestGiftcard.method,
        buy: bestGiftcard.buy,
        buyRate: bestGiftcard.buyRate,
      }
    : null,
  lotto: latest
    ? {
        round: latest.round,
        date: latest.date,
        numbers: latest.numbers,
        bonus: latest.bonus,
        sales: latest.sales,
        firstWinners: latest.firstWinners,
      }
    : null,
});

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
