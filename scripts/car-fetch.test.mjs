import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCarFetcher } from './car-fetch.mjs';

test('retries connection timeouts and 503 with a fresh signal and original POST body', async () => {
  const calls = [], waits = [];
  const request = createCarFetcher({ wait: async (ms) => waits.push(ms), fetchImpl: async (url, options) => {
    calls.push(options);
    if (calls.length === 1) throw new TypeError('fetch failed: connect timeout');
    return new Response(calls.length === 2 ? 'busy' : 'August data', { status: calls.length === 2 ? 503 : 200 });
  } });
  const response = await request('https://source.example/data', { method: 'POST', body: 'year=2026' });
  assert.equal(await response.text(), 'August data');
  assert.deepEqual(waits, [2000, 4000]);
  assert.equal(new Set(calls.map((call) => call.signal)).size, 3);
  assert.ok(calls.every((call) => call.method === 'POST' && call.body === 'year=2026'));
});

test('retries body read failures and stops after the bounded attempt count', async () => {
  let count = 0;
  const request = createCarFetcher({ wait: async () => {}, fetchImpl: async () => {
    count++;
    return { ok: true, text: async () => { throw new Error('body timeout'); } };
  } });
  await assert.rejects(request('https://source.example/data'), /body timeout/);
  assert.equal(count, 3);
});

test('does not retry permanent HTTP failures; retries rate limiting', async () => {
  for (const [status, expected] of [[403, 1], [404, 1], [429, 3]]) {
    let count = 0;
    const request = createCarFetcher({ wait: async () => {}, fetchImpl: async () => {
      count++;
      return new Response('failure', { status });
    } });
    await assert.rejects(request('https://source.example/data'), new RegExp(`HTTP ${status}`));
    assert.equal(count, expected);
  }
});

test('daily workflow reports partial collection failures after preserving successful outputs', () => {
  const yaml = readFileSync(new URL('../.github/workflows/update-car-sales.yml', import.meta.url), 'utf8');
  assert.match(yaml, /cron: '43 1 \* \* \*'/);
  for (const id of ['sales', 'rankings', 'used']) {
    assert.match(yaml, new RegExp(`id: ${id}`));
    assert.ok(yaml.includes(`steps.${id}.outcome`));
  }
  assert.ok(yaml.indexOf('수집 결과 최종 확인') > yaml.indexOf('git push'));
  assert.match(yaml, /if: always\(\)/);
  assert.match(yaml, /exit 1/);
});
