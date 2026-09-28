/* Observe only data used by this page. Reload only when a newer version exists. */
(() => {
  'use strict';
  const versions = new Map();
  const interval = 5 * 60 * 1000;
  let checking = false;
  let checkedAt = 0;
  let changed = false;
  let reloading = false;
  let statusStamp = null;
  let unavailable = false;

  function watch(path) {
    const url = new URL(path, location.href);
    if (url.origin === location.origin && url.pathname.startsWith('/data/') && !versions.has(url.pathname)) {
      versions.set(url.pathname, -Infinity);
    }
  }

  function track(path, data) {
    const url = new URL(path, location.href);
    const stamp = Date.parse(data?.checkedAt || data?.updatedAt);
    if (url.origin === location.origin && url.pathname.startsWith('/data/') && Number.isFinite(stamp)) {
      versions.set(url.pathname, stamp);
    } else if (versions.get(url.pathname) === -Infinity) {
      // Static geography/config JSON has no refresh timestamp.
      versions.delete(url.pathname);
    }
    return data;
  }

  function statusText(stamp, page, now = Date.now()) {
    const time = Date.parse(stamp);
    if (!Number.isFinite(time)) return { text: '데이터를 확인하지 못했습니다. 잠시 후 다시 확인합니다.', delayed: true };
    // Monthly car figures are checked daily; a quiet data month is not a failed check.
    const limits = { realestate: 48, lotto: 8 * 24, car: 48, 'car-domestic': 48,
      'car-imported': 48, 'used-car': 48, 'used-car-domestic': 48,
      'used-car-imported': 48, shopping: Infinity };
    const limit = limits[page] ?? 2;
    const delayed = now - time > limit * 3600000;
    const date = new Date(time).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
    return { delayed, text: `최종 수집 ${date} (한국시간) · ${delayed ? '갱신 지연 — 이전 수집 데이터를 표시 중입니다. · ' : ''}5분마다 새 데이터 확인` };
  }

  function paint() {
    if (statusStamp === null || document.body.dataset.page === 'about') return;
    const main = document.querySelector('main');
    if (!main) return;
    let el = document.getElementById('data-refresh-status');
    if (!el) {
      el = document.createElement('p');
      el.id = 'data-refresh-status';
      el.setAttribute('role', 'status');
      // Hero styling depends on :first-child; keep the existing first section in place.
      if (main.firstElementChild) main.firstElementChild.after(el);
      else main.append(el);
    }
    const status = statusText(statusStamp, document.body.dataset.page);
    el.className = `data-refresh-status${status.delayed || unavailable ? ' is-delayed' : ''}`;
    el.textContent = status.text + (unavailable ? ' · 연결 오류: 기존 데이터를 유지하고 재시도합니다.' : '');
  }

  function showStatus(stamp) {
    statusStamp = stamp || '';
    paint();
  }

  function safeToReload() {
    return !document.hidden && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')
      && !document.querySelector('dialog[open], [aria-modal="true"]');
  }

  async function check() {
    paint();
    if (document.hidden || checking || reloading) return;
    if (changed && safeToReload()) {
      reloading = true;
      location.reload();
      return;
    }
    if (!versions.size || Date.now() - checkedAt < 60000) return;
    checkedAt = Date.now();
    checking = true;
    let failed = false;
    try {
      await Promise.all([...versions].map(async ([path, previous]) => {
        try {
          const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          const stamp = Date.parse(data?.checkedAt || data?.updatedAt);
          if (!Number.isFinite(stamp)) throw new Error('Invalid update timestamp');
          if (stamp > previous) changed = true;
        } catch { failed = true; }
      }));
      unavailable = failed;
      paint();
      if (changed && safeToReload()) {
        reloading = true;
        location.reload();
      }
    } finally { checking = false; }
  }

  globalThis.MODOO_REFRESH = { watch, track, showStatus, check, statusText };
  setInterval(check, interval);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
  window.addEventListener('online', () => { checkedAt = 0; void check(); });
})();
