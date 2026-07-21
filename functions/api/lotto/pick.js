// POST /api/lotto/pick — 방문자가 뽑은 번호를 저장합니다.
import { json, validatePayload } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'db-unbound' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad-json' }, 400);
  }

  const clean = validatePayload(body);
  if (!clean) return json({ error: 'invalid' }, 400);

  try {
    await env.DB.prepare('INSERT INTO lotto_picks (round, games, created_at) VALUES (?, ?, ?)')
      .bind(clean.round, JSON.stringify(clean.games), Date.now())
      .run();
  } catch (err) {
    return json({ error: 'db-error', detail: String(err).slice(0, 120) }, 500);
  }
  return json({ ok: true });
}
