'use strict';

/* 페이지별 렌더러. app.js 의 공용 함수를 사용합니다. */

// ---------- 홈 대시보드 ----------
const HOME_TILES = [
  { id: 'kospi', href: 'stock.html', cat: '주식' },
  { id: 'kosdaq', href: 'kosdaq.html', cat: '코스닥' },
  { id: 'btc', href: 'coin.html', cat: '코인' },
  { id: 'kimchi', href: 'macro.html', cat: '지표' },
  { id: 'usdkrw', href: 'fx.html', cat: '환율' },
  { id: 'gold_don', href: 'metal.html', cat: '금' },
  { id: 'wti', href: 'energy.html', cat: '유가' },
  { id: 'ust10', href: 'macro.html', cat: '금리' },
];

async function pageHome() {
  const results = await Promise.allSettled([
    fetchJSON('/data/markets.json'),
    fetchJSON('/data/giftcards-dept.json'),
    fetchJSON('/data/lotto.json'),
  ]);
  const [markets, gift, lotto] = results.map((r) => (r.status === 'fulfilled' ? r.value : null));

  // 시세 타일
  if (markets) {
    const byId = new Map(markets.items.map((i) => [i.id, i]));
    $('#home-grid').innerHTML = HOME_TILES.map((t, i) => {
      const it = byId.get(t.id);
      if (!it) return '';
      const d = dir(it.changePct);
      const label = d === 'up' ? '상승' : d === 'down' ? '하락' : '보합';
      return `<a class="tile" href="${t.href}" style="--i:${i}">
        <span class="tile-cat">${t.cat}</span>
        <span class="tile-name">${it.name}</span>
        <span class="tile-price">${fmtPrice(it.price, it.group)}<em>${it.unit}</em></span>
        <span class="tile-delta ${d}">${
          it.changePct == null
            ? ''
            : `${icon(d)}<span class="sr-label">${label}</span>${num(Math.abs(it.changePct), 2)}%`
        }</span>
        ${sparkline(it.spark)}
      </a>`;
    }).join('');
  }

  // 상품권 요약 — 롯데 10만원권 최고 매입가
  if (gift) {
    const rows = gift.items.filter((i) => i.card === '롯데' && i.face === 100000 && i.buy != null);
    const best = rows.sort((a, b) => b.buy - a.buy)[0];
    if (best) {
      $('#home-gift').innerHTML = `<a class="wide-tile" href="giftcard.html">
        <span class="wt-k">상품권 · 롯데 10만원권 최고 매입가</span>
        <span class="wt-v">${won(best.buy)}</span>
        <span class="wt-m">${num(best.buyRate, 2)}% · ${best.shop}${best.method ? ` · ${best.method}` : ''} ${icon('arrow')}</span>
      </a>`;
    }
  }

  // 로또 요약 — 최신 회차
  if (lotto && lotto.rounds.length) {
    const r = lotto.rounds.at(-1);
    $('#home-lotto').innerHTML = `<a class="wide-tile" href="lotto.html">
      <span class="wt-k">로또 ${r.round}회 · ${r.date}</span>
      <span class="wt-v">${r.numbers.join(' · ')} <b>+${r.bonus}</b></span>
      <span class="wt-m">총 판매 ${compactWon(r.sales)} · 1등 ${r.firstWinners}명 ${icon('arrow')}</span>
    </a>`;
  }

  setStatus(markets?.updatedAt);
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
          `<li><a href="${s.site}" target="_blank" rel="noopener noreferrer nofollow">${s.name}</a>` +
          `<span class="src-state ${s.ok ? 'ok' : 'ng'}">${s.ok ? `${s.count}건` : '수집 실패'}</span></li>`
      )
      .join('');

    const faces = [...new Set(dept.items.map((i) => i.face))].sort((a, b) => a - b);
    face = faces.includes(100000) ? 100000 : faces[0];
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
          }${shopLabel(item)}</span>
        </div>`;
      };

      const detail = list
        .slice()
        .sort((a, b) => (b.buy ?? 0) - (a.buy ?? 0))
        .map(
          (i) => `<tr>
            <td>${shopLabel(i)}</td>
            <td class="num${i === bestBuy ? ' is-best' : ''}">${i.buy != null ? won(i.buy) : '—'}</td>
            <td class="num${i === bestSell ? ' is-best' : ''}">${i.sell != null ? won(i.sell) : '—'}</td>
          </tr>`
        )
        .join('');

      return `<article class="gc" style="--i:${idx}">
        <header class="gc-head"><h3>${cardName}</h3><span class="gc-face">${faceLabel(face)}</span></header>
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
        <td>${i.name}</td>
        <td class="num">${won(i.face)}</td>
        <td class="num">${has ? num(i.rate, 1) + '%' : '<span class="flat">미입력</span>'}</td>
        <td class="num">${has ? won(Math.round((i.face * i.rate) / 100)) : '<span class="flat">—</span>'}</td>
      </tr>`;
    })
    .join('');
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
  if (reRes.status === 'fulfilled') realestate = reRes.value;
  else console.error(reRes.reason);

  // SVG 에는 z-index 가 없어 나중에 그려진 것이 위에 옵니다.
  // 확대본을 별도 레이어(kmap-top)에 <use> 로 얹어 잘리지 않게 합니다.
  $('#map-root').innerHTML = `
    <svg class="kmap" viewBox="0 0 ${map.width} ${map.height}" role="img" aria-label="전국 시도 지도">
      <g class="kmap-areas">
        ${map.provinces
          .map(
            (p) =>
              `<path id="kp-${p.lawd}" class="kmap-area" d="${p.d}" data-lawd="${p.lawd}" data-name="${p.name}" tabindex="0" role="button" aria-label="${p.full} 시세 보기"><title>${p.full}</title></path>`
          )
          .join('')}
      </g>
      <g class="kmap-top" aria-hidden="true"></g>
      <g class="kmap-labels">
        ${map.provinces
          .map(
            (p) =>
              `<text class="kmap-label" x="${p.label[0]}" y="${p.label[1]}" data-lawd="${p.lawd}" data-name="${p.name}">${p.name}</text>`
          )
          .join('')}
      </g>
    </svg>`;

  const top = $('.kmap-top');

  const select = (lawd, name) => {
    $$('.kmap-area').forEach((a) => a.classList.toggle('is-on', a.dataset.lawd === lawd));
    $$('.kmap-label').forEach((t) => t.classList.toggle('is-on', t.dataset.lawd === lawd));
    renderRegion(lawd, name);
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
    const a = e.target.closest('.kmap-area, .kmap-label');
    if (a) select(a.dataset.lawd, a.dataset.name);
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
      select(a.dataset.lawd, a.dataset.name);
    }
  });

  select('11', '서울');
  if (realestate) setStatus(realestate.updatedAt);
  else setStatus(null, '부동산 실거래가 데이터가 아직 수집되지 않았습니다');
}

function renderRegion(lawd, name) {
  const unified = UNIFIED_NOTE[name] ? `<span class="tag">${UNIFIED_NOTE[name]}</span>` : '';
  const head = `<div class="region-head"><h3>${name}</h3>${unified}<span class="tag">아파트 매매 실거래가</span></div>`;

  if (!realestate) {
    $('#region-panel').innerHTML =
      head + `<p class="empty">첫 수집이 아직 실행되지 않았습니다. 잠시 후 다시 확인해 주세요.</p>`;
    return;
  }

  const rows = Object.entries(realestate.sgg)
    .filter(([, e]) => e.sido === name)
    .map(([code, e]) => ({ code, ...e }));

  if (!rows.length) {
    $('#region-panel').innerHTML =
      head + `<p class="empty">${name} 지역의 실거래 데이터가 없습니다.</p>`;
    return;
  }

  // 이번 달은 신고(30일 이내)가 덜 쌓여 있어 전월을 대표 달로 씁니다.
  const months = realestate.months;
  const ym = months.at(-2) || months.at(-1);
  const ymLabel = `${ym.slice(0, 4)}.${ym.slice(4)}`;

  const enriched = rows
    .map((r) => {
      const cur = r.m[ym] || { n: 0, pm2: null };
      const spark = months.map((k) => r.m[k]?.pm2).filter((v) => v != null);
      return { ...r, n: cur.n, pm2: cur.pm2, spark };
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
            <td>${r.sgg}</td>
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

async function pageLotto() {
  const data = await fetchJSON('/data/lotto.json');
  lotto = data.rounds.slice().sort((a, b) => b.round - a.round);

  renderLottoHead();
  renderLottoTable();
  renderEstimate();

  $('#ppl').addEventListener('input', () => {
    renderEstimate();
    renderLottoTable();
  });
  $('#lotto-more').addEventListener('click', () => {
    shown += 20;
    renderLottoTable();
  });
  setStatus(data.updatedAt);
}

function renderLottoHead() {
  const r = lotto[0];
  if (!r) return;
  $('#lotto-head').innerHTML = `
    <div class="stat" style="--i:0">
      <div class="k">최신 회차</div><div class="v">${r.round}회</div>
      <div class="balls">
        ${r.numbers.map((n) => `<span class="ball">${n}</span>`).join('')}
        <span class="ball bonus" title="보너스 번호">${r.bonus}</span>
      </div>
    </div>
    <div class="stat" style="--i:1"><div class="k">추첨일</div><div class="v">${r.date}</div></div>
    <div class="stat" style="--i:2"><div class="k">판매 게임 수</div><div class="v">${r.games.toLocaleString('ko-KR')}</div></div>
    <div class="stat" style="--i:3"><div class="k">총 판매금액</div><div class="v">${(r.sales / 1e8).toFixed(0)}억원</div></div>
    <div class="stat" style="--i:4"><div class="k">1등 당첨금</div><div class="v">${(r.firstPrize / 1e8).toFixed(2)}억원</div></div>`;
}

const perPerson = () => Number($('#ppl').value);

function renderEstimate() {
  const g = perPerson();
  $('#ppl-out').textContent = `${g}게임`;
  const r = lotto[0];
  if (!r) return;
  const people = Math.round(r.games / g);
  $('#estimate').innerHTML =
    `${r.round}회차에 <strong>${people.toLocaleString('ko-KR')}명</strong>이 로또를 구입한 것으로 추정됩니다. ` +
    `<span class="hint">판매 게임 ${r.games.toLocaleString('ko-KR')}개 ÷ 1인당 ${g}게임 기준</span>`;
}

function renderLottoTable() {
  const g = perPerson();
  $('#tbl-lotto tbody').innerHTML = lotto
    .slice(0, shown)
    .map(
      (r) => `<tr>
      <td class="num">${r.round}</td><td>${r.date}</td>
      <td class="num">${r.games.toLocaleString('ko-KR')}</td>
      <td class="num">${(r.sales / 1e8).toFixed(0)}억원</td>
      <td class="num">${Math.round(r.games / g).toLocaleString('ko-KR')}명</td>
      <td class="num">${r.firstWinners}명</td>
      <td class="num">${(r.firstPrize / 1e8).toFixed(2)}억</td>
    </tr>`
    )
    .join('');
  $('#lotto-more').hidden = shown >= lotto.length;
}

// ---------- 관련 뉴스 ----------

/** 외부 데이터(뉴스 제목·출처)는 반드시 이스케이프해서 넣습니다. */
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function newsAge(iso) {
  if (!iso) return '';
  const h = Math.floor((Date.now() - Date.parse(iso)) / 3600_000);
  if (h < 1) return '방금 전';
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}일 전` : new Date(iso).toLocaleDateString('ko-KR');
}

/**
 * 메뉴 페이지 하단에 관련 뉴스 섹션을 붙입니다.
 * HTML 파일에는 마운트가 없습니다 — 여기서 <main> 끝에 만들어 넣어,
 * 페이지 9장을 일일이 고치지 않아도 됩니다.
 */
async function renderNews(topic) {
  let data;
  try {
    data = await fetchJSON('/data/news.json');
  } catch (err) {
    console.error(err); // 뉴스는 부가 정보라 실패해도 페이지를 막지 않습니다.
    return;
  }
  const items = data.topics?.[topic];
  if (!items?.length) return;

  const main = $('main');
  main.insertAdjacentHTML(
    'beforeend',
    `<section class="panel news-panel">
      <h2>관련 뉴스 <span class="tag">구글뉴스</span></h2>
      <ul class="news-list">
        ${items
          .map(
            (n) => `<li>
          <a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer nofollow">${esc(n.title)}</a>
          <span class="news-meta">${esc(n.source || '')}${n.source ? ' · ' : ''}${newsAge(n.date)}</span>
        </li>`
          )
          .join('')}
      </ul>
      <p class="note">최종 수집: ${new Date(data.updatedAt).toLocaleString('ko-KR')}</p>
    </section>`
  );
}

// ---------- 디스패처 ----------
const ROUTES = {
  home: pageHome,
  coin: () => pageGroup('coin', '#grid-coin'),
  stock: () => pageStock(['kospi', 'spx', 'ndq', 'dji', 'nkx'], 'stock', '#grid-stock', '#grid-stock-items'),
  kosdaq: () => pageStock(['kosdaq'], 'kosdaq_stock', '#grid-kosdaq', '#grid-kosdaq-items'),
  fx: () => pageGroup('fx', '#grid-fx'),
  metal: () => pageGroup('metal', '#grid-metal'),
  energy: () => pageGroup('energy', '#grid-energy'),
  macro: () => pageGroup('macro', '#grid-macro'),
  giftcard: pageGiftcard,
  realestate: pageRealestate,
  lotto: pageLotto,
};

const PAGE = document.body.dataset.page;
renderShell();
(ROUTES[PAGE] || ROUTES.home)().catch((err) => {
  console.error(err);
  setStatus(null);
});
// 홈을 제외한 모든 메뉴 페이지에 관련 뉴스를 붙입니다.
if (PAGE && PAGE !== 'home') renderNews(PAGE);
