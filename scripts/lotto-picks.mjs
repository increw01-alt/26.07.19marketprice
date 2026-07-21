// 주간 로또 추천번호 생성 + 추첨 후 성적 채점.
//
// 중요: 로또는 완전 무작위라 당첨 확률을 높이는 방법은 없습니다.
// 여기서 만드는 "추천"은 과거 당첨번호의 통계 패턴(출현 빈도·홀짝·합계
// 범위 등)을 닮은 조합일 뿐, 확률을 높이지 못합니다. 화면에도 그렇게 고지합니다.
//
// 흐름:
//   - 다음 회차(추첨 전) 추천 5게임을 한 번 생성해 저장(주중 고정).
//   - 추첨이 끝난 회차는 실제 당첨번호와 대조해 등수를 기록.
import { readJSON, writeJSON, nowKST } from './lib.mjs';

const LOTTO = 'data/lotto.json';
const OUT = 'data/lotto-picks.json';
const GAMES = 5;
const KEEP = 12;

/** 전체 회차의 번호 출현 빈도 (1~45) */
function frequency(rounds) {
  const f = Array(46).fill(0);
  for (const r of rounds) for (const n of r.numbers) f[n]++;
  return f;
}

/** 빈도 가중 무작위로 6개 뽑기 (핫넘버에 약간 더 가중) */
function weightedPick(freq) {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const chosen = [];
  while (chosen.length < 6) {
    const total = pool.reduce((s, n) => s + (freq[n] || 1), 0);
    let r = Math.random() * total;
    let pick = pool[0];
    for (const n of pool) {
      r -= freq[n] || 1;
      if (r <= 0) { pick = n; break; }
    }
    chosen.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return chosen.sort((a, b) => a - b);
}

/** 실제 당첨 조합의 통계 특성을 닮았는지 검사 */
function passesFilters(nums) {
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum < 100 || sum > 175) return false; // 합계 대다수 구간
  const odd = nums.filter((n) => n % 2).length;
  if (odd < 2 || odd > 4) return false; // 홀짝 균형
  const low = nums.filter((n) => n <= 22).length;
  if (low < 2 || low > 4) return false; // 고저 균형
  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1] + 1) { run++; maxRun = Math.max(maxRun, run); }
    else run = 1;
  }
  return maxRun <= 2; // 연속 3개(11,12,13) 이상 배제
}

function smartGame(freq) {
  for (let i = 0; i < 300; i++) {
    const g = weightedPick(freq);
    if (passesFilters(g)) return g;
  }
  return weightedPick(freq);
}

/** 서로 다른 5게임 */
function makeGames(freq) {
  const games = [];
  const seen = new Set();
  let guard = 0;
  while (games.length < GAMES && guard++ < 1000) {
    const g = smartGame(freq);
    const key = g.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    games.push(g);
  }
  return games;
}

/** 한 게임 채점 (6/45 등수 규칙) */
function scoreGame(game, winNumbers, bonus) {
  const matched = game.filter((n) => winNumbers.includes(n)).length;
  const bonusHit = game.includes(bonus);
  let rank = 0; // 0 = 낙첨
  if (matched === 6) rank = 1;
  else if (matched === 5 && bonusHit) rank = 2;
  else if (matched === 5) rank = 3;
  else if (matched === 4) rank = 4;
  else if (matched === 3) rank = 5;
  return { matched, bonusHit, rank };
}

// ---------- 실행 ----------
const lotto = await readJSON(LOTTO, null);
if (!lotto?.rounds?.length) throw new Error('lotto.json 이 없습니다');

const rounds = lotto.rounds.slice().sort((a, b) => a.round - b.round);
const latest = rounds.at(-1).round;
const roundByNo = new Map(rounds.map((r) => [r.round, r]));
const freq = frequency(rounds);

const state = await readJSON(OUT, { picks: [] });
const byRound = new Map(state.picks.map((p) => [p.round, p]));

// 1) 다음 회차 추천 생성 (이미 있으면 유지 → 주중 고정)
const upcoming = latest + 1;
if (!byRound.has(upcoming)) {
  byRound.set(upcoming, {
    round: upcoming,
    createdAt: nowKST(),
    games: makeGames(freq),
    result: null,
  });
  console.log(`${upcoming}회 추천 5게임 생성`);
}

// 2) 추첨 끝난 추천 채점
for (const p of byRound.values()) {
  if (p.result || p.round > latest) continue;
  const r = roundByNo.get(p.round);
  if (!r) continue;
  const games = p.games.map((g) => scoreGame(g, r.numbers, r.bonus));
  const ranks = games.map((g) => g.rank || 9);
  const best = Math.min(...ranks);
  p.result = {
    winNumbers: r.numbers,
    bonus: r.bonus,
    date: r.date,
    games,
    best: best === 9 ? 0 : best,
  };
  console.log(`${p.round}회 채점 완료 (최고 ${p.result.best || '낙첨'}등)`);
}

const picks = [...byRound.values()].sort((a, b) => b.round - a.round).slice(0, KEEP);
await writeJSON(OUT, { updatedAt: nowKST(), picks });
console.log(`done: 추천 ${picks.length}건`);
