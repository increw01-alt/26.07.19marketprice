// 로또 추첨기 API 공용 헬퍼 (Cloudflare Pages Functions / D1).

export const MAX_JSON_BODY_BYTES = 2_048;
export const RATE_WINDOW_MS = 10 * 60 * 1_000;
export const RATE_LIMIT = 12;
export const DEDUP_TTL_MS = 15 * 60 * 1_000;
export const PENDING_RETENTION_MS = 21 * 24 * 60 * 60 * 1_000;
export const LOSING_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
export const WINNING_RETENTION_MS = 365 * 24 * 60 * 60 * 1_000;
// 최초 스키마 보정까지 포함해 D1 Free의 호출당 50개 쿼리 한도 안에 유지합니다.
export const MAX_SCORE_ROUNDS = 2;
export const MAX_SCORE_PICKS_PER_ROUND = 17;

const DAY_MS = 24 * 60 * 60 * 1_000;
const MAINTENANCE_BATCH_SIZE = 100;

export const API_SECURITY_HEADERS = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex',
});

export const json = (obj, status = 200, extraHeaders = {}) => {
  const headers = new Headers(API_SECURITY_HEADERS);
  headers.set('content-type', 'application/json; charset=utf-8');
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(JSON.stringify(obj), { status, headers });
};

/** 브라우저의 교차 사이트 쓰기는 막되, Origin/Fetch Metadata가 없는 API 클라이언트는 허용합니다. */
export function isAllowedWriteSource(request) {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return false;

  const origin = request.headers.get('origin');
  if (origin === null) return true;
  if (origin.trim().toLowerCase() === 'null') return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Content-Type과 실제 읽은 바이트 수를 모두 확인하는 작은 JSON 본문 판독기입니다. */
export async function readJsonBody(request, maxBytes = MAX_JSON_BODY_BYTES) {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { ok: false, error: 'unsupported-media-type', status: 415 };
  }

  const lengthValue = request.headers.get('content-length');
  if (lengthValue !== null) {
    if (!/^\d+$/.test(lengthValue.trim())) return { ok: false, error: 'bad-request', status: 400 };
    if (Number(lengthValue) > maxBytes) return { ok: false, error: 'body-too-large', status: 413 };
  }

  let bytes;
  try {
    if (request.body?.getReader) {
      const reader = request.body.getReader();
      const chunks = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxBytes) {
            try {
              await reader.cancel();
            } catch {
              // 이미 끊긴 과대 요청도 일관되게 413으로 처리합니다.
            }
            return { ok: false, error: 'body-too-large', status: 413 };
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } else {
      bytes = new Uint8Array(await request.arrayBuffer());
      if (bytes.byteLength > maxBytes) return { ok: false, error: 'body-too-large', status: 413 };
    }
  } catch {
    return { ok: false, error: 'bad-request', status: 400 };
  }

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'bad-json', status: 400 };
  }
}

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
  for (const game of games) {
    const rank = rankOf(game, winNumbers, bonus);
    if (rank >= 1 && rank < best) best = rank;
  }
  return best === 9 ? 0 : best;
}

/** 저장 요청 검증: games는 6개 서로 다른 1~45 번호의 배열, 최대 5게임입니다. */
export function validatePayload(body, expectedRound = null) {
  const round = body?.round;
  const games = body?.games;
  if (!Number.isInteger(round) || round < 1 || round > 99_999) return null;
  if (expectedRound !== null && round !== expectedRound) return null;
  if (!Array.isArray(games) || games.length < 1 || games.length > 5) return null;

  const clean = [];
  for (const game of games) {
    if (!Array.isArray(game) || game.length !== 6) return null;
    const numbers = new Set();
    for (const number of game) {
      if (!Number.isInteger(number) || number < 1 || number > 45) return null;
      numbers.add(number);
    }
    if (numbers.size !== 6) return null;
    clean.push([...numbers].sort((a, b) => a - b));
  }
  return { round, games: clean };
}

/** 우리 사이트 lotto.json에서 회차별 당첨번호 맵을 가져옵니다 (5분 캐시). */
export async function getDraws(request) {
  const origin = new URL(request.url).origin;
  const response = await fetch(`${origin}/data/lotto.json`, {
    cf: { cacheTtl: 300, cacheEverything: true },
  });
  if (!response.ok) throw new Error('draw-data-unavailable');

  const data = await response.json();
  const draws = new Map();
  for (const draw of data?.rounds || []) {
    if (!Number.isInteger(draw?.round) || !Array.isArray(draw?.numbers)) continue;
    draws.set(draw.round, { numbers: draw.numbers, bonus: draw.bonus, date: draw.date });
  }
  return draws;
}

export function latestRoundOf(draws) {
  let latest = 0;
  for (const round of draws.keys()) {
    if (Number.isInteger(round) && round > latest) latest = round;
  }
  return latest;
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 원본 IP를 저장하지 않는 일 단위 회전 지문입니다. LOTTO_RATE_SALT 설정을 권장합니다. */
export async function requestFingerprint(request, env, now = Date.now()) {
  const ip = request.headers.get('cf-connecting-ip')?.trim().slice(0, 80);
  const userAgent = (request.headers.get('user-agent') || 'unknown').slice(0, 200);
  const language = (request.headers.get('accept-language') || '').slice(0, 80);
  const day = Math.floor(now / DAY_MS);
  const salt = String(env.LOTTO_RATE_SALT || new URL(request.url).hostname);
  // Cloudflare가 제공한 IP가 있으면 공격자가 바꿀 수 있는 UA/언어로 한도를 우회하지 못하게 IP만 씁니다.
  // 로컬 테스트처럼 IP 헤더가 없는 경우에만 클라이언트 특성을 제한적인 폴백으로 사용합니다.
  const identity = ip ? `ip:${ip}` : `client:${userAgent}\n${language}`;
  return (await sha256Hex(`${salt}\n${day}\n${identity}`)).slice(0, 32);
}

let abuseSchemaPromise;
let statsSchemaPromise;

/** 기존 D1에도 별도 수동 마이그레이션 없이 방어용 테이블을 추가합니다. */
export async function ensureAbuseSchema(env) {
  if (!abuseSchemaPromise) {
    abuseSchemaPromise = env.DB.batch([
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS lotto_rate_limits (
        fingerprint TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        request_count INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (fingerprint, window_start)
      )`),
      env.DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_lotto_rate_expiry ON lotto_rate_limits(expires_at)'
      ),
      env.DB.prepare(`CREATE TABLE IF NOT EXISTS lotto_submission_guard (
        fingerprint TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (fingerprint, payload_hash)
      )`),
      env.DB.prepare(
        'CREATE INDEX IF NOT EXISTS idx_lotto_guard_expiry ON lotto_submission_guard(expires_at)'
      ),
    ]).catch((error) => {
      abuseSchemaPromise = undefined;
      throw error;
    });
  }
  return abuseSchemaPromise;
}

export async function cleanupAbuseRecords(env, now = Date.now()) {
  await ensureAbuseSchema(env);
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM lotto_rate_limits
      WHERE rowid IN (
        SELECT rowid FROM lotto_rate_limits
        WHERE expires_at < ? ORDER BY expires_at LIMIT ?
      )`).bind(now, MAINTENANCE_BATCH_SIZE),
    env.DB.prepare(`DELETE FROM lotto_submission_guard
      WHERE rowid IN (
        SELECT rowid FROM lotto_submission_guard
        WHERE expires_at < ? ORDER BY expires_at LIMIT ?
      )`).bind(now, MAINTENANCE_BATCH_SIZE),
  ]);
}

/** 시간창 요청 제한을 증가시키고 허용 여부와 재시도 시간을 반환합니다. */
export async function consumeRateLimit(env, request, now = Date.now()) {
  await ensureAbuseSchema(env);
  const fingerprint = await requestFingerprint(request, env, now);
  const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const expiresAt = windowStart + RATE_WINDOW_MS * 2;

  // 한도 도달 뒤에는 SELECT 한 번만 수행해 공격 트래픽이 D1 쓰기를 계속 만들지 않게 합니다.
  const current = await env.DB.prepare(`SELECT request_count
      FROM lotto_rate_limits WHERE fingerprint = ? AND window_start = ?`)
    .bind(fingerprint, windowStart)
    .first();
  const currentCount = Number(current?.request_count || 0);
  if (currentCount >= RATE_LIMIT) {
    return {
      allowed: false,
      count: currentCount,
      fingerprint,
      retryAfter: Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1_000)),
    };
  }

  const result = await env.DB.prepare(`INSERT INTO lotto_rate_limits
      (fingerprint, window_start, request_count, expires_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(fingerprint, window_start) DO UPDATE SET
        request_count = request_count + 1,
        expires_at = excluded.expires_at
      WHERE lotto_rate_limits.request_count < ?`)
    .bind(fingerprint, windowStart, expiresAt, RATE_LIMIT)
    .run();

  const allowed = Number(result.meta?.changes || 0) === 1;
  return {
    allowed,
    count: allowed ? currentCount + 1 : RATE_LIMIT,
    fingerprint,
    retryAfter: Math.max(1, Math.ceil((windowStart + RATE_WINDOW_MS - now) / 1_000)),
  };
}

/** 같은 방문자·회차·번호 묶음은 짧은 시간 동안 한 번만 예약합니다. */
export async function reserveSubmission(env, fingerprint, payload, now = Date.now()) {
  await ensureAbuseSchema(env);
  const payloadHash = (await sha256Hex(JSON.stringify(payload))).slice(0, 32);
  const result = await env.DB.prepare(`INSERT INTO lotto_submission_guard
      (fingerprint, payload_hash, expires_at) VALUES (?, ?, ?)
      ON CONFLICT(fingerprint, payload_hash) DO UPDATE SET
        expires_at = excluded.expires_at
      WHERE lotto_submission_guard.expires_at < ?`)
    .bind(fingerprint, payloadHash, now + DEDUP_TTL_MS, now)
    .run();
  return {
    reserved: Number(result.meta?.changes || 0) === 1,
    fingerprint,
    payloadHash,
  };
}

export async function releaseSubmission(env, reservation) {
  if (!reservation?.reserved) return;
  await env.DB.prepare(
    'DELETE FROM lotto_submission_guard WHERE fingerprint = ? AND payload_hash = ?'
  )
    .bind(reservation.fingerprint, reservation.payloadHash)
    .run();
}

/** 오래된 미채점·낙첨·당첨 레코드를 한 요청당 제한된 수만 정리합니다. */
export async function cleanupOldPicks(env, now = Date.now()) {
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM lotto_picks
      WHERE id IN (
        SELECT id FROM lotto_picks
        WHERE best_rank IS NULL AND created_at < ?
        ORDER BY created_at LIMIT ?
      )`).bind(now - PENDING_RETENTION_MS, MAINTENANCE_BATCH_SIZE),
    env.DB.prepare(`DELETE FROM lotto_picks
      WHERE id IN (
        SELECT id FROM lotto_picks
        WHERE best_rank = 0 AND created_at < ?
        ORDER BY created_at LIMIT ?
      )`).bind(now - LOSING_RETENTION_MS, MAINTENANCE_BATCH_SIZE),
    env.DB.prepare(`DELETE FROM lotto_picks
      WHERE id IN (
        SELECT id FROM lotto_picks
        WHERE best_rank BETWEEN 1 AND 5 AND created_at < ?
        ORDER BY created_at LIMIT ?
      )`).bind(now - WINNING_RETENTION_MS, MAINTENANCE_BATCH_SIZE),
  ]);
}

/** 누적 통계를 매 GET마다 전체 스캔하지 않도록 1행 카운터와 채점 트리거를 준비합니다. */
export async function ensurePublicStats(env) {
  if (!statsSchemaPromise) {
    statsSchemaPromise = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS lotto_public_stats (
          singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
          total_scored INTEGER NOT NULL DEFAULT 0,
          wins INTEGER NOT NULL DEFAULT 0
        )`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_picks_pending_round_at
          ON lotto_picks(round, created_at) WHERE best_rank IS NULL`),
        env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_picks_rank_at
          ON lotto_picks(best_rank, created_at)`),
      ]);

      const existing = await env.DB.prepare(
        'SELECT singleton FROM lotto_public_stats WHERE singleton = 1'
      ).first();
      const trigger = env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_lotto_score_stats
        AFTER UPDATE OF best_rank ON lotto_picks
        WHEN OLD.best_rank IS NULL AND NEW.best_rank IS NOT NULL
        BEGIN
          UPDATE lotto_public_stats
             SET total_scored = total_scored + 1,
                 wins = wins + CASE WHEN NEW.best_rank BETWEEN 1 AND 5 THEN 1 ELSE 0 END
           WHERE singleton = 1;
        END`);

      if (existing) {
        await trigger.run();
      } else {
        // 기존 배포 DB는 최초 1회만 집계하고 이후에는 트리거로 O(1) 통계를 유지합니다.
        await env.DB.batch([
          env.DB.prepare(`INSERT OR IGNORE INTO lotto_public_stats
              (singleton, total_scored, wins)
            SELECT 1,
                   COUNT(*),
                   COALESCE(SUM(CASE WHEN best_rank BETWEEN 1 AND 5 THEN 1 ELSE 0 END), 0)
              FROM lotto_picks
             WHERE best_rank IS NOT NULL`),
          trigger,
        ]);
      }
    })().catch((error) => {
      statsSchemaPromise = undefined;
      throw error;
    });
  }
  return statsSchemaPromise;
}

/** 미채점 중 추첨이 끝난 레코드를 요청당 최대 2회차 × 17건만 채점합니다. */
export async function scorePending(env, request, now = Date.now()) {
  const { results: rounds = [] } = await env.DB.prepare(`SELECT round
      FROM lotto_picks
      WHERE best_rank IS NULL AND created_at >= ?
      GROUP BY round
      ORDER BY round
      LIMIT ?`)
    .bind(now - PENDING_RETENTION_MS, MAX_SCORE_ROUNDS)
    .all();
  if (!rounds.length) return 0;

  let draws;
  try {
    draws = await getDraws(request);
  } catch {
    return 0;
  }

  let scored = 0;
  for (const { round } of rounds) {
    const draw = draws.get(round);
    if (!draw) continue;
    const { results: picks = [] } = await env.DB.prepare(`SELECT id, games
        FROM lotto_picks
        WHERE round = ? AND best_rank IS NULL AND created_at >= ?
        ORDER BY id
        LIMIT ?`)
      .bind(round, now - PENDING_RETENTION_MS, MAX_SCORE_PICKS_PER_ROUND)
      .all();
    if (!picks.length) continue;

    const statements = picks.map((pick) => {
      let rank = 0;
      try {
        rank = bestRank(JSON.parse(pick.games), draw.numbers, draw.bonus);
      } catch {
        // 레거시 또는 손상 레코드는 낙첨으로 종결해 반복 파싱을 막습니다.
      }
      return env.DB.prepare(
        'UPDATE lotto_picks SET best_rank = ? WHERE id = ? AND best_rank IS NULL'
      ).bind(rank, pick.id);
    });
    await env.DB.batch(statements);
    scored += statements.length;
  }
  return scored;
}

/** 공개 피드에 안전하게 넣을 수 있는 첫 게임만 반환합니다. */
export function safeStoredSample(gamesJson) {
  try {
    const games = JSON.parse(gamesJson);
    const sample = games?.[0];
    if (!Array.isArray(sample) || sample.length !== 6) return [];
    if (sample.some((number) => !Number.isInteger(number) || number < 1 || number > 45)) return [];
    if (new Set(sample).size !== 6) return [];
    return [...sample].sort((a, b) => a - b);
  } catch {
    return [];
  }
}
