'use strict';

/* 페이지별 렌더러. app.js 의 공용 함수를 사용합니다. */

// ---------- 홈 대시보드 ----------
const HOME_TILES = [
  { id: 'kospi', href: 'stock.html', cat: '주식' },
  { id: 'kosdaq', href: 'kosdaq.html', cat: '코스닥' },
  { id: 'btc', href: 'coin.html', cat: '코인' },
  { id: 'eth', href: 'coin.html', cat: '코인' },
  { id: 'usdkrw', href: 'fx.html', cat: '환율' },
  { id: 'gold_don', href: 'metal.html', cat: '금' },
];

async function pageHome() {
  const results = await Promise.allSettled([
    fetchJSON('data/markets.json'),
    fetchJSON('data/giftcards-dept.json'),
    fetchJSON('data/lotto.json'),
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

// ---------- 상품권 ----------
let dept = null;
let face = null;
const faceLabel = (n) => (n >= 10000 ? `${n / 10000}만원권` : `${n.toLocaleString('ko-KR')}원권`);
const shopLabel = (i) => (i.method ? `${i.shop} · ${i.method}` : i.shop);

async function pageGiftcard() {
  const [d, manual] = await Promise.allSettled([
    fetchJSON('data/giftcards-dept.json'),
    fetchJSON('data/giftcards.json'),
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
  }

  if (manual.status === 'fulfilled') renderManualGift(manual.value);
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
async function pageRealestate() {
  const map = await fetchJSON('data/korea-provinces.json');

  $('#map-root').innerHTML = `
    <svg class="kmap" viewBox="0 0 ${map.width} ${map.height}" role="img" aria-label="전국 시도 지도">
      ${map.provinces
        .map(
          (p) =>
            `<path class="kmap-area" d="${p.d}" data-lawd="${p.lawd}" data-name="${p.name}" tabindex="0" role="button" aria-label="${p.full} 시세 보기"><title>${p.full}</title></path>`
        )
        .join('')}
      ${map.provinces
        .map(
          (p) =>
            `<text class="kmap-label" x="${p.label[0]}" y="${p.label[1]}" data-lawd="${p.lawd}">${p.name}</text>`
        )
        .join('')}
    </svg>`;

  const select = (lawd, name) => {
    $$('.kmap-area').forEach((a) => a.classList.toggle('is-on', a.dataset.lawd === lawd));
    renderRegion(lawd, name);
  };

  $('#map-root').addEventListener('click', (e) => {
    const a = e.target.closest('.kmap-area, .kmap-label');
    if (a) select(a.dataset.lawd, a.dataset.name);
  });
  $('#map-root').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const a = e.target.closest('.kmap-area');
    if (a) {
      e.preventDefault();
      select(a.dataset.lawd, a.dataset.name);
    }
  });

  select('11', '서울');
  setStatus(null, '부동산 실거래가는 국토교통부 API 승인 대기 중입니다');
}

function renderRegion(lawd, name) {
  // 실거래가 수집이 붙기 전까지의 자리표시입니다.
  $('#region-panel').innerHTML = `
    <div class="region-head"><h3>${name}</h3><span class="tag">법정동코드 ${lawd}</span></div>
    <p class="empty">
      국토교통부 아파트 매매 실거래가 API 승인이 반영되면<br>
      이 자리에 ${name} 지역 시군구별 평균 거래가·거래건수가 표시됩니다.
    </p>`;
}

// ---------- 로또 ----------
let lotto = null;
let shown = 20;

async function pageLotto() {
  const data = await fetchJSON('data/lotto.json');
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

// ---------- 디스패처 ----------
const ROUTES = {
  home: pageHome,
  coin: () => pageGroup('coin', '#grid-coin'),
  stock: () => pageGroup(['kospi', 'spx', 'ndq', 'dji', 'nkx'], '#grid-stock'),
  kosdaq: () => pageGroup(['kosdaq'], '#grid-kosdaq'),
  fx: () => pageGroup('fx', '#grid-fx'),
  metal: () => pageGroup('metal', '#grid-metal'),
  giftcard: pageGiftcard,
  realestate: pageRealestate,
  lotto: pageLotto,
};

renderShell();
(ROUTES[document.body.dataset.page] || ROUTES.home)().catch((err) => {
  console.error(err);
  setStatus(null);
});
