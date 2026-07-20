'use strict';

const $ = (sel) => document.querySelector(sel);
const won = (n) => n.toLocaleString('ko-KR') + '원';
const num = (n, d = 2) =>
  n.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 값 크기에 따라 소수 자리수를 자동으로 정합니다. */
function fmtPrice(v, group) {
  if (group === 'coin' || group === 'fx') return v >= 100 ? num(v, 0) : num(v, 2);
  if (group === 'index') return num(v, 2);
  return num(v, 2);
}

function dir(n) {
  if (n == null || Math.abs(n) < 1e-9) return 'flat';
  return n > 0 ? 'up' : 'down';
}

function sparkline(values) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`)
    .join(' ');
  const cls = values.at(-1) >= values[0] ? 'up' : 'down';
  return `<svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.5"
      vector-effect="non-scaling-stroke" class="${cls}" />
  </svg>`;
}

/** 이모지 대신 스프라이트 아이콘을 씁니다. (#i-up / #i-down / #i-flat) */
function icon(id, cls = 'icon') {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
}

function card(item, i = 0) {
  const d = dir(item.changePct);
  const label = d === 'up' ? '상승' : d === 'down' ? '하락' : '보합';
  const pct =
    item.changePct == null
      ? ''
      : `${icon(d)}<span class="sr-label">${label}</span>${num(Math.abs(item.changePct), 2)}%`;
  const abs =
    item.change == null ? '' : `(${item.change > 0 ? '+' : '-'}${num(Math.abs(item.change), 2)})`;
  return `<article class="card" style="--i:${i}">
    <div class="name">${item.name}</div>
    <div class="price">${fmtPrice(item.price, item.group)}<span class="unit">${item.unit}</span></div>
    <div class="delta ${d}">${pct}${abs}</div>
    ${item.note ? `<div class="memo">${item.note}</div>` : ''}
    <span class="${d}">${sparkline(item.spark)}</span>
  </article>`;
}

// ---------- 시세 ----------
async function loadMarkets() {
  const data = await fetch('data/markets.json', { cache: 'no-store' }).then((r) => r.json());
  for (const group of ['index', 'metal', 'fx', 'coin']) {
    const items = data.items.filter((i) => i.group === group);
    const el = $(`#grid-${group}`);
    el.innerHTML = items.length
      ? items.map((it, i) => card(it, i)).join('')
      : '<p class="empty">데이터를 불러오지 못했습니다.</p>';
  }
  return data.updatedAt;
}

// ---------- 상품권 ----------
async function loadGiftcards() {
  const data = await fetch('data/giftcards.json', { cache: 'no-store' }).then((r) => r.json());
  const tbody = $('#tbl-gift tbody');
  const priced = data.items.filter((i) => typeof i.rate === 'number');

  $('#gift-note').textContent = priced.length
    ? `수동 관리 데이터입니다. 최종 갱신: ${new Date(data.updatedAt).toLocaleString('ko-KR')}`
    : '상품권 시세는 공개 API가 없어 수동으로 입력합니다. data/giftcards.json 의 rate 값을 채우면 이 표에 표시됩니다.';

  tbody.innerHTML = data.items
    .map((i) => {
      const hasRate = typeof i.rate === 'number';
      return `<tr>
        <td>${i.name}</td>
        <td class="num">${won(i.face)}</td>
        <td class="num">${hasRate ? num(i.rate, 1) + '%' : '<span class="flat">미입력</span>'}</td>
        <td class="num">${hasRate ? won(Math.round((i.face * i.rate) / 100)) : '<span class="flat">—</span>'}</td>
      </tr>`;
    })
    .join('');
}

// ---------- 백화점 상품권 (업체 사이트 직접 수집) ----------
let dept = null;
let face = null;

const faceLabel = (n) => (n >= 10000 ? `${n / 10000}만원권` : `${n.toLocaleString('ko-KR')}원권`);

async function loadDept() {
  const data = await fetch('data/giftcards-dept.json', { cache: 'no-store' }).then((r) => r.json());
  dept = data;

  const ok = data.shops.filter((s) => s.ok);
  $('#dept-note').textContent =
    `${ok.length}개 업체 공식 시세 페이지에서 직접 수집했습니다. ` +
    `최종 갱신: ${new Date(data.updatedAt).toLocaleString('ko-KR')}`;

  $('#dept-sources .source-list').innerHTML = data.shops
    .map(
      (s) =>
        `<li><a href="${s.site}" target="_blank" rel="noopener noreferrer nofollow">${s.name}</a>` +
        `<span class="src-state ${s.ok ? 'ok' : 'ng'}">${s.ok ? `${s.count}건` : '수집 실패'}</span></li>`
    )
    .join('');

  // 액면가 선택 버튼 — 수집된 액면가만 노출
  const faces = [...new Set(data.items.map((i) => i.face))].sort((a, b) => a - b);
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
    document
      .querySelectorAll('#face-seg .seg-btn')
      .forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.face) === face)));
    renderDept();
  });

  renderDept();
  return data.updatedAt;
}

/** 업체명 + 결제수단을 한 줄로 */
const shopLabel = (i) => (i.method ? `${i.shop} · ${i.method}` : i.shop);

function renderDept() {
  const rows = dept.items.filter((i) => i.face === face);
  const cards = [...new Set(rows.map((i) => i.card))];

  $('#grid-dept').innerHTML = cards
    .map((cardName, idx) => {
      const list = rows.filter((i) => i.card === cardName);

      // 팔 때는 매입가가 높을수록, 살 때는 판매가가 낮을수록 유리합니다.
      const buys = list.filter((i) => i.buy != null).sort((a, b) => b.buy - a.buy);
      const sells = list.filter((i) => i.sell != null).sort((a, b) => a.sell - b.sell);
      const bestBuy = buys[0];
      const bestSell = sells[0];

      const best = (item, kind) => {
        if (!item) return `<div class="best"><span class="k">${kind}</span><span class="v flat">—</span></div>`;
        const price = kind === '최고 매입가' ? item.buy : item.sell;
        const rate = kind === '최고 매입가' ? item.buyRate : item.sellRate;
        const sub = kind === '최고 매입가' ? '팔 때' : '살 때';
        return `<div class="best">
          <span class="k">${kind}<small>${sub}</small></span>
          <span class="v">${won(price)}</span>
          <span class="m">${rate != null ? `${num(rate, 2)}% · ` : ''}${shopLabel(item)}</span>
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
        <header class="gc-head">
          <h3>${cardName}</h3>
          <span class="gc-face">${faceLabel(face)}</span>
        </header>
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

// ---------- 로또 ----------
let lotto = null;
let shown = 20;

async function loadLotto() {
  const data = await fetch('data/lotto.json', { cache: 'no-store' }).then((r) => r.json());
  lotto = data.rounds.slice().sort((a, b) => b.round - a.round); // 최신순
  renderLottoHead();
  renderLottoTable();
  $('#ppl').addEventListener('input', () => {
    renderEstimate();
    renderLottoTable();
  });
  $('#lotto-more').addEventListener('click', () => {
    shown += 20;
    renderLottoTable();
  });
  renderEstimate();
  return data.updatedAt;
}

function renderLottoHead() {
  const r = lotto[0];
  if (!r) return;
  $('#lotto-head').innerHTML = `
    <div class="stat" style="--i:0">
      <div class="k">최신 회차</div>
      <div class="v">${r.round}회</div>
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

function perPerson() {
  return Number($('#ppl').value);
}

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
  const rows = lotto.slice(0, shown);
  $('#tbl-lotto tbody').innerHTML = rows
    .map(
      (r) => `<tr>
      <td class="num">${r.round}</td>
      <td>${r.date}</td>
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

// ---------- 탭 ----------
const TAB_GROUPS = { gift: 'gift', lotto: 'lotto' };
function setTab(name) {
  document.querySelectorAll('.tab').forEach((t) =>
    t.setAttribute('aria-selected', String(t.dataset.tab === name))
  );
  document.querySelectorAll('.panel').forEach((p) => {
    p.hidden = name !== 'all' && p.dataset.group !== (TAB_GROUPS[name] || name);
  });
}
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => setTab(t.dataset.tab))
);

// ---------- 테마 ----------
$('#theme-toggle').addEventListener('click', () => {
  const root = document.documentElement;
  const isDark = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = isDark ? 'light' : 'dark';
  try {
    localStorage.setItem('theme', root.dataset.theme);
  } catch (e) {}
});

// ---------- 시작 ----------
(async () => {
  const results = await Promise.allSettled([
    loadMarkets(),
    loadDept(),
    loadGiftcards(),
    loadLotto(),
  ]);
  const failed = results.filter((r) => r.status === 'rejected');
  failed.forEach((r) => console.error(r.reason));

  const stamp = results.find((r) => r.status === 'fulfilled' && r.value)?.value;
  const status = $('#updated');
  status.className = stamp ? 'status is-live' : 'status is-error';
  status.innerHTML =
    '<span class="dot"></span>' +
    (stamp
      ? `최종 갱신 ${new Date(stamp).toLocaleString('ko-KR')}`
      : '데이터를 불러오지 못했습니다. GitHub Actions 수집이 아직 실행되지 않았을 수 있습니다.');
})();
