(() => {
  'use strict';

  const page = document.body.dataset.page || '';
  const isUsedCar = page === 'used-car' || page.startsWith('used-car-');
  const isNewCar = page === 'car' || page.startsWith('car-');
  if (!isUsedCar && !isNewCar) return;

  const topic = isUsedCar ? 'used-car' : 'car';
  const main = document.querySelector('main.car-page');
  if (!main || document.querySelector('#car-news-panel')) return;

  const NEWS_PER_PAGE = 10;
  let items = [];
  let currentPage = 1;
  let lastChecked = 0;

  const section = document.createElement('section');
  section.id = 'car-news-panel';
  section.className = 'car-panel news-panel car-related-news';
  section.setAttribute('aria-labelledby', 'car-news-heading');
  section.innerHTML = `
    <h2 id="car-news-heading">관련 뉴스 <span class="tag">구글뉴스</span></h2>
    <p class="car-related-news-state" id="car-news-state" role="status" aria-live="polite">최신 뉴스를 불러오는 중입니다.</p>
    <ul class="news-list" id="car-news-list" hidden></ul>
    <nav class="pager" id="car-news-pager" aria-label="뉴스 페이지 이동" hidden>
      <button type="button" class="pager-btn" id="car-news-prev">◀ 이전</button>
      <span class="pager-info" id="car-news-info" aria-live="polite"></span>
      <button type="button" class="pager-btn" id="car-news-next">다음 ▶</button>
    </nav>
    <p class="note" id="car-news-note" hidden></p>`;

  const sourcePanel = main.querySelector('.car-source-panel');
  if (sourcePanel) sourcePanel.before(section);
  else main.append(section);

  const list = section.querySelector('#car-news-list');
  const state = section.querySelector('#car-news-state');
  const pager = section.querySelector('#car-news-pager');
  const info = section.querySelector('#car-news-info');
  const prev = section.querySelector('#car-news-prev');
  const next = section.querySelector('#car-news-next');
  const note = section.querySelector('#car-news-note');

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
    const hours = Math.max(0, Math.floor((Date.now() - time) / 3_600_000));
    if (hours < 1) return '방금 전';
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days}일 전` : new Date(time).toLocaleDateString('ko-KR');
  };

  const renderPage = () => {
    const pageCount = Math.ceil(items.length / NEWS_PER_PAGE);
    currentPage = Math.min(Math.max(currentPage, 1), pageCount);
    const pageItems = items.slice((currentPage - 1) * NEWS_PER_PAGE, currentPage * NEWS_PER_PAGE);
    const fragment = document.createDocumentFragment();

    pageItems.forEach((item) => {
      const href = safeUrl(item.link);
      if (!href) return;

      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer nofollow';
      link.textContent = item.title;
      link.setAttribute('aria-label', `${item.title} 기사 열기`);

      const meta = document.createElement('span');
      meta.className = 'news-meta';
      const age = relativeTime(item.date);
      meta.textContent = `${item.source || '언론사'}${age ? ` · ${age}` : ''}`;

      row.append(link, meta);
      fragment.append(row);
    });

    list.replaceChildren(fragment);
    info.textContent = `${currentPage} / ${pageCount}`;
    prev.disabled = currentPage === 1;
    next.disabled = currentPage === pageCount;
    pager.hidden = pageCount <= 1;
  };

  const fetchNews = async () => {
    const cacheBuster = Date.now();
    try {
      const archiveResponse = await fetch(`/data/news/${topic}.json?t=${cacheBuster}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!archiveResponse.ok) throw new Error(`HTTP ${archiveResponse.status}`);
      const archive = await archiveResponse.json();
      return { items: archive.items, updatedAt: archive.updatedAt };
    } catch {
      const snapshotResponse = await fetch(`/data/news.json?t=${cacheBuster}`, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!snapshotResponse.ok) throw new Error(`HTTP ${snapshotResponse.status}`);
      const snapshot = await snapshotResponse.json();
      return { items: snapshot.topics?.[topic], updatedAt: snapshot.updatedAt };
    }
  };

  const load = async () => {
    section.setAttribute('aria-busy', 'true');
    try {
      const data = await fetchNews();
      const seen = new Set();
      const nextItems = (data.items || [])
        .filter((item) => {
          const href = safeUrl(item?.link);
          if (!item?.title || !href || seen.has(href)) return false;
          seen.add(href);
          return true;
        })
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
      if (!nextItems.length) throw new Error('표시할 뉴스가 없습니다.');

      items = nextItems;
      renderPage();
      list.hidden = false;
      state.hidden = true;
      note.hidden = false;
      const stamp = Date.parse(data.updatedAt);
      const collectedAt = Number.isFinite(stamp) ? new Date(stamp).toLocaleString('ko-KR') : '확인 중';
      note.textContent = `최종 수집: ${collectedAt} · 총 ${items.length}건`;
      lastChecked = Date.now();
    } catch (error) {
      console.error('자동차 관련 뉴스 로드 실패', error);
      state.hidden = false;
      state.textContent = items.length
        ? '새 소식을 확인하지 못해 기존 기사를 표시하고 있습니다.'
        : '관련 뉴스를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
    } finally {
      section.removeAttribute('aria-busy');
    }
  };

  prev.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    renderPage();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  next.addEventListener('click', () => {
    if (currentPage >= Math.ceil(items.length / NEWS_PER_PAGE)) return;
    currentPage += 1;
    renderPage();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastChecked > 5 * 60_000) load();
  });
  setInterval(() => {
    if (!document.hidden) load();
  }, 15 * 60_000);

  load();
})();
