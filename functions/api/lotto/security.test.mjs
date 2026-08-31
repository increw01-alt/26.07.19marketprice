import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  API_SECURITY_HEADERS,
  DEDUP_TTL_MS,
  MAX_SCORE_PICKS_PER_ROUND,
  RATE_LIMIT,
  bestRank,
  consumeRateLimit,
  isAllowedWriteSource,
  json,
  latestRoundOf,
  readJsonBody,
  requestFingerprint,
  reserveSubmission,
  safeStoredSample,
  scorePending,
  sha256Hex,
  validatePayload,
} from './_lib.js';
import { onRequestPost } from './pick.js';
import { onRequestGet } from './results.js';

class D1StatementMock {
  constructor(statement, values = []) {
    this.statement = statement;
    this.values = values;
  }

  bind(...values) {
    return new D1StatementMock(this.statement, values);
  }

  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  async first() {
    return this.statement.get(...this.values) || null;
  }

  async all() {
    return { success: true, results: this.statement.all(...this.values) };
  }
}

class D1Mock {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1StatementMock(this.database.prepare(sql));
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

const games = [
  [45, 1, 2, 3, 4, 5],
  [7, 8, 9, 10, 11, 12],
];

assert.deepEqual(validatePayload({ round: 1200, games }, 1200), {
  round: 1200,
  games: [
    [1, 2, 3, 4, 5, 45],
    [7, 8, 9, 10, 11, 12],
  ],
});
assert.equal(validatePayload({ round: 1199, games }, 1200), null);
assert.equal(validatePayload({ round: '1200', games }, 1200), null);
assert.equal(validatePayload({ round: 1200, games: [[1, 1, 2, 3, 4, 5]] }), null);
assert.equal(validatePayload({ round: 1200, games: [[1, 2, 3, 4, 46]] }), null);

assert.equal(
  isAllowedWriteSource(
    new Request('https://modoosise.com/api/lotto/pick', {
      method: 'POST',
      headers: { origin: 'https://modoosise.com', 'sec-fetch-site': 'same-origin' },
    })
  ),
  true
);
assert.equal(
  isAllowedWriteSource(
    new Request('https://modoosise.com/api/lotto/pick', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    })
  ),
  false
);
assert.equal(
  isAllowedWriteSource(new Request('https://modoosise.com/api/lotto/pick', { method: 'POST' })),
  true,
  'non-browser API clients may omit Origin and Fetch Metadata'
);

const validJson = await readJsonBody(
  new Request('https://modoosise.com/api/lotto/pick', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ round: 1200, games }),
  })
);
assert.equal(validJson.ok, true);
assert.equal(
  (
    await readJsonBody(
      new Request('https://modoosise.com/api/lotto/pick', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      })
    )
  ).status,
  415
);
assert.equal(
  (
    await readJsonBody(
      new Request('https://modoosise.com/api/lotto/pick', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'x'.repeat(300) }),
      }),
      64
    )
  ).status,
  413
);

assert.equal(latestRoundOf(new Map([[2, {}], [17, {}], [9, {}]])), 17);
assert.equal(bestRank([[1, 2, 3, 4, 5, 6]], [1, 2, 3, 4, 5, 6], 7), 1);
assert.deepEqual(safeStoredSample('[[6,5,4,3,2,1]]'), [1, 2, 3, 4, 5, 6]);
assert.deepEqual(safeStoredSample('[["<img>",2,3,4,5,6]]'), []);
assert.equal((await sha256Hex('modoosise')).length, 64);
assert.equal(API_SECURITY_HEADERS['x-content-type-options'], 'nosniff');
const response = json({ ok: true });
assert.equal(response.headers.get('content-security-policy')?.includes("default-src 'none'"), true);
assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');

// D1 호환 SQL: 한도 도달 뒤 카운터가 더 쓰이지 않고, 만료된 중복 예약은 재사용됩니다.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../../../schema.sql', import.meta.url), 'utf8'));
const env = { DB: new D1Mock(sqlite), LOTTO_RATE_SALT: 'unit-test-only' };
const rateRequest = new Request('https://modoosise.com/api/lotto/pick', {
  method: 'POST',
  headers: {
    'cf-connecting-ip': '192.0.2.10',
    'user-agent': 'lotto-security-test',
  },
});
// 실제 현재 시각을 씁니다. 과거 고정 시각(예: 2026-08-07)을 쓰면 API 경로가
// 내부적으로 Date.now() 로 도는 cleanupOldPicks 의 보존기간(21일)이 지난 순간
// 시드 데이터가 삭제되어 테스트가 시한폭탄처럼 깨집니다 — 실제로 2026-08-28부터
// 매시간 워크플로가 이 테스트에서 실패해 시세 갱신이 멈춘 원인이었습니다.
const now = Date.now();
const rotatedAgentRequest = new Request('https://modoosise.com/api/lotto/pick', {
  method: 'POST',
  headers: {
    'cf-connecting-ip': '192.0.2.10',
    'user-agent': 'attacker-controlled-rotation',
  },
});
assert.equal(
  await requestFingerprint(rateRequest, env, now),
  await requestFingerprint(rotatedAgentRequest, env, now)
);
for (let index = 0; index < RATE_LIMIT; index += 1) {
  assert.equal((await consumeRateLimit(env, rateRequest, now)).allowed, true);
}
assert.equal((await consumeRateLimit(env, rateRequest, now)).allowed, false);
assert.equal(sqlite.prepare('SELECT request_count FROM lotto_rate_limits').get().request_count, RATE_LIMIT);

const fingerprint = (await consumeRateLimit(env, rateRequest, now)).fingerprint;
const payload = { round: 1, games: [[1, 2, 3, 4, 5, 6]] };
assert.equal((await reserveSubmission(env, fingerprint, payload, now)).reserved, true);
assert.equal((await reserveSubmission(env, fingerprint, payload, now + 1)).reserved, false);
assert.equal(
  (await reserveSubmission(env, fingerprint, payload, now + DEDUP_TTL_MS + 1)).reserved,
  true
);

// 한 번의 GET 채점량이 제한되고 누적 통계 트리거가 동작합니다.
const insertPick = sqlite.prepare(
  'INSERT INTO lotto_picks (round, games, created_at) VALUES (?, ?, ?)'
);
for (let index = 0; index < 60; index += 1) {
  insertPick.run(1, JSON.stringify(payload.games), now);
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(
    JSON.stringify({ rounds: [{ round: 1, numbers: [1, 2, 3, 4, 5, 6], bonus: 7 }] }),
    { headers: { 'content-type': 'application/json' } }
  );
try {
  assert.equal(
    await scorePending(env, new Request('https://modoosise.com/api/lotto/results'), now),
    MAX_SCORE_PICKS_PER_ROUND
  );
  assert.equal(
    sqlite.prepare('SELECT COUNT(*) AS count FROM lotto_picks WHERE best_rank IS NULL').get().count,
    60 - MAX_SCORE_PICKS_PER_ROUND
  );
  let publicStats = sqlite.prepare('SELECT total_scored, wins FROM lotto_public_stats').get();
  assert.equal(publicStats.total_scored, MAX_SCORE_PICKS_PER_ROUND);
  assert.equal(publicStats.wins, MAX_SCORE_PICKS_PER_ROUND);

  const postRequest = () =>
    new Request('https://modoosise.com/api/lotto/pick', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': '192.0.2.20',
        origin: 'https://modoosise.com',
        'sec-fetch-site': 'same-origin',
      },
      body: JSON.stringify({ round: 2, games: payload.games }),
    });
  assert.equal((await onRequestPost({ request: postRequest(), env })).status, 200);
  const duplicateResponse = await onRequestPost({ request: postRequest(), env });
  assert.equal(duplicateResponse.status, 200);
  assert.equal((await duplicateResponse.json()).duplicate, true);

  const resultsResponse = await onRequestGet({
    request: new Request('https://modoosise.com/api/lotto/results'),
    env,
  });
  assert.equal(resultsResponse.status, 200);
  const resultsBody = await resultsResponse.json();
  assert.equal(resultsBody.results.length, 30);
  assert.deepEqual(resultsBody.stats, {
    total: MAX_SCORE_PICKS_PER_ROUND * 2,
    wins: MAX_SCORE_PICKS_PER_ROUND * 2,
  });
  publicStats = sqlite.prepare('SELECT total_scored, wins FROM lotto_public_stats').get();
  assert.equal(publicStats.total_scored, MAX_SCORE_PICKS_PER_ROUND * 2);
  assert.equal(publicStats.wins, MAX_SCORE_PICKS_PER_ROUND * 2);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('lotto security tests passed');
