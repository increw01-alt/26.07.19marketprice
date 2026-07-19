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

function card(item) {
  const d = dir(item.changePct);
  const arrow = d === 'up' ? '▲' : d === 'down' ? '▼' : '–';
  const pct = item.changePct == null ? '' : `${arrow} ${num(Math.abs(item.changePct), 2)}%`;
  const abs =
    item.change == null ? '' : ` (${item.change > 0 ? '+' : '-'}${num(Math.abs(item.change), 2)})`;
  return `<article class="card">
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
      ? items.map(card).join('')
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
    <div class="stat">
      <div class="k">최신 회차</div>
      <div class="v">${r.round}회</div>
      <div class="balls">
        ${r.numbers.map((n) => `<span class="ball">${n}</span>`).join('')}
        <span class="ball bonus">${r.bonus}</span>
      </div>
    </div>
    <div class="stat"><div class="k">추첨일</div><div class="v">${r.date}</div></div>
    <div class="stat"><div class="k">판매 게임 수</div><div class="v">${r.games.toLocaleString('ko-KR')}</div></div>
    <div class="stat"><div class="k">총 판매금액</div><div class="v">${(r.sales / 1e8).toFixed(0)}억원</div></div>
    <div class="stat"><div class="k">1등 당첨금</div><div class="v">${(r.firstPrize / 1e8).toFixed(2)}억원</div></div>`;
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
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
  document.querySelectorAll('.panel').forEach((p) => {
    p.hidden = name !== 'all' && p.dataset.group !== (TAB_GROUPS[name] || name);
  });
}
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => setTab(t.dataset.tab))
);

// ---------- 시작 ----------
(async () => {
  const results = await Promise.allSettled([loadMarkets(), loadGiftcards(), loadLotto()]);
  const failed = results.filter((r) => r.status === 'rejected');
  failed.forEach((r) => console.error(r.reason));

  const stamp = results.find((r) => r.status === 'fulfilled' && r.value)?.value;
  $('#updated').textContent = stamp
    ? `최종 갱신: ${new Date(stamp).toLocaleString('ko-KR')}`
    : '데이터를 불러오지 못했습니다. GitHub Actions 수집이 아직 실행되지 않았을 수 있습니다.';
})();
