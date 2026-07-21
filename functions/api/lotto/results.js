// GET /api/lotto/results — 이 사이트에서 나온 당첨(1~5등) 공개 피드 + 통계.
import { json, scorePending } from './_lib.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ results: [], stats: { total: 0, wins: 0 } });

  // 미채점 + 추첨완료 건을 먼저 채점 (idempotent, 한 번 채점되면 이후엔 건너뜀)
  try {
    await scorePending(env, request);
  } catch (err) {
    // 채점 실패해도 기존 결과는 반환
    console.error(err);
  }

  const { results } = await env.DB.prepare(
    `SELECT round, games, best_rank, created_at
       FROM lotto_picks
      WHERE best_rank BETWEEN 1 AND 5
      ORDER BY created_at DESC
      LIMIT 30`
  ).all();

  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN best_rank BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS wins
       FROM lotto_picks
      WHERE best_rank IS NOT NULL`
  ).first();

  return json({
    results: results.map((r) => {
      let sample = [];
      try {
        // 대표로 첫 게임만 노출 (전체 5게임을 다 보여줄 필요는 없음)
        sample = JSON.parse(r.games)[0] || [];
      } catch {}
      return { round: r.round, best: r.best_rank, at: r.created_at, sample };
    }),
    stats: { total: stats?.total || 0, wins: stats?.wins || 0 },
  });
}
