// POST /api/lotto/pick — 방문자가 뽑은 번호를 제한적으로 저장합니다.
import {
  cleanupAbuseRecords,
  consumeRateLimit,
  getDraws,
  isAllowedWriteSource,
  json,
  latestRoundOf,
  readJsonBody,
  releaseSubmission,
  reserveSubmission,
  validatePayload,
} from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'service-unavailable' }, 503);
  if (!isAllowedWriteSource(request)) return json({ error: 'forbidden' }, 403);

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  const structurallyValid = validatePayload(parsed.value);
  if (!structurallyValid) return json({ error: 'invalid' }, 400);

  let limiter;
  try {
    limiter = await consumeRateLimit(env, request);
    // 시간창의 첫 정상 요청만 만료된 방어 레코드를 조금씩 정리합니다.
    if (limiter.allowed && limiter.count === 1) await cleanupAbuseRecords(env);
  } catch (error) {
    console.error('lotto request guard unavailable', error);
    return json({ error: 'service-unavailable' }, 503);
  }
  if (!limiter.allowed) {
    return json(
      { error: 'rate-limited' },
      429,
      { 'retry-after': String(limiter.retryAfter) }
    );
  }

  let expectedRound;
  try {
    const latestRound = latestRoundOf(await getDraws(request));
    if (!latestRound) throw new Error('empty-draw-data');
    expectedRound = latestRound + 1;
  } catch (error) {
    console.error('lotto draw data unavailable', error);
    return json({ error: 'service-unavailable' }, 503);
  }
  const clean = validatePayload(parsed.value, expectedRound);
  if (!clean) return json({ error: 'invalid-round', expectedRound }, 422);

  let reservation;
  try {
    reservation = await reserveSubmission(env, limiter.fingerprint, clean);
    if (!reservation.reserved) return json({ ok: true, duplicate: true });

    await env.DB.prepare('INSERT INTO lotto_picks (round, games, created_at) VALUES (?, ?, ?)')
      .bind(clean.round, JSON.stringify(clean.games), Date.now())
      .run();
  } catch (error) {
    console.error('lotto pick write failed', error);
    try {
      await releaseSubmission(env, reservation);
    } catch (releaseError) {
      console.error('lotto pick reservation release failed', releaseError);
    }
    return json({ error: 'service-unavailable' }, 503);
  }
  return json({ ok: true });
}
