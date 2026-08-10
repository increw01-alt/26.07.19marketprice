// GET /api/lotto/results — 이 사이트에서 나온 당첨 공개 피드와 제한된 통계입니다.
import {
  cleanupOldPicks,
  ensurePublicStats,
  json,
  safeStoredSample,
  scorePending,
} from './_lib.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'service-unavailable' }, 503);

  // 유지보수와 채점은 각각 처리량이 제한되어 있어 한 번의 GET이 DB 전체를 순회하지 않습니다.
  try {
    await ensurePublicStats(env);
    await cleanupOldPicks(env);
    await scorePending(env, request);
  } catch (error) {
    // 채점이 잠시 실패해도 이미 저장된 공개 결과는 계속 제공할 수 있습니다.
    console.error('lotto maintenance failed', error);
  }

  try {
    const { results = [] } = await env.DB.prepare(
      `SELECT round, games, best_rank, created_at
         FROM lotto_picks
        WHERE best_rank BETWEEN 1 AND 5
        ORDER BY created_at DESC
        LIMIT 30`
    ).all();

    const stats = await env.DB.prepare(
      `SELECT total_scored AS total, wins
         FROM lotto_public_stats
        WHERE singleton = 1`
    ).first();

    return json({
      results: results.map((row) => ({
        round: Number(row.round),
        best: Number(row.best_rank),
        at: Number(row.created_at),
        sample: safeStoredSample(row.games),
      })),
      stats: { total: Number(stats?.total || 0), wins: Number(stats?.wins || 0) },
    });
  } catch (error) {
    console.error('lotto results read failed', error);
    return json({ error: 'service-unavailable' }, 503);
  }
}
