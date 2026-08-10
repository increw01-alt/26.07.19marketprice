import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from './_middleware.js';

test('retired shopping aliases return 410 and noindex', async () => {
  for (const pathname of ['/shopping', '/shopping/', '/shopping.html']) {
    const request = new Request(`https://modoosise.com${pathname}`);
    const response = await onRequest({
      request,
      next: async () => new Response('service retired', { status: 200 }),
    });
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, follow');
    assert.equal(await response.text(), 'service retired');
  }
});

test('alternate deployment hosts redirect to the canonical host', async () => {
  const request = new Request('https://26-07-19marketprice.pages.dev/coin?from=test');
  const response = await onRequest({
    request,
    next: async () => new Response('unexpected'),
  });
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('location'), 'https://modoosise.com/coin?from=test');
});
