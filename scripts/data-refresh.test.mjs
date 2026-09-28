import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../assets/data-refresh.js', import.meta.url), 'utf8');
const stamp = '2026-09-28T09:00:00+09:00';
const later = '2026-09-28T10:00:00+09:00';
function setup() {
  let now = Date.parse(stamp) + 30 * 60000;
  const elements = new Map();
  const listeners = {};
  const state = { reloads: 0, requests: [], editing: false, modal: false, next: { updatedAt: stamp } };
  const document = {
    hidden: false, body: { dataset: { page: 'stock' } },
    activeElement: { matches: () => state.editing },
    querySelector: (selector) => selector === 'main'
      ? { firstElementChild: { after: (el) => elements.set(el.id, el) } } : state.modal,
    getElementById: (id) => elements.get(id),
    createElement: () => ({ setAttribute() {} }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  class Clock extends Date { static now() { return now; } }
  const ctx = vm.createContext({ document, URL, Date: Clock, AbortSignal,
    location: { href: 'https://modoosise.com/stock', origin: 'https://modoosise.com', reload: () => state.reloads++ },
    window: { addEventListener: (name, fn) => { listeners[name] = fn; } },
    setInterval: (fn, ms) => { state.timer = fn; state.interval = ms; },
    fetch: async (path, options) => {
      state.requests.push({ path, options });
      if (state.error) throw new Error('offline');
      if (state.wait) await state.wait;
      return { ok: !state.httpError, status: 500, json: async () => state.next };
    },
  });
  vm.runInContext(source, ctx);
  return { api: ctx.MODOO_REFRESH, state, document, listeners, elements, advance: () => { now += 5 * 60000; } };
}

test('unchanged data is checked without reload; a newer version reloads once', async () => {
  const { api, state, advance } = setup();
  api.track('/data/markets.json', { updatedAt: stamp });
  assert.equal(state.interval, 300000);
  await api.check();
  assert.equal(state.reloads, 0);
  assert.equal(state.requests[0].options.cache, 'no-store');
  advance();
  state.next = { updatedAt: later };
  await api.check();
  await api.check();
  assert.equal(state.reloads, 1);
});

test('recovers when the initial data request failed', async () => {
  const { api, state } = setup();
  api.watch('/data/markets.json');
  api.showStatus(null);
  await api.check();
  assert.equal(state.reloads, 1);
});

test('daily car verification is tracked separately from an unchanged monthly publication', async () => {
  const { api, state } = setup();
  api.track('/data/car-sales.json', { updatedAt: '2026-09-03T00:00:00Z', checkedAt: stamp });
  state.next = { updatedAt: '2026-09-03T00:00:00Z', checkedAt: later };
  await api.check();
  assert.equal(state.reloads, 1);
  assert.equal(api.statusText(stamp, 'car', Date.parse(stamp) + 49 * 3600000).delayed, true);
});

test('does not refresh hidden tabs; defers new data while typing or using a modal', async () => {
  const { api, state, document } = setup();
  api.track('/data/markets.json', { updatedAt: stamp });
  document.hidden = true;
  await api.check();
  assert.equal(state.requests.length, 0);
  document.hidden = false;
  state.editing = true;
  state.next = { updatedAt: later };
  await api.check();
  assert.equal(state.reloads, 0);
  state.editing = false;
  state.modal = true;
  await api.check();
  assert.equal(state.reloads, 0);
  state.modal = false;
  await api.check();
  assert.equal(state.reloads, 1);
});

test('network/HTTP/invalid data errors preserve current content and retry', async () => {
  const { api, state, elements, advance } = setup();
  api.track('/data/markets.json', { updatedAt: stamp });
  api.showStatus(stamp);
  for (const failure of ['error', 'httpError', 'invalid']) {
    state.error = failure === 'error';
    state.httpError = failure === 'httpError';
    state.next = failure === 'invalid' ? {} : { updatedAt: stamp };
    advance();
    await api.check();
    assert.equal(state.reloads, 0);
    assert.match(elements.get('data-refresh-status').textContent, /연결 오류/);
  }
  state.next = { updatedAt: later };
  advance();
  await api.check();
  assert.equal(state.reloads, 1);
});

test('skips foreign/non-data URLs, older versions and overlapping requests', async () => {
  const { api, state } = setup();
  api.track('https://foreign.example/data/news.json', { updatedAt: stamp });
  api.track('/assets/config.json', { updatedAt: stamp });
  api.watch('/data/korea-provinces.json');
  api.track('/data/korea-provinces.json', { features: [] });
  api.track('/data/markets.json', { updatedAt: later });
  let release;
  state.wait = new Promise((resolve) => { release = resolve; });
  const first = api.check();
  await api.check();
  assert.equal(state.requests.length, 1);
  release();
  await first;
  assert.equal(state.reloads, 0);
});

test('warns after two hours, respects slow sources and ages status without new data', async () => {
  const { api, elements, advance } = setup();
  const old = Date.parse(stamp) + 3 * 3600000;
  assert.equal(api.statusText(stamp, 'stock', old).delayed, true);
  assert.equal(api.statusText(stamp, 'realestate', old).delayed, false);
  assert.equal(api.statusText(stamp, 'car-domestic', old).delayed, false);
  assert.equal(api.statusText('invalid', 'stock', old).delayed, true);
  api.showStatus(stamp);
  for (let i = 0; i < 20; i++) advance();
  await api.check();
  assert.match(elements.get('data-refresh-status').textContent, /갱신 지연/);
  assert.equal(elements.size, 1);
});

test('all generated page types load the controller before app.js', () => {
  for (const page of ['index.html', 'stock.html', 'coin.html', 'car/domestic.html', 'giftcard/lotte.html', 'used-car.html']) {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.equal((html.match(/src="\/?assets\/data-refresh.js/g) || []).length, 1, page);
    assert.ok(html.indexOf('assets/data-refresh.js') < html.indexOf('assets/app.js'), page);
  }
});
