(() => {
  'use strict';

  const page = document.body.dataset.page || '';
  const isUsedCar = page === 'used-car' || page.startsWith('used-car-');
  const isNewCar = page === 'car' || page.startsWith('car-');
  if (!isUsedCar && !isNewCar) return;

  const config = isUsedCar
    ? {
        topic: 'used-car',
        eyebrow: 'USED CAR NEWS',
        title: '중고차 최신 뉴스',
        description: '시세·거래량·인기 차종 등 중고차 시장의 주요 소식을 모았습니다.',
        search: '"중고차 시세" OR "중고차 거래" OR "중고차 시장" OR "중고차 판매량"',
      }
    : {
        topic: 'car',
        eyebrow: 'AUTO NEWS',
        title: '자동차 최신 뉴스',
        description: '판매 실적·신차 출시·전기차 등 자동차 시장의 주요 소식을 모았습니다.',
        search: '"완성차 5사" OR "국내 자동차 판매" OR "수입차 판매량" OR "국내 신차 출시"',
      };

  const main = document.querySelector('main.car-page');
  if (!main || document.querySelector('#car-news-panel')) return;

  const section = document.createElement('section');
  section.id = 'car-news-panel';
  section.className = `car-panel car-news-panel${isUsedCar ? ' is-used-car' : ''}`;
  section.setAttribute('aria-labelledby', 'car-news-heading');
  section.innerHTML = `
    <div class="car-news-head">
      <div>
        <span>${config.eyebrow}</span>
        <h2 id="car-news-heading">${config.title}</h2>
        <p>${config.description}</p>
      </div>
      <button class="car-news-refresh" type="button" aria-controls="car-news-list">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8.1 8.1 0 1 0-2.3 5.7M20 4v7h-7"/></svg>
        <span>새 소식 확인</span>
      </button>
    </div>
    <div class="car-news-state" id="car-news-state" role="status" aria-live="polite">최신 소식을 불러오는 중입니다.</div>
    <ol class="car-news-grid" id="car-news-list" hidden></ol>
    <div class="car-news-foot" hidden>
      <p><span class="car-news-live-dot" aria-hidden="true"></span><span id="car-news-updated">매시간 자동 갱신</span></p>
      <a href="https://news.google.com/search?q=${encodeURIComponent(config.search)}&hl=ko&gl=KR&ceid=KR%3Ako" target="_blank" rel="noopener noreferrer nofollow">뉴스 더보기 <span aria-hidden="true">↗</span></a>
    </div>`;

  const sourcePanel = main.querySelector('.car-source-panel');
  if (sourcePanel) sourcePanel.before(section);
  else main.append(section);

  const list = section.querySelector('#car-news-list');
  const state = section.querySelector('#car-news-state');
  const foot = section.querySelector('.car-news-foot');
  const updated = section.querySelector('#car-news-updated');
  const refresh = section.querySelector('.car-news-refresh');
  let lastChecked = 0;

  const safeUrl = (value) => {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
      return null;
    }
  };

  const relativeTime = (value) => {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return '';
    const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000));
    if (minutes < 5) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days}일 전` : new Date(time).toLocaleDateString('ko-KR');
  };

  const render = (items) => {
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const href = safeUrl(item.link);
      if (!href) return;
      const row = document.createElement('li');
      if (index === 0) row.className = 'is-featured';

      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer nofollow';
      link.setAttribute('aria-label', `${item.title} 기사 열기`);

      const top = document.createElement('span');
      top.className = 'car-news-card-top';
      const badge = document.createElement('span');
      badge.className = 'car-news-rank';
      badge.textContent = index === 0 ? 'HOT' : String(index + 1).padStart(2, '0');
      const arrow = document.createElement('span');
      arrow.className = 'car-news-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '↗';
      top.append(badge, arrow);

      const title = document.createElement('strong');
      title.textContent = item.title;
      const meta = document.createElement('span');
      meta.className = 'car-news-meta';
      const source = document.createElement('b');
      source.textContent = item.source || '언론사';
      const age = document.createElement('time');
      if (item.date) age.dateTime = item.date;
      age.textContent = relativeTime(item.date);
      meta.append(source, document.createTextNode(age.textContent ? ' · ' : ''), age);

      link.append(top, title, meta);
      row.append(link);
      fragment.append(row);
    });
    list.replaceChildren(fragment);
  };

  const load = async ({ announce = false } = {}) => {
    refresh.disabled = true;
    refresh.classList.add('is-loading');
    section.setAttribute('aria-busy', 'true');
    if (announce) state.textContent = '새 소식을 확인하고 있습니다.';
    try {
      const response = await fetch(`/data/news.json?topic=${encodeURIComponent(config.topic)}&t=${Date.now()}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const seen = new Set();
      const items = (data.topics?.[config.topic] || [])
        .filter((item) => item?.title && item?.link && !seen.has(item.link) && (seen.add(item.link), true))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
        .slice(0, 6);
      if (!items.length) throw new Error('표시할 뉴스가 없습니다.');

      render(items);
      list.hidden = false;
      foot.hidden = false;
      state.hidden = true;
      const stamp = Date.parse(data.updatedAt);
      updated.textContent = Number.isFinite(stamp)
        ? `매시간 자동 갱신 · 마지막 수집 ${new Date(stamp).toLocaleString('ko-KR')}`
        : '매시간 자동 갱신';
      lastChecked = Date.now();
    } catch (error) {
      console.error('자동차 뉴스 로드 실패', error);
      state.hidden = false;
      state.textContent = list.childElementCount
        ? '새 소식을 확인하지 못해 기존 기사를 표시하고 있습니다.'
        : '최신 뉴스를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
    } finally {
      refresh.disabled = false;
      refresh.classList.remove('is-loading');
      section.removeAttribute('aria-busy');
    }
  };

  refresh.addEventListener('click', () => load({ announce: true }));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastChecked > 5 * 60_000) load();
  });
  setInterval(() => {
    if (!document.hidden) load();
  }, 15 * 60_000);

  load();
})();
