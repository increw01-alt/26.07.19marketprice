// 로또 추첨기 API 공용 헬퍼 (Cloudflare Pages Functions).

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

/** 6/45 등수 (0=낙첨) */
export function rankOf(game, winNumbers, bonus) {
  const matched = game.filter((n) => winNumbers.includes(n)).length;
  const bonusHit = game.includes(bonus);
  if (matched === 6) return 1;
  if (matched === 5 && bonusHit) return 2;
  if (matched === 5) return 3;
  if (matched === 4) return 4;
  if (matched === 3) return 5;
  return 0;
}

/** 여러 게임 중 최고 등수 (0=전부 낙첨) */
export function bestRank(games, winNumbers, bonus) {
  let best = 9;
  for (const g of games) {
    const r = rankOf(g, winNumbers, bonus);
    if (r >= 1 && r < best) best = r;
  }
  return best === 9 ? 0 : best;
}

/** 저장 요청 검증: games 는 6개 서로 다른 1~45 번호의 배열, 최대 5게임 */
export function validatePayload(body) {
  const round = Number(body?.round);
  const games = body?.games;
  if (!Number.isInteger(round) || round < 1 || round > 99999) return null;
  if (!Array.isArray(games) || games.length < 1 || games.length > 5) return null;
  const clean = [];
  for (const g of games) {
    if (!Array.isArray(g) || g.length !== 6) return null;
    const set = new Set();
    for (const n of g) {
      if (!Number.isInteger(n) || n < 1 || n > 45) return null;
      set.add(n);
    }
    if (set.size !== 6) return null;
    clean.push([...set].sort((a, b) => a - b));
  }
  return { round, games: clean };
}

/** 우리 사이트 lotto.json 에서 회차별 당첨번호 맵을 가져옵니다 (5분 캐시). */
export async function getDraws(request) {
  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}/data/lotto.json`, { cf: { cacheTtl: 300, cacheEverything: true } });
  if (!res.ok) throw new Error(`lotto.json ${res.status}`);
  const data = await res.json();
  return new Map((data.rounds || []).map((r) => [r.round, { numbers: r.numbers, bonus: r.bonus, date: r.date }]));
}

/** 미채점(best_rank IS NULL) + 추첨완료 회차의 추천을 채점합니다. */
export async function scorePending(env, request) {
  const { results: rounds } = await env.DB.prepare(
    'SELECT DISTINCT round FROM lotto_picks WHERE best_rank IS NULL'
  ).all();
  if (!rounds.length) return;

  let draws;
  try {
    draws = await getDraws(request);
  } catch {
    return; // 당첨번호를 못 가져오면 다음 요청에서 다시 시도
  }

  for (const { round } of rounds) {
    const d = draws.get(round);
    if (!d) continue; // 아직 추첨 전
    const { results: picks } = await env.DB.prepare(
      'SELECT id, games FROM lotto_picks WHERE round = ? AND best_rank IS NULL LIMIT 1000'
    )
      .bind(round)
      .all();
    if (!picks.length) continue;
    const stmts = picks.map((p) => {
      let best = 0;
      try {
        best = bestRank(JSON.parse(p.games), d.numbers, d.bonus);
      } catch {}
      return env.DB.prepare('UPDATE lotto_picks SET best_rank = ? WHERE id = ?').bind(best, p.id);
    });
    await env.DB.batch(stmts);
  }
}
