'use strict';

/* 페이지별 렌더러. app.js 의 공용 함수를 사용합니다. */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const safeWebUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''), location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};
const urlAttr = (value) => esc(safeWebUrl(value) || '#');
const safeDealUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''));
    if (url.protocol === 'http:' && url.hostname.toLowerCase() === 'www.ppomppu.co.kr') {
      url.protocol = 'https:';
    }
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const updateQuery = (values, mode = 'push') => {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value == null || value === '' || value === '전체' || value === 'new') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', `${url.pathname}${url.search}${url.hash}`);
};

// ---------- 홈 대시보드 ----------
// 마크업 생성은 home-render.js(프리렌더와 공유)가 담당하고,
// 여기서는 최신 home.json 으로 각 마운트를 갱신만 합니다.
async function pageHome() {
  const home = await fetchJSON('/data/home.json');
  const R = globalThis.MODOO_HOME_RENDER;
  if (R) {
    const put = (sel, html) => {
      const el = $(sel);
      if (el && html) el.innerHTML = html;
    };
    put('#hero-live', R.heroLive(home));
    put('#hero-stats', R.heroStats(home));
    put('#hero-pill', R.heroPill(home));
    put('#cat-grid', R.catCards(home));
    put('#kpi-grid', R.kpiCards(home));
    put('#btc-block', R.btcBlock(home));
    put('#gift-rows', R.giftRows(home));
    // #quick-grid 는 데이터와 무관한 정적 링크라 프리렌더 그대로 둡니다.
  }
  setStatus(home.updatedAt);
}

// ---------- 단순 그룹 페이지 ----------
async function pageGroup(groupOrIds, mount) {
  const { data } = await renderMarketGroup(groupOrIds, mount);
  setStatus(data.updatedAt);
}

/** 지수 + 개별종목 두 그리드를 함께 그립니다 (주식·코스닥). */
async function pageStock(indexIds, stockGroup, indexMount, stockMount) {
  const data = await fetchJSON('/data/markets.json');
  const put = (sel, list) => {
    const el = $(sel);
    if (el)
      el.innerHTML = list.length
        ? list.map((it, i) => card(it, i)).join('')
        : '<p class="empty">데이터를 불러오지 못했습니다.</p>';
  };
  put(indexMount, indexIds.map((id) => data.items.find((i) => i.id === id)).filter(Boolean));
  put(stockMount, data.items.filter((i) => i.group === stockGroup));
  setStatus(data.updatedAt);
}

/** 별도 데이터 파일(rates.json / oil.json)을 그리드에 그립니다. */
async function renderExtra(path, mount) {
  try {
    const data = await fetchJSON(path);
    const el = $(mount);
    if (el && data.items?.length) {
      el.innerHTML = data.items.map((it, i) => card(it, i)).join('');
      return data.updatedAt;
    }
  } catch (err) {
    console.error(err); // 부가 섹션이므로 실패해도 페이지를 막지 않습니다.
    const el = $(mount);
    // 빌드 시 넣은 정적 스냅샷이 있으면 장애 중에도 그대로 보존합니다.
    if (el && !el.children.length) {
      el.innerHTML = '<p class="empty">데이터를 불러오지 못했습니다.</p>';
    }
  }
  return null;
}

/** 유가·원자재 페이지: markets(energy) + oil(주유소) 두 섹션 */
async function pageEnergy() {
  const { data } = await renderMarketGroup(
    ['wti', 'brent', 'natgas', 'copper', 'wheat', 'corn'],
    '#grid-energy'
  );
  await renderExtra('/data/oil.json', '#grid-oil');
  setStatus(data.updatedAt);
}

/** 지표 페이지: markets(macro) + rates(금리) 두 섹션 */
async function pageMacro() {
  const { data } = await renderMarketGroup(['dxy', 'vix', 'ust10', 'kimchi'], '#grid-macro');
  await renderExtra('/data/rates.json', '#grid-rates');
  setStatus(data.updatedAt);
}

// ---------- 상품권 ----------
let dept = null;
let face = null;
const faceLabel = (n) => (n >= 10000 ? `${n / 10000}만원권` : `${n.toLocaleString('ko-KR')}원권`);
const shopLabel = (i) => (i.method ? `${i.shop} · ${i.method}` : i.shop);

async function pageGiftcard() {
  const [d, manual] = await Promise.allSettled([
    fetchJSON('/data/giftcards-dept.json'),
    fetchJSON('/data/giftcards.json'),
  ]);

  if (d.status === 'fulfilled') {
    dept = d.value;
    const ok = dept.shops.filter((s) => s.ok);
    $('#dept-note').textContent =
      `${ok.length}개 업체 공식 시세 페이지에서 직접 수집했습니다. ` +
      `최종 갱신: ${new Date(dept.updatedAt).toLocaleString('ko-KR')}`;

    $('#dept-sources .source-list').innerHTML = dept.shops
      .map(
        (s) =>
          `<li><a href="${urlAttr(s.site)}" target="_blank" rel="noopener noreferrer nofollow">${esc(s.name)}</a>` +
          `<span class="src-state ${s.ok ? 'ok' : 'ng'}">${s.ok ? `${finite(s.count)}건` : '수집 실패'}</span></li>`
      )
      .join('');

    const faces = [...new Set(dept.items.map((i) => Number(i.face)))]
      .filter((value) => Number.isInteger(value) && value > 0 && value <= 10_000_000)
      .sort((a, b) => a - b);
    const requestedFace = Number(new URLSearchParams(location.search).get('face'));
    face = faces.includes(requestedFace) ? requestedFace : faces.includes(100000) ? 100000 : faces[0];
    $('#face-seg').innerHTML = faces
      .map(
        (f) =>
          `<button type="button" class="seg-btn" data-face="${f}" aria-pressed="${f === face}">${faceLabel(f)}</button>`
      )
      .join('');
    $('#face-seg').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      face = Number(btn.dataset.face);
      $$('#face-seg .seg-btn').forEach((b) =>
        b.setAttribute('aria-pressed', String(Number(b.dataset.face) === face))
      );
      updateQuery({ face });
      renderDept();
    });
    addEventListener('popstate', () => {
      const next = Number(new URLSearchParams(location.search).get('face'));
      face = faces.includes(next) ? next : faces.includes(100000) ? 100000 : faces[0];
      $$('#face-seg .seg-btn').forEach((b) =>
        b.setAttribute('aria-pressed', String(Number(b.dataset.face) === face))
      );
      renderDept();
    });
    renderDept();
    setStatus(dept.updatedAt);
  } else {
    // allSettled 라 상위 .catch() 가 걸리지 않습니다.
    // 여기서 직접 알리지 않으면 헤더가 "불러오는 중…" 에 영구히 남습니다.
    console.error(d.reason);
    $('#dept-note').textContent = '백화점 상품권 시세를 불러오지 못했습니다.';
    setStatus(null);
  }

  if (manual.status === 'fulfilled') renderManualGift(manual.value);
  else console.error(manual.reason);
}

/** 브랜드 상세의 시각은 정적 가격표와 같은 스냅샷을 사용합니다. */
async function pageGiftcardBrand() {
  const snapshot = $('time[datetime]');
  if (snapshot) setStatus(snapshot.dateTime);
}

function renderDept() {
  const rows = dept.items.filter((i) => i.face === face);
  const cards = [...new Set(rows.map((i) => i.card))];

  $('#grid-dept').innerHTML = cards
    .map((cardName, idx) => {
      const list = rows.filter((i) => i.card === cardName);
      const bestBuy = list.filter((i) => i.buy != null).sort((a, b) => b.buy - a.buy)[0];
      const bestSell = list.filter((i) => i.sell != null).sort((a, b) => a.sell - b.sell)[0];

      const best = (item, kind) => {
        if (!item) return `<div class="best"><span class="k">${kind}</span><span class="v flat">—</span></div>`;
        const isBuy = kind === '최고 매입가';
        return `<div class="best">
          <span class="k">${kind}<small>${isBuy ? '팔 때' : '살 때'}</small></span>
          <span class="v">${won(isBuy ? item.buy : item.sell)}</span>
          <span class="m">${
            (isBuy ? item.buyRate : item.sellRate) != null
              ? `${num(isBuy ? item.buyRate : item.sellRate, 2)}% · `
              : ''
          }${esc(shopLabel(item))}</span>
        </div>`;
      };

      const detail = list
        .slice()
        .sort((a, b) => (b.buy ?? 0) - (a.buy ?? 0))
        .map(
          (i) => `<tr>
            <td>${esc(shopLabel(i))}</td>
            <td class="num${i === bestBuy ? ' is-best' : ''}">${i.buy != null ? won(i.buy) : '—'}</td>
            <td class="num${i === bestSell ? ' is-best' : ''}">${i.sell != null ? won(i.sell) : '—'}</td>
          </tr>`
        )
        .join('');

      return `<article class="gc" style="--i:${idx}">
        <header class="gc-head"><h3>${esc(cardName)}</h3><span class="gc-face">${esc(faceLabel(face))}</span></header>
        <div class="gc-best">${best(bestBuy, '최고 매입가')}${best(bestSell, '최저 판매가')}</div>
        <details class="gc-all">
          <summary>업체별 전체 ${list.length}건</summary>
          <div class="table-scroll">
            <table class="tbl">
              <thead><tr><th>업체</th><th class="num">매입가</th><th class="num">판매가</th></tr></thead>
              <tbody>${detail}</tbody>
            </table>
          </div>
        </details>
      </article>`;
    })
    .join('');
}

function renderManualGift(data) {
  const priced = data.items.filter((i) => typeof i.rate === 'number');
  $('#gift-note').textContent = priced.length
    ? `수동 관리 데이터입니다. 최종 갱신: ${new Date(data.updatedAt).toLocaleString('ko-KR')}`
    : '문화상품권·해피머니 등은 업체가 시세를 공개하지 않아 수동으로 입력합니다. data/giftcards.json 의 rate 값을 채우면 표시됩니다.';

  $('#tbl-gift tbody').innerHTML = data.items
    .map((i) => {
      const has = typeof i.rate === 'number';
      return `<tr>
        <td>${esc(i.name)}</td>
        <td class="num">${won(i.face)}</td>
        <td class="num">${has ? num(i.rate, 1) + '%' : '<span class="flat">미입력</span>'}</td>
        <td class="num">${has ? won(Math.round((i.face * i.rate) / 100)) : '<span class="flat">—</span>'}</td>
      </tr>`;
    })
    .join('');
}

// ---------- 핫딜 (커뮤니티 RSS) ----------
let hotdeals = [];
let dealUpdatedAt = null;
let dealCat = '전체';
let dealSort = 'new';
// 카테고리 표시 순서 (데이터에 있는 것만 노출)
const CAT_ORDER = ['식품', '디지털·가전', '생활', '패션·뷰티', '건강', '쿠폰·상품권', '기타'];

async function pageHotdeal() {
  const data = await fetchJSON('/data/hotdeals.json');
  hotdeals = (data.deals || [])
    .map((deal) => ({ ...deal, link: safeDealUrl(deal.link) }))
    .filter((deal) => deal.link);
  dealUpdatedAt = data.updatedAt;

  // 카테고리 칩 (전체 + 데이터에 실제로 있는 카테고리)
  const present = new Set(hotdeals.map((d) => d.cat || '기타'));
  const cats = ['전체', ...CAT_ORDER.filter((c) => present.has(c))];
  const params = new URLSearchParams(location.search);
  const requestedCat = params.get('category');
  const requestedSort = params.get('sort');
  dealCat = cats.includes(requestedCat) ? requestedCat : '전체';
  dealSort = requestedSort === 'price' ? 'price' : 'new';
  $('#deal-cat').innerHTML = cats
    .map(
      (c) =>
        `<button type="button" class="seg-btn" data-cat="${c}" aria-pressed="${c === dealCat}">${c}</button>`
    )
    .join('');

  $('#deal-cat').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    dealCat = b.dataset.cat;
    $$('#deal-cat .seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.cat === dealCat)));
    updateQuery({ category: dealCat, sort: dealSort });
    renderDeals();
  });
  $('#deal-sort').addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    dealSort = b.dataset.sort;
    $$('#deal-sort .seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.sort === dealSort)));
    updateQuery({ category: dealCat, sort: dealSort });
    renderDeals();
  });

  $$('#deal-sort .seg-btn').forEach((x) =>
    x.setAttribute('aria-pressed', String(x.dataset.sort === dealSort))
  );
  addEventListener('popstate', () => {
    const next = new URLSearchParams(location.search);
    dealCat = cats.includes(next.get('category')) ? next.get('category') : '전체';
    dealSort = next.get('sort') === 'price' ? 'price' : 'new';
    $$('#deal-cat .seg-btn').forEach((x) =>
      x.setAttribute('aria-pressed', String(x.dataset.cat === dealCat))
    );
    $$('#deal-sort .seg-btn').forEach((x) =>
      x.setAttribute('aria-pressed', String(x.dataset.sort === dealSort))
    );
    renderDeals();
  });

  renderDeals();
  setStatus(data.updatedAt);
}

function renderDeals() {
  let list = dealCat === '전체' ? hotdeals.slice() : hotdeals.filter((d) => (d.cat || '기타') === dealCat);
  if (dealSort === 'price') {
    // 가격 있는 딜을 낮은 순으로, 가격 없는 딜은 뒤로.
    list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  }

  $('#hotdeal-note').textContent =
    `${list.length}건${dealCat === '전체' ? '' : ` (전체 ${hotdeals.length})`} · 최종 갱신: ${new Date(dealUpdatedAt).toLocaleString('ko-KR')}`;

  $('#hotdeal-list').innerHTML = list
    .map(
      (d, i) => `<li class="deal" style="--i:${i}">
        <a class="deal-link" href="${urlAttr(d.link)}" target="_blank" rel="noopener noreferrer nofollow">
          <span class="deal-title">${esc(d.title)}</span>
        </a>
        <div class="deal-meta">
          ${d.mall ? `<span class="deal-mall">${esc(d.mall)}</span>` : ''}
          ${d.price ? `<span class="deal-price">${won(d.price)}</span>` : ''}
          ${d.direct ? '<span class="deal-direct">판매처 바로가기 ↗</span>' : `<span class="deal-src">${esc(d.source)} 원문</span>`}
          ${d.direct ? `<span class="deal-src">${esc(d.source)}</span>` : ''}
          <span class="deal-age">${newsAge(d.date)}</span>
        </div>
      </li>`
    )
    .join('');
}

// ---------- 가격비교 (네이버 쇼핑) ----------
async function pageShopping() {
  const data = await fetchJSON('/data/shopping.json');
  $('#shop-note').textContent =
    `${data.products.length}개 상품을 ${data.source || '네이버 쇼핑'}에서 판매처별로 비교했습니다. ` +
    `최종 갱신: ${new Date(data.updatedAt).toLocaleString('ko-KR')}`;

  $('#grid-shopping').innerHTML = data.products
    .map((p, idx) => {
      const best = p.offers[0];
      const rows = p.offers
        .map(
          (o) => `<tr>
            <td>${esc(o.mall)}</td>
            <td class="num${o === best ? ' is-best' : ''}">${
              o.link
                ? `<a href="${urlAttr(o.link)}" target="_blank" rel="noopener noreferrer nofollow">${won(o.price)}</a>`
                : won(o.price)
            }</td>
          </tr>`
        )
        .join('');
      const search = `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(p.query)}`;
      return `<article class="gc shop-card" style="--i:${idx}">
        <div class="shop-head">
          ${p.image && safeWebUrl(p.image) ? `<img class="shop-img" src="${urlAttr(p.image)}" alt="" loading="lazy" width="64" height="64" referrerpolicy="no-referrer">` : ''}
          <div class="shop-meta">
            <h3>${esc(p.name)}</h3>
            <p class="shop-best">최저가 <b>${won(best.price)}</b> <span class="hint">${esc(best.mall)}</span></p>
          </div>
        </div>
        <details class="gc-all">
          <summary>판매처별 ${p.offers.length}곳 비교</summary>
          <div class="table-scroll">
            <table class="tbl">
              <thead><tr><th>판매처</th><th class="num">최저가</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </details>
        <p class="shop-src"><a href="${search}" target="_blank" rel="noopener noreferrer nofollow">네이버 쇼핑에서 더 보기 ${icon('arrow')}</a></p>
      </article>`;
    })
    .join('');

  setStatus(data.updatedAt);
}

// ---------- 부동산 (지도) ----------
let realestate = null; // /data/realestate.json (없으면 자리표시 유지)

// 지도(kostat 2018)는 구 시도코드를 쓰고, 실거래 데이터의 법정동코드는
// 행정개편 때마다 바뀝니다(강원 42→51, 전북 45→52, 광주·전남 → 12 통합).
// 접두사 매핑 대신 데이터 항목의 sido 이름으로 필터링합니다 —
// 광주와 전남이 같은 코드(12)를 공유하게 되면서 접두사로는 구분할 수 없습니다.

/** 2026-07-01 전남광주통합특별시 출범 — 지도에서는 두 지역을 계속 나눠 보여줍니다. */
const UNIFIED_NOTE = { 광주: '전남광주통합특별시', 전남: '전남광주통합특별시' };

async function pageRealestate() {
  const [mapRes, reRes] = await Promise.allSettled([
    fetchJSON('/data/korea-provinces.json'),
    fetchJSON('/data/realestate.json'),
  ]);
  if (mapRes.status !== 'fulfilled') throw mapRes.reason;
  const map = mapRes.value;
  const provinces = (map.provinces || [])
    .map((province) => ({
      lawd: String(province.lawd ?? '').replace(/\D/g, '').slice(0, 5),
      name: String(province.name ?? '').slice(0, 30),
      full: String(province.full ?? province.name ?? '').slice(0, 60),
      d: String(province.d ?? ''),
      label: [finite(province.label?.[0]), finite(province.label?.[1])],
    }))
    .filter(
      (province) =>
        province.lawd &&
        province.name &&
        /^[MmZzLlHhVvCcSsQqTtAaEe0-9+.,\-\s]+$/.test(province.d)
    );
  if (!provinces.length) throw new Error('지도 지역 데이터가 올바르지 않습니다.');
  const mapWidth = Math.min(Math.max(finite(map.width, 800), 1), 2000);
  const mapHeight = Math.min(Math.max(finite(map.height, 700), 1), 2000);
  if (reRes.status === 'fulfilled') realestate = reRes.value;
  else console.error(reRes.reason);

  // SVG 에는 z-index 가 없어 나중에 그려진 것이 위에 옵니다.
  // 확대본을 별도 레이어(kmap-top)에 <use> 로 얹어 잘리지 않게 합니다.
  $('#map-root').innerHTML = `
    <div class="map-picker">
      <label for="region-select">지역 선택</label>
      <select id="region-select">
        <option value="">전국</option>
        ${provinces.map((p) => `<option value="${esc(p.lawd)}">${esc(p.full)}</option>`).join('')}
      </select>
    </div>
    <svg class="kmap" viewBox="0 0 ${mapWidth} ${mapHeight}" role="group" aria-labelledby="kmap-title">
      <title id="kmap-title">전국 시도별 실거래가 선택 지도</title>
      <g class="kmap-areas">
        ${provinces
          .map(
            (p) =>
              `<path id="kp-${esc(p.lawd)}" class="kmap-area" d="${esc(p.d)}" data-lawd="${esc(p.lawd)}" data-name="${esc(p.name)}" tabindex="0" role="button" aria-label="${esc(p.full)} 시세 보기"><title>${esc(p.full)}</title></path>`
          )
          .join('')}
      </g>
      <g class="kmap-top" aria-hidden="true"></g>
      <g class="kmap-labels">
        ${provinces
          .map(
            (p) =>
              `<text class="kmap-label" x="${p.label[0]}" y="${p.label[1]}" data-lawd="${esc(p.lawd)}" data-name="${esc(p.name)}">${esc(p.name)}</text>`
          )
          .join('')}
      </g>
    </svg>`;

  const top = $('.kmap-top');
  const regionSelect = $('#region-select');

  const select = (lawd, { push = true } = {}) => {
    const province = provinces.find((item) => item.lawd === String(lawd));
    if (!province) return;
    $$('.kmap-area').forEach((a) => a.classList.toggle('is-on', a.dataset.lawd === lawd));
    $$('.kmap-label').forEach((t) => t.classList.toggle('is-on', t.dataset.lawd === lawd));
    regionSelect.value = province.lawd;
    renderRegion(province.lawd, province.name);
    if (push) updateQuery({ region: province.lawd });
  };

  // 지도 밖(빈 영역)을 클릭하면 전국 요약으로 돌아갑니다.
  const showNation = ({ push = true } = {}) => {
    $$('.kmap-area').forEach((a) => a.classList.remove('is-on'));
    $$('.kmap-label').forEach((t) => t.classList.remove('is-on'));
    regionSelect.value = '';
    renderNation();
    if (push) updateQuery({ region: null });
  };

  const ZOOM = 1.18;

  /**
   * 호버·포커스한 시도를 확대해 위에 겹쳐 보여줍니다.
   * CSS transform-box:fill-box 는 브라우저별 편차가 있어,
   * bbox 중심을 직접 구해 SVG transform 속성으로 넣습니다.
   */
  const zoom = (lawd) => {
    $$('.kmap-label').forEach((t) => t.classList.toggle('is-hover', t.dataset.lawd === lawd));
    if (!lawd) {
      top.innerHTML = '';
      return;
    }
    const src = document.getElementById(`kp-${lawd}`);
    if (!src) return;
    const b = src.getBBox();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // 중심을 원점으로 옮겨 확대한 뒤 되돌립니다.
    const t = `translate(${cx} ${cy}) scale(${ZOOM}) translate(${-cx} ${-cy})`;
    top.innerHTML = `<use class="kmap-zoom" href="#kp-${lawd}" transform="${t}"/>`;
  };

  const root = $('#map-root');
  root.addEventListener('pointerover', (e) => {
    const a = e.target.closest('.kmap-area, .kmap-label');
    zoom(a ? a.dataset.lawd : null);
  });
  root.addEventListener('pointerleave', () => zoom(null));

  root.addEventListener('click', (e) => {
    if (!e.target.closest('.kmap')) return;
    const a = e.target.closest('.kmap-area, .kmap-label');
    if (a) select(a.dataset.lawd);
    else showNation(); // 지도 여백 클릭 → 전국
  });
  root.addEventListener('focusin', (e) => {
    const a = e.target.closest('.kmap-area');
    if (a) zoom(a.dataset.lawd);
  });
  root.addEventListener('focusout', () => zoom(null));
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const a = e.target.closest('.kmap-area');
    if (a) {
      e.preventDefault();
      select(a.dataset.lawd);
    }
  });

  regionSelect.addEventListener('change', () => {
    if (regionSelect.value) select(regionSelect.value);
    else showNation();
  });
  addEventListener('popstate', () => {
    const requested = new URLSearchParams(location.search).get('region');
    if (provinces.some((province) => province.lawd === requested)) select(requested, { push: false });
    else showNation({ push: false });
  });

  const requested = new URLSearchParams(location.search).get('region');
  if (provinces.some((province) => province.lawd === requested)) select(requested, { push: false });
  else showNation({ push: false });
  if (realestate) setStatus(realestate.updatedAt);
  else setStatus(null, '부동산 실거래가 데이터가 아직 수집되지 않았습니다');
}

/** 지역 미선택 시: 전국 시도별 요약 표 + 전국 평균 */
function renderNation() {
  const head = `<div class="region-head"><h3>전국</h3><span class="tag">아파트 매매 실거래가</span></div>`;
  if (!realestate) {
    $('#region-panel').innerHTML =
      head + `<p class="empty">첫 수집이 아직 실행되지 않았습니다. 잠시 후 다시 확인해 주세요.</p>`;
    return;
  }

  const months = (realestate.months || []).filter((month) => /^\d{6}$/.test(String(month)));
  if (!months.length) {
    $('#region-panel').innerHTML = head + '<p class="empty">표시할 월별 데이터가 없습니다.</p>';
    return;
  }
  const ym = months.at(-2) || months.at(-1);
  const ymLabel = `${ym.slice(0, 4)}.${ym.slice(4)}`;

  // 시도별로 거래건수·가중평균단가를 집계합니다.
  const bySido = new Map();
  for (const e of Object.values(realestate.sgg || {})) {
    const cur = e.m?.[ym] || { n: 0, pm2: null };
    const sido = String(e.sido ?? '').slice(0, 30);
    if (!sido) continue;
    const count = Math.max(0, finite(cur.n));
    const pm2 = Number.isFinite(Number(cur.pm2)) ? Number(cur.pm2) : null;
    if (!bySido.has(sido)) bySido.set(sido, { sido, n: 0, wSum: 0 });
    const s = bySido.get(sido);
    s.n += count;
    s.wSum += (pm2 ?? 0) * count;
  }
  const sidos = [...bySido.values()]
    .map((s) => ({ ...s, pm2: s.n ? s.wSum / s.n : null }))
    .sort((a, b) => (b.pm2 ?? -1) - (a.pm2 ?? -1));

  const totalN = sidos.reduce((s, r) => s + r.n, 0);
  const totalW = sidos.reduce((s, r) => s + (r.pm2 ?? 0) * r.n, 0);
  const avgPm2 = totalN ? totalW / totalN : null;

  $('#region-panel').innerHTML = `
    ${head}
    <div class="lotto-head">
      <div class="stat"><div class="k">기준 월</div><div class="v">${ymLabel}</div></div>
      <div class="stat"><div class="k">전국 거래 건수</div><div class="v">${totalN.toLocaleString('ko-KR')}건</div></div>
      <div class="stat"><div class="k">전국 ㎡당 평균</div><div class="v">${avgPm2 ? num(avgPm2, 0) + '만원' : '—'}</div></div>
    </div>
    <p class="note" style="margin-top:0">지도에서 지역을 클릭하면 해당 시·도의 시군구별 시세를 볼 수 있습니다.</p>
    <div class="table-scroll">
      <table class="tbl">
        <thead><tr><th>시·도</th><th class="num">㎡당 단가</th><th class="num">거래 건수</th></tr></thead>
        <tbody>
          ${sidos
            .map(
              (r) => `<tr>
            <td>${esc(r.sido)}</td>
            <td class="num">${r.pm2 != null ? num(r.pm2, 0) + '만원' : '<span class="flat">—</span>'}</td>
            <td class="num">${r.n.toLocaleString('ko-KR')}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <p class="note" style="margin-top:10px">
      실거래 신고는 계약 후 30일 이내라 최근 달은 잠정치입니다. 해제된 거래는 제외했습니다.
    </p>`;
}

function renderRegion(lawd, name) {
  const unified = UNIFIED_NOTE[name] ? `<span class="tag">${esc(UNIFIED_NOTE[name])}</span>` : '';
  const head = `<div class="region-head"><h3>${esc(name)}</h3>${unified}<span class="tag">아파트 매매 실거래가</span></div>`;

  if (!realestate) {
    $('#region-panel').innerHTML =
      head + `<p class="empty">첫 수집이 아직 실행되지 않았습니다. 잠시 후 다시 확인해 주세요.</p>`;
    return;
  }

  const rows = Object.entries(realestate.sgg || {})
    .filter(([, e]) => e.sido === name)
    .map(([code, e]) => ({ code, ...e }));

  if (!rows.length) {
    $('#region-panel').innerHTML =
      head + `<p class="empty">${esc(name)} 지역의 실거래 데이터가 없습니다.</p>`;
    return;
  }

  // 이번 달은 신고(30일 이내)가 덜 쌓여 있어 전월을 대표 달로 씁니다.
  const months = (realestate.months || []).filter((month) => /^\d{6}$/.test(String(month)));
  if (!months.length) {
    $('#region-panel').innerHTML = head + '<p class="empty">표시할 월별 데이터가 없습니다.</p>';
    return;
  }
  const ym = months.at(-2) || months.at(-1);
  const ymLabel = `${ym.slice(0, 4)}.${ym.slice(4)}`;

  const enriched = rows
    .map((r) => {
      const cur = r.m?.[ym] || { n: 0, pm2: null };
      const spark = months
        .map((k) => Number(r.m?.[k]?.pm2))
        .filter((value) => Number.isFinite(value));
      return {
        ...r,
        sgg: String(r.sgg ?? '').slice(0, 60),
        n: Math.max(0, finite(cur.n)),
        pm2: Number.isFinite(Number(cur.pm2)) ? Number(cur.pm2) : null,
        spark,
      };
    })
    .sort((a, b) => (b.pm2 ?? -1) - (a.pm2 ?? -1));

  // 시도 요약: 거래건수 합 + 건수 가중 평균 단가
  const totalN = enriched.reduce((s, r) => s + r.n, 0);
  const wSum = enriched.reduce((s, r) => s + (r.pm2 ?? 0) * r.n, 0);
  const avgPm2 = totalN ? wSum / totalN : null;

  $('#region-panel').innerHTML = `
    ${head}
    <div class="lotto-head">
      <div class="stat"><div class="k">기준 월</div><div class="v">${ymLabel}</div></div>
      <div class="stat"><div class="k">거래 건수</div><div class="v">${totalN.toLocaleString('ko-KR')}건</div></div>
      <div class="stat"><div class="k">㎡당 평균</div><div class="v">${avgPm2 ? num(avgPm2, 0) + '만원' : '—'}</div></div>
    </div>
    <div class="table-scroll">
      <table class="tbl">
        <thead><tr>
          <th>시군구</th><th class="num">㎡당 단가</th><th class="num">거래 건수</th><th>12개월 추이</th>
        </tr></thead>
        <tbody>
          ${enriched
            .map(
              (r) => `<tr>
            <td>${esc(r.sgg)}</td>
            <td class="num">${r.pm2 != null ? num(r.pm2, 0) + '만원' : '<span class="flat">—</span>'}</td>
            <td class="num">${r.n.toLocaleString('ko-KR')}</td>
            <td class="spark-cell">${sparkline(r.spark)}</td>
          </tr>`
            )
            .join('')}
        </tbody>
      </table>
    </div>
    <p class="note" style="margin-top:10px">
      실거래 신고는 계약 후 30일 이내라 최근 달은 잠정치입니다. 해제된 거래는 제외했습니다.
    </p>`;
}

// ---------- 로또 ----------
let lotto = null;
let shown = 20;
let lottoFrequencyData = null;
let lottoTotalRounds = 0;
let lottoArchiveLoaded = false;

async function pageLotto() {
  const data = await fetchJSON('/data/lotto-recent.json');
  lotto = data.rounds.slice().sort((a, b) => b.round - a.round);
  lottoTotalRounds = Math.max(lotto.length, finite(data.totalRounds, lotto.length));
  lottoFrequencyData =
    Array.isArray(data.frequency) && data.frequency.length === 46
      ? data.frequency.map((value) => Math.max(0, finite(value)))
      : null;
  lottoArchiveLoaded = lotto.length >= lottoTotalRounds;
  shown = 20;

  renderLottoHead();
  renderLottoTable();
  renderEstimate();
  renderPicks(); // AI 추천번호 + 성적 (별도 데이터 파일, 실패해도 페이지는 유지)

  $('#ppl').addEventListener('input', () => {
    renderEstimate();
    renderLottoTable();
  });
  $('#lotto-more').addEventListener('click', async () => {
    const button = $('#lotto-more');
    if (shown >= lotto.length && !lottoArchiveLoaded) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      const oldLabel = button.textContent;
      button.textContent = '전체 회차 불러오는 중…';
      try {
        const archive = await fetchJSON('/data/lotto.json');
        lotto = archive.rounds.slice().sort((a, b) => b.round - a.round);
        lottoTotalRounds = lotto.length;
        lottoArchiveLoaded = true;
      } catch (err) {
        console.error(err);
        button.textContent = '불러오지 못했습니다. 다시 시도';
        return;
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        if (button.textContent === '전체 회차 불러오는 중…') button.textContent = oldLabel;
      }
    }
    shown = Math.min(shown + 20, lotto.length);
    renderLottoTable();
  });

  // 회차 행 클릭·키보드로 당첨번호 펼치기
  const tbody = $('#tbl-lotto tbody');
  tbody.addEventListener('click', (e) => {
    const button = e.target.closest('.lotto-toggle');
    if (button) toggleLottoRow(button.closest('.lotto-row'));
  });

  setStatus(data.updatedAt);
}

// ---------- 로또 번호 추천 ----------

/** 로또 공식 색상: 번호 구간별 공 색 */
function ballClass(n) {
  if (n <= 10) return 'b1';
  if (n <= 20) return 'b2';
  if (n <= 30) return 'b3';
  if (n <= 40) return 'b4';
  return 'b5';
}
const validBalls = (nums, max = 6) =>
  Array.isArray(nums)
    ? [...new Set(nums.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 45))].slice(0, max)
    : [];
const ballsHtml = (nums) =>
  validBalls(nums).map((n) => `<span class="ball ${ballClass(n)}">${n}</span>`).join('');

/** 한 게임 카드 (공 6개 + 복사 버튼) */
function gameRow(nums, idx) {
  const safeNums = validBalls(nums);
  const text = safeNums.join(', ');
  return `<div class="pick-row">
    <span class="pick-no">${idx + 1}</span>
    <span class="balls">${ballsHtml(safeNums)}</span>
    <button class="copy-btn" type="button" data-copy="${text}" aria-label="${idx + 1}게임 번호 복사">
      <svg class="icon" aria-hidden="true"><use href="#i-copy"/></svg>복사
    </button>
  </div>`;
}

/** 클립보드 복사 (버튼에 잠깐 '복사됨' 표시).
 *  개별 복사 버튼과 '전체 복사' 버튼 모두 data-copy 를 가지므로 그걸로 매칭합니다. */
function bindCopy(root) {
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn || !btn.dataset.copy) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
    } catch {
      // clipboard API 가 막힌 환경(비보안 컨텍스트 등) 폴백
      const ta = document.createElement('textarea');
      ta.value = btn.dataset.copy;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {
        alert('복사에 실패했습니다. 번호: ' + btn.dataset.copy);
        ta.remove();
        return;
      }
      ta.remove();
    }
    const old = btn.innerHTML;
    btn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check"/></svg>복사됨';
    btn.classList.add('done');
    setTimeout(() => {
      btn.innerHTML = old;
      btn.classList.remove('done');
    }, 1200);
  });
}

// --- 클라이언트용 추천 알고리즘 (스크립트와 동일한 규칙) ---
function lottoFrequency() {
  if (lottoFrequencyData) return lottoFrequencyData.slice();
  const f = Array(46).fill(0);
  for (const r of lotto) for (const n of validBalls(r.numbers)) f[n]++;
  return f;
}
function weightedPick(freq) {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const chosen = [];
  while (chosen.length < 6) {
    const total = pool.reduce((s, n) => s + (freq[n] || 1), 0);
    let r = Math.random() * total;
    let pick = pool[0];
    for (const n of pool) {
      r -= freq[n] || 1;
      if (r <= 0) { pick = n; break; }
    }
    chosen.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return chosen.sort((a, b) => a - b);
}
function passesFilters(nums) {
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum < 100 || sum > 175) return false;
  const odd = nums.filter((n) => n % 2).length;
  if (odd < 2 || odd > 4) return false;
  const low = nums.filter((n) => n <= 22).length;
  if (low < 2 || low > 4) return false;
  let run = 1;
  let maxRun = 1;
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1] + 1) { run++; maxRun = Math.max(maxRun, run); }
    else run = 1;
  }
  return maxRun <= 2;
}
function makeGames(freq, count = 5) {
  const games = [];
  const seen = new Set();
  let guard = 0;
  while (games.length < count && guard++ < 1000) {
    let g = weightedPick(freq);
    for (let i = 0; i < 300 && !passesFilters(g); i++) g = weightedPick(freq);
    const key = g.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    games.push(g);
  }
  return games;
}

const RANK_LABEL = { 1: '1등', 2: '2등', 3: '3등', 4: '4등', 5: '5등', 0: '낙첨' };

/** 한 게임 채점 (6/45 등수) */
function scoreGame(game, winNumbers, bonus) {
  const safeGame = validBalls(game);
  const safeWinners = validBalls(winNumbers);
  const safeBonus = finite(bonus);
  const matched = safeGame.filter((n) => safeWinners.includes(n)).length;
  const bonusHit = safeGame.includes(safeBonus);
  if (matched === 6) return 1;
  if (matched === 5 && bonusHit) return 2;
  if (matched === 5) return 3;
  if (matched === 4) return 4;
  if (matched === 3) return 5;
  return 0;
}

// 내 번호는 브라우저에 저장하고, 생성 조합은 익명 공개 결과 통계를 위해 제한적으로 서버에도 기록합니다.
const MY_KEY = 'modoo-lotto-mypick'; // 진행 중인 내 번호 { round, games, savedAt }
const HIST_KEY = 'modoo-lotto-myhistory'; // 채점 완료 기록 [{round,date,best,winNumbers,bonus}]
const readLS = (k, fb) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fb;
  } catch {
    return fb;
  }
};
const writeLS = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const validGames = (games) =>
  Array.isArray(games)
    ? games.map((game) => validBalls(game)).filter((game) => game.length === 6).slice(0, 5)
    : [];

/**
 * 로또 번호 추첨기 (방문자가 버튼을 눌러 직접 뽑습니다).
 * 뽑은 번호는 이 브라우저에 저장했다가, 해당 회차 추첨이 끝나면 자동 채점합니다.
 */
function renderPicks() {
  const latest = finite(lotto[0]?.round);
  if (latest <= 0) return;
  const upcoming = latest + 1;
  const freq = lottoFrequency();

  const genBtn = $('#gen-btn');
  const genLabel = $('#gen-label');
  const copyAll = $('#copy-all-btn');
  const mine = $('#picks-mine');
  const roundOf = new Map(lotto.map((r) => [finite(r.round), r]));

  // 1) 저장된 내 번호가 추첨 완료됐으면 채점해서 기록으로 옮깁니다.
  const storedMy = readLS(MY_KEY, null);
  const myGames = validGames(storedMy?.games);
  const my =
    Number.isInteger(Number(storedMy?.round)) && myGames.length
      ? { ...storedMy, round: Number(storedMy.round), games: myGames }
      : null;
  if (storedMy && !my) localStorage.removeItem(MY_KEY);
  if (my && roundOf.has(my.round)) {
    const r = roundOf.get(my.round);
    const ranks = my.games.map((g) => scoreGame(g, r.numbers, r.bonus));
    const best = Math.min(...ranks.map((x) => x || 9));
    const bestRank = best === 9 ? 0 : best;
    const hist = Array.isArray(readLS(HIST_KEY, [])) ? readLS(HIST_KEY, []) : [];
    if (!hist.some((h) => h.round === my.round)) {
      hist.unshift({ round: r.round, date: r.date, best: bestRank, winNumbers: r.numbers, bonus: r.bonus });
      writeLS(HIST_KEY, hist.slice(0, 12));
    }
    // 축하/결과 배너
    const cls = bestRank >= 1 && bestRank <= 3 ? 'win-hi' : bestRank ? 'win-lo' : 'win-none';
    const msg =
      bestRank >= 1 && bestRank <= 3
        ? '축하합니다! 큰 행운이 왔어요!'
        : bestRank
          ? '아깝지만 다음이 있어요!'
          : '이번엔 아쉽네요. 다음 주 행운을 노려봐요!';
    $('#my-result').innerHTML = `<div class="my-result ${cls}">
      <span class="mr-k">${finite(r.round)}회 추첨 결과 · 지난주 뽑은 번호</span>
      <span class="mr-v">${RANK_LABEL[bestRank]}</span>
      <span class="mr-m">${msg}</span>
    </div>`;
    localStorage.removeItem(MY_KEY);
  } else if (my && my.round === upcoming) {
    // 2) 아직 추첨 전 — 저장해둔 이번 주 번호를 다시 보여줍니다.
    showMyGames(my.games, my.round, mine, copyAll, false);
    genLabel.textContent = '다시 뽑기';
  }

  // 3) 버튼 → 5게임 생성 후 브라우저 저장 + 익명 공개 결과 통계를 위한 제한된 서버 기록
  genBtn.addEventListener('click', () => {
    const games = makeGames(freq, 5);
    writeLS(MY_KEY, { round: upcoming, games, savedAt: Date.now() });
    showMyGames(games, upcoming, mine, copyAll, true);
    genLabel.textContent = '다시 뽑기';
    // 서버 저장은 실패해도 사용자 경험을 막지 않습니다 (fire-and-forget).
    fetch('/api/lotto/pick', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ round: upcoming, games }),
    }).catch(() => {});
  });

  bindCopy($('#ai-picks'));

  // 4) 내 번호 성적 기록 (내 브라우저)
  renderMyHistory();

  // 5) 이 사이트에서 나온 당첨 공개 피드 (서버)
  renderFeed();
}

/** 서버의 공개 당첨 피드. 백엔드(D1)가 아직 없거나 결과가 없으면 섹션을 숨깁니다. */
async function renderFeed() {
  let data;
  try {
    const res = await fetch('/api/lotto/results');
    if (!res.ok) return;
    data = await res.json();
  } catch {
    return; // 로컬 정적 서버 등 API 가 없는 환경 — 조용히 넘어감
  }
  const list = Array.isArray(data.results)
    ? data.results
        .map((result) => ({
          round: finite(result.round),
          best: finite(result.best),
          at: String(result.at ?? ''),
          sample: validBalls(result.sample),
        }))
        .filter((result) => result.round > 0 && result.best >= 1 && result.best <= 5 && result.sample.length === 6)
        .slice(0, 50)
    : [];
  if (!list.length) return;

  $('#feed-sec').hidden = false;
  if (data.stats?.wins) {
    $('#feed-stat').textContent = `누적 당첨 ${data.stats.wins.toLocaleString('ko-KR')}건`;
  }
  $('#feed-list').innerHTML = list
    .map((r) => {
      const d = new Date(r.at);
      const when = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${d.getHours()}시 ${String(d.getMinutes()).padStart(2, '0')}분`;
      const hi = r.best >= 1 && r.best <= 3;
      return `<div class="feed-row${hi ? ' hi' : ''}">
        <span class="feed-rank ${hi ? 'rank-hi' : 'rank-lo'}">${hi ? '당첨 · ' : ''}${RANK_LABEL[r.best]}</span>
        <span class="feed-when">${when}에 뽑은 번호</span>
        <span class="balls balls-sm">${ballsHtml(r.sample)}</span>
        <span class="feed-round">${r.round}회</span>
      </div>`;
    })
    .join('');
}

function showMyGames(games, round, mine, copyAll, isNew) {
  const safeGames = validGames(games);
  if (!safeGames.length) return;
  mine.innerHTML =
    `<p class="pick-mine-label">${finite(round)}회 대상 · 내가 뽑은 ${safeGames.length}게임 ` +
    `<span class="hint">${isNew ? '이 번호는 추첨 후 자동으로 채점돼요' : '지난번 뽑은 번호예요'}</span></p>` +
    safeGames.map((g, i) => gameRow(g, i)).join('');
  copyAll.hidden = false;
  copyAll.dataset.copy = safeGames.map((g) => g.join(', ')).join('\n');
}

function renderMyHistory() {
  const raw = readLS(HIST_KEY, []);
  const hist = Array.isArray(raw)
    ? raw
        .map((item) => ({
          round: finite(item.round),
          date: String(item.date ?? '').slice(0, 20),
          best: finite(item.best),
          winNumbers: validBalls(item.winNumbers),
          bonus: finite(item.bonus),
        }))
        .filter((item) => item.round > 0 && item.best >= 0 && item.best <= 5 && item.winNumbers.length === 6)
        .slice(0, 12)
    : [];
  if (!hist.length) return;
  $('#picks-history-sec').hidden = false;
  $('#tbl-picks tbody').innerHTML = hist
    .map((h) => {
      const cls = h.best >= 1 && h.best <= 3 ? 'rank-hi' : h.best ? 'rank-lo' : 'flat';
      return `<tr>
        <td class="num">${h.round}</td>
        <td>${esc(h.date)}</td>
        <td><span class="balls balls-sm">${ballsHtml(h.winNumbers)}<span class="ball bonus">${h.bonus}</span></span></td>
        <td><span class="${cls}">${RANK_LABEL[h.best]}</span></td>
      </tr>`;
    })
    .join('');
}

function renderLottoHead() {
  const r = lotto[0];
  if (!r) return;
  $('#lotto-head').innerHTML = `
    <div class="stat" style="--i:0">
      <div class="k">최신 회차</div><div class="v">${finite(r.round)}회</div>
      <div class="balls">
        ${ballsHtml(r.numbers)}
        <span class="ball bonus" title="보너스 번호">${finite(r.bonus)}</span>
      </div>
    </div>
    <div class="stat" style="--i:1"><div class="k">추첨일</div><div class="v">${esc(r.date)}</div></div>
    <div class="stat" style="--i:2"><div class="k">판매 게임 수</div><div class="v">${finite(r.games).toLocaleString('ko-KR')}</div></div>
    <div class="stat" style="--i:3"><div class="k">총 판매금액</div><div class="v">${(finite(r.sales) / 1e8).toFixed(0)}억원</div></div>
    <div class="stat" style="--i:4"><div class="k">1등 당첨금</div><div class="v">${(finite(r.firstPrize) / 1e8).toFixed(2)}억원</div></div>`;
}

const perPerson = () => Math.max(1, finite($('#ppl').value, 5));

function renderEstimate() {
  const g = perPerson();
  $('#ppl-out').textContent = `${g}게임`;
  const r = lotto[0];
  if (!r) return;
  const games = finite(r.games);
  const people = Math.round(games / g);
  $('#estimate').innerHTML =
    `${finite(r.round)}회차에 <strong>${people.toLocaleString('ko-KR')}명</strong>이 로또를 구입한 것으로 추정됩니다. ` +
    `<span class="hint">판매 게임 ${games.toLocaleString('ko-KR')}개 ÷ 1인당 ${g}게임 기준</span>`;
}

function renderLottoTable() {
  const g = perPerson();
  $('#tbl-lotto tbody').innerHTML = lotto
    .slice(0, shown)
    .map(
      (r) => `<tr class="lotto-row" data-round="${finite(r.round)}">
      <td class="num"><button class="lotto-toggle" type="button" aria-expanded="false" aria-label="${finite(r.round)}회 당첨번호 보기"><span class="row-caret" aria-hidden="true">▸</span>${finite(r.round)}</button></td><td>${esc(r.date)}</td>
      <td class="num">${finite(r.games).toLocaleString('ko-KR')}</td>
      <td class="num">${(finite(r.sales) / 1e8).toFixed(0)}억원</td>
      <td class="num">${Math.round(finite(r.games) / g).toLocaleString('ko-KR')}명</td>
      <td class="num">${finite(r.firstWinners)}명</td>
      <td class="num">${(finite(r.firstPrize) / 1e8).toFixed(2)}억</td>
    </tr>`
    )
    .join('');
  const more = $('#lotto-more');
  const hasLoadedRows = shown < lotto.length;
  const hasArchiveRows = !lottoArchiveLoaded && lottoTotalRounds > lotto.length;
  more.hidden = !hasLoadedRows && !hasArchiveRows;
  if (!more.hidden) more.textContent = hasLoadedRows ? '20회 더 보기' : '이전 전체 회차 불러오기';
}

/** 회차 행 클릭 → 그 아래에 당첨번호 행을 토글합니다. */
function toggleLottoRow(tr) {
  const round = Number(tr.dataset.round);
  const next = tr.nextElementSibling;
  // 이미 펼쳐져 있으면 접기
  if (next && next.classList.contains('lotto-detail')) {
    next.remove();
    tr.querySelector('.lotto-toggle').setAttribute('aria-expanded', 'false');
    tr.querySelector('.row-caret').textContent = '▸';
    return;
  }
  // 다른 열린 행은 닫기 (한 번에 하나만)
  $$('.lotto-detail').forEach((d) => d.remove());
  $$('.lotto-row').forEach((t) => {
    t.querySelector('.lotto-toggle')?.setAttribute('aria-expanded', 'false');
    t.querySelector('.row-caret').textContent = '▸';
  });

  const r = lotto.find((x) => x.round === round);
  if (!r) return;
  const detail = document.createElement('tr');
  detail.className = 'lotto-detail';
  detail.innerHTML = `<td colspan="7">
    <div class="detail-box">
      <span class="detail-label">${finite(r.round)}회 당첨번호</span>
      <span class="balls">${ballsHtml(r.numbers)}<span class="ball plus">+</span><span class="ball bonus" title="보너스 번호">${finite(r.bonus)}</span></span>
    </div>
  </td>`;
  tr.after(detail);
  tr.querySelector('.lotto-toggle').setAttribute('aria-expanded', 'true');
  tr.querySelector('.row-caret').textContent = '▾';
}

// ---------- 관련 뉴스 ----------

function newsAge(iso) {
  if (!iso) return '';
  const h = Math.floor((Date.now() - Date.parse(iso)) / 3600_000);
  if (h < 1) return '방금 전';
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}일 전` : new Date(iso).toLocaleDateString('ko-KR');
}

/**
 * 메뉴 페이지 하단에 관련 뉴스 섹션을 게시판처럼 붙입니다 (한 페이지 10건).
 * HTML 파일에는 마운트가 없습니다 — 여기서 <main> 끝에 만들어 넣어,
 * 페이지 9장을 일일이 고치지 않아도 됩니다.
 * 데이터는 누적 아카이브(/data/news/{topic}.json)를 우선 쓰고,
 * 아카이브가 아직 없으면 최신 스냅샷(news.json)으로 폴백합니다.
 */
const NEWS_PER_PAGE = 10;

async function renderNews(topic) {
  let items = null;
  let updatedAt = null;
  try {
    const archive = await fetchJSON(`/data/news/${topic}.json`);
    items = archive.items;
    updatedAt = archive.updatedAt;
  } catch {
    // 아카이브 미생성 환경 폴백
    try {
      const data = await fetchJSON('/data/news.json');
      items = data.topics?.[topic];
      updatedAt = data.updatedAt;
    } catch (err) {
      console.error(err); // 뉴스는 부가 정보라 실패해도 페이지를 막지 않습니다.
      return;
    }
  }
  if (!items?.length) return;

  const pages = Math.ceil(items.length / NEWS_PER_PAGE);
  let page = 1;

  $('main').insertAdjacentHTML(
    'beforeend',
    `<section class="panel news-panel">
      <h2>관련 뉴스 <span class="tag">구글뉴스</span></h2>
      <ul class="news-list" id="news-list"></ul>
      ${
        pages > 1
          ? `<nav class="pager" aria-label="뉴스 페이지 이동">
        <button type="button" class="pager-btn" id="news-prev">◀ 이전</button>
        <span class="pager-info" id="news-info" aria-live="polite"></span>
        <button type="button" class="pager-btn" id="news-next">다음 ▶</button>
      </nav>`
          : ''
      }
      <p class="note">최종 수집: ${new Date(updatedAt).toLocaleString('ko-KR')} · 총 ${items.length}건</p>
    </section>`
  );

  const renderPage = () => {
    const slice = items.slice((page - 1) * NEWS_PER_PAGE, page * NEWS_PER_PAGE);
    $('#news-list').innerHTML = slice
      .map(
        (n) => `<li>
        <a href="${urlAttr(n.link)}" target="_blank" rel="noopener noreferrer nofollow">${esc(n.title)}</a>
        <span class="news-meta">${esc(n.source || '')}${n.source ? ' · ' : ''}${newsAge(n.date)}</span>
      </li>`
      )
      .join('');
    if (pages > 1) {
      $('#news-info').textContent = `${page} / ${pages}`;
      $('#news-prev').disabled = page === 1;
      $('#news-next').disabled = page === pages;
    }
  };

  if (pages > 1) {
    $('#news-prev').addEventListener('click', () => {
      if (page > 1) { page--; renderPage(); }
    });
    $('#news-next').addEventListener('click', () => {
      if (page < pages) { page++; renderPage(); }
    });
  }
  renderPage();
}

// ---------- 디스패처 ----------
const ROUTES = {
  home: pageHome,
  coin: () => pageGroup('coin', '#grid-coin'),
  stock: () => pageStock(['kospi', 'spx', 'ndq', 'dji', 'nkx', 'hsi', 'sse', 'dax'], 'stock', '#grid-stock', '#grid-stock-items'),
  kosdaq: () => pageStock(['kosdaq'], 'kosdaq_stock', '#grid-kosdaq', '#grid-kosdaq-items'),
  fx: () => pageGroup('fx', '#grid-fx'),
  metal: () => pageGroup(['gold_krx', 'gold_don', 'gold', 'silver', 'plat', 'palladium'], '#grid-metal'),
  energy: pageEnergy,
  macro: pageMacro,
  giftcard: pageGiftcard,
  'giftcard-brand': pageGiftcardBrand,
  hotdeal: pageHotdeal,
  shopping: pageShopping,
  realestate: pageRealestate,
  lotto: pageLotto,
  // 소개 페이지는 실시간 데이터가 없으므로 헤더의 갱신 시각 표시를 숨깁니다.
  about: async () => {
    const s = $('#updated');
    if (s) s.style.display = 'none';
  },
};

const PAGE = document.body.dataset.page;
renderShell();
(ROUTES[PAGE] || ROUTES.home)().catch((err) => {
  console.error(err);
  setStatus(null);
});
// 실시간 데이터가 있는 메뉴 페이지에만 관련 뉴스를 붙입니다.
if (PAGE && PAGE !== 'home' && PAGE !== 'about') {
  renderNews(PAGE === 'giftcard-brand' ? 'giftcard' : PAGE);
}
