'use strict';
/* V1 터미널 평가용 렌더러 — 사이트의 실제 데이터(JSON)만 사용합니다.
   채택 시에는 home-render.js 처럼 프리렌더/하이드레이션 공용 모듈로 옮깁니다. */

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const fmt0 = (n) => Math.round(Number(n)).toLocaleString('ko-KR');
const fmt2 = (n) => Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPrice = (it) => {
  const v = Number(it.price);
  if (String(it.unit || '').includes('원') || it.unit === 'KRW') return fmt0(v);
  if (it.group === 'coin' || it.group === 'fx') return v >= 100 ? fmt0(v) : fmt2(v);
  return fmt2(v);
};
const compactWon = (n) => {
  const v = Number(n);
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}조`;
  if (v >= 1e8) return `${Math.round(v / 1e8).toLocaleString('ko-KR')}억`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`;
  return fmt0(v);
};
const dirOf = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) < 1e-9) return 'flat';
  return n > 0 ? 'up' : 'down';
};
const pctText = (v) => {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const d = dirOf(v);
  if (d === 'flat') return '0.00%';
  return `${d === 'up' ? '▲' : '▼'} ${fmt2(Math.abs(v))}%`;
};
const stampHM = (iso) => (typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '');
const safeUrl = (u) => {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : '#';
  } catch {
    return '#';
  }
};
const fetchJSON = (p) =>
  fetch(p, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  });
const settled = (r) => (r.status === 'fulfilled' ? r.value : null);

/* 70×22 미니 스파크 (시안 규격) */
function spark(values, color) {
  const vals = (values || []).map(Number).filter(Number.isFinite);
  if (vals.length < 2) return '';
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const sp = mx - mn || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * 70).toFixed(1)},${(20 - ((v - mn) / sp) * 17).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  return `<svg class="kpi-spark spark" viewBox="0 0 70 22" preserveAspectRatio="none" aria-hidden="true">
    <path class="fill" d="${line} L70,22 L0,22 Z" fill="${color}"/><path d="${line}" stroke="${color}"/></svg>`;
}
const sparkColor = (d) => (d === 'up' ? '#3ddc84' : d === 'down' ? '#ff4d4f' : '#ffb020');

/* ---------- 티커 ---------- */
function renderTicker(markets, home, oil) {
  const by = new Map((markets?.items || []).map((i) => [i.id, i]));
  const items = [];
  const push = (sym, it, opts = {}) => {
    if (!it || !Number.isFinite(Number(it.price))) return;
    const d = dirOf(it.changePct);
    items.push(
      `<span class="ticker-item"><span class="sym">${esc(sym)}</span><span class="px">${opts.px || fmtPrice(it)}${opts.unit || ''}</span><span class="chg ${d}">${pctText(it.changePct)}</span></span>`
    );
  };
  push('BTC/KRW', by.get('btc'));
  push('ETH/KRW', by.get('eth'));
  push('KOSPI', by.get('kospi'));
  push('KOSDAQ', by.get('kosdaq'));
  push('USD/KRW', by.get('usdkrw'));
  push('JPY/KRW', by.get('jpykrw'));
  push('EUR/KRW', by.get('eurkrw'));
  push('금 1돈', by.get('gold_don'), { unit: '원' });
  push('은(국제)', by.get('silver'), { unit: '$' });
  push('WTI', by.get('wti'), { unit: '$' });
  const gas = (oil?.items || []).find((i) => i.id === 'gasoline');
  push('휘발유/L', gas, { unit: '원' });
  for (const g of home?.gifts || []) {
    const rate = (g.value / 100000) * 100;
    const d = dirOf(g.changePct);
    items.push(
      `<span class="ticker-item"><span class="sym">${esc(g.chip)} 10만원권</span><span class="px">${fmt2(rate)}%</span><span class="chg ${d}">${g.changePct == null ? '—' : pctText(g.changePct)}</span></span>`
    );
  }
  if (home?.lotto?.round) {
    items.push(
      `<span class="ticker-item"><span class="sym">LOTTO ${esc(home.lotto.round)}회</span><span class="px">1등 ${compactWon(home.lotto.firstPrize)}원</span><span class="chg">${esc(home.lotto.firstWinners)}명</span></span>`
    );
  }
  const html = items.join('');
  $('#ticker').innerHTML = html + html; // 끊김 없는 루프용 2회 반복
}

/* ---------- KPI ---------- */
function renderKpi(home, markets) {
  const by = new Map((markets?.items || []).map((i) => [i.id, i]));
  const cell = (label, value, chg, sparkVals, chgCls) => {
    const d = chgCls || dirOf(chg);
    return `<div class="kpi">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-row"><div class="kpi-chg ${d}">${typeof chg === 'string' ? chg : pctText(chg)}</div>${spark(sparkVals, sparkColor(d))}</div>
    </div>`;
  };
  const cells = [];
  const btc = by.get('btc');
  const kospi = by.get('kospi');
  const usd = by.get('usdkrw');
  if (btc) cells.push(cell('비트코인 · BTC/KRW', fmt0(btc.price), btc.changePct, btc.spark));
  if (kospi) cells.push(cell('코스피 · KOSPI', fmt2(kospi.price), kospi.changePct, kospi.spark));
  if (usd) cells.push(cell('원/달러 · USD/KRW', fmt2(usd.price), usd.changePct, usd.spark));
  const g0 = home?.gifts?.[0];
  if (g0) {
    const rate = (g0.value / 100000) * 100;
    cells.push(
      cell(
        `상품권 액면가율 · ${esc(g0.chip)}`,
        `${fmt2(rate)}<small>%</small>`,
        g0.changePct == null ? '전일 기록 없음' : `${pctText(g0.changePct)} D/D`,
        null,
        g0.changePct == null ? 'flat' : dirOf(g0.changePct)
      )
    );
  }
  $('#kpi-grid').innerHTML = cells.join('');
  $('#kpi-meta').textContent = home?.updatedAt ? `갱신 ${stampHM(home.updatedAt)}` : '';
}

/* ---------- BTC 캔들 (업비트 · 로컬 평가용 직접 호출, 실패 시 일봉 스파크로 폴백) ---------- */
const RANGES = {
  '1H': { path: 'minutes/1', count: 60, note: '1분봉 60개' },
  '4H': { path: 'minutes/5', count: 48, note: '5분봉 48개' },
  '1D': { path: 'minutes/15', count: 96, note: '15분봉 96개 (24시간)' },
  '1W': { path: 'minutes/60', count: 168, note: '60분봉 168개 (7일)' },
  '1M': { path: 'days', count: 30, note: '일봉 30개' },
};
const candleCache = new Map();
let chartToken = 0;

async function loadCandles(key) {
  if (candleCache.has(key)) return candleCache.get(key);
  const r = RANGES[key];
  const rows = await fetchJSON(`https://api.upbit.com/v1/candles/${r.path}?market=KRW-BTC&count=${r.count}`);
  const list = rows
    .slice()
    .reverse()
    .map((c) => ({ o: +c.opening_price, h: +c.high_price, l: +c.low_price, c: +c.trade_price, t: String(c.candle_date_time_kst || '') }))
    .filter((c) => [c.o, c.h, c.l, c.c].every(Number.isFinite));
  if (list.length < 2) throw new Error('캔들 부족');
  candleCache.set(key, list);
  return list;
}

const axisWon = (v) => (v >= 1e4 ? `${fmt0(v / 1e4)}만` : fmt0(v));
function drawCandles(list) {
  const W = 700;
  const H = 220;
  const n = list.length;
  const lo = Math.min(...list.map((c) => c.l));
  const hi = Math.max(...list.map((c) => c.h));
  const pad = (hi - lo || lo * 0.01) * 0.06;
  const y = (p) => H - ((p - (lo - pad)) / (hi - lo + pad * 2)) * H;
  const cw = W / n;
  let g = '<g stroke="#242424" stroke-width="0.5">';
  for (let k = 0; k <= 4; k += 1) g += `<line x1="0" y1="${(k * H) / 4}" x2="${W}" y2="${(k * H) / 4}"/>`;
  g += '</g><g fill="#7a7868" font-family="JetBrains Mono, monospace" font-size="9">';
  for (let k = 0; k < 4; k += 1) {
    const v = hi + pad - ((hi - lo + pad * 2) * k) / 4;
    g += `<text x="4" y="${(k * H) / 4 + 10}">${axisWon(v)}</text>`;
  }
  g += '</g>';
  for (let i = 0; i < n; i += 1) {
    const c = list[i];
    const x = i * cw + cw / 2;
    const up = c.c >= c.o;
    const color = up ? '#3ddc84' : '#ff4d4f';
    const top = y(Math.max(c.o, c.c));
    const h = Math.max(1, Math.abs(y(c.o) - y(c.c)));
    g += `<line x1="${x.toFixed(1)}" y1="${y(c.h).toFixed(1)}" x2="${x.toFixed(1)}" y2="${y(c.l).toFixed(1)}" stroke="${color}" stroke-width="1"/>`;
    g += `<rect x="${(x - cw * 0.35).toFixed(1)}" y="${top.toFixed(1)}" width="${(cw * 0.7).toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" opacity="0.9"/>`;
  }
  const last = list[n - 1].c;
  const ly = y(last);
  g += `<line x1="0" y1="${ly.toFixed(1)}" x2="${W}" y2="${ly.toFixed(1)}" stroke="#ffb020" stroke-width="0.5" stroke-dasharray="3,3"/>`;
  g += `<rect x="${W - 62}" y="${(ly - 7).toFixed(1)}" width="62" height="14" fill="#ffb020"/>`;
  g += `<text x="${W - 58}" y="${(ly + 3).toFixed(1)}" font-family="JetBrains Mono, monospace" font-size="9" fill="#000" font-weight="700">${axisWon(last)}</text>`;
  $('#chart-svg').innerHTML = g;
  return last;
}

function drawFallbackLine(values) {
  const vals = (values || []).map(Number).filter(Number.isFinite);
  if (vals.length < 2) return;
  const W = 700;
  const H = 220;
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const sp = mx - mn || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 10 - ((v - mn) / sp) * (H - 20)).toFixed(1)}`);
  $('#chart-svg').innerHTML = `<path d="M${pts.join(' L')}" fill="none" stroke="#ffb020" stroke-width="1.5"/>`;
}

async function selectRange(key, btc) {
  const token = ++chartToken;
  for (const b of document.querySelectorAll('#chart-toolbar .btn')) b.setAttribute('aria-pressed', String(b.dataset.range === key));
  try {
    const list = await loadCandles(key);
    if (token !== chartToken) return;
    const last = drawCandles(list);
    $('#chart-price').textContent = fmt0(last);
    $('#chart-note').textContent = `${RANGES[key].note} · 업비트 KRW-BTC · 시가/고가/저가/종가`;
    $('#chart-meta').textContent = `UPBIT · ${key}`;
    $('#chart-live').hidden = false;
  } catch (err) {
    console.error('캔들 로드 실패', err);
    if (token !== chartToken) return;
    drawFallbackLine(btc?.spark);
    $('#chart-note').textContent = '업비트 응답 없음 — 시간별 수집 일봉 40일 라인으로 표시';
    $('#chart-meta').textContent = '일봉 40D · 폴백';
    $('#chart-live').hidden = true;
  }
}

function initChart(markets) {
  const btc = (markets?.items || []).find((i) => i.id === 'btc');
  if (btc) {
    $('#chart-price').textContent = fmt0(btc.price);
    const c = $('#chart-chg');
    c.textContent = pctText(btc.changePct);
    c.className = `c ${dirOf(btc.changePct)}`;
  }
  $('#chart-toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('.btn[data-range]');
    if (b) selectRange(b.dataset.range, btc);
  });
  selectRange('1D', btc);
}

/* ---------- 거래대금 상위 코인 ---------- */
function renderMovers(markets) {
  const coins = (markets?.items || [])
    .filter((i) => i.group === 'coin' && Number.isFinite(Number(i.price)))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 8);
  const max = Math.max(...coins.map((c) => c.volume || 0)) || 1;
  $('#movers-body').innerHTML = coins.length
    ? coins
        .map(
          (c) => `<tr>
      <td><div class="sym">${esc(c.id.toUpperCase())}</div><div class="desc">${esc(c.name)}</div></td>
      <td class="num">${fmtPrice(c)}</td>
      <td class="num ${dirOf(c.changePct)}">${pctText(c.changePct)}</td>
      <td class="num bar-cell"><span class="bar" style="width:${Math.round(((c.volume || 0) / max) * 100)}%"></span><span class="val">${c.volume ? compactWon(c.volume) : '—'}</span></td>
    </tr>`
        )
        .join('')
    : '<tr><td colspan="4" class="empty">데이터 없음</td></tr>';
}

/* ---------- 환율 미니 4 + 우측 환율 ---------- */
function renderFx(markets) {
  const by = new Map((markets?.items || []).map((i) => [i.id, i]));
  const pairs = [
    ['usdkrw', 'USD/KRW', '🇺🇸'],
    ['jpykrw', 'JPY/KRW · 100¥', '🇯🇵'],
    ['eurkrw', 'EUR/KRW', '🇪🇺'],
    ['cnykrw', 'CNY/KRW', '🇨🇳'],
  ];
  $('#mini-fx').innerHTML = pairs
    .map(([id, label]) => {
      const it = by.get(id);
      if (!it) return '';
      return `<div class="mfx"><div class="mfx-code">${label}</div><div class="mfx-px">${fmtPrice(it)}</div><div class="mfx-chg ${dirOf(it.changePct)}">${pctText(it.changePct)}</div></div>`;
    })
    .join('');
  const rows = pairs.map(([id, label, flag]) => {
    const it = by.get(id);
    if (!it) return '';
    return `<div class="mini-quote"><span class="name">${flag} ${label}</span><span class="px">${fmtPrice(it)}</span><span class="chg ${dirOf(it.changePct)}">${pctText(it.changePct)}</span></div>`;
  });
  const dxy = by.get('dxy');
  if (dxy) rows.push(`<div class="mini-quote"><span class="name">달러 인덱스 DXY</span><span class="px">${fmt2(dxy.price)}</span><span class="chg ${dirOf(dxy.changePct)}">${pctText(dxy.changePct)}</span></div>`);
  $('#fx-list').innerHTML = rows.join('') || '<div class="empty">데이터 없음</div>';
}

/* ---------- 상품권 데스크 ---------- */
function renderGiftDesk(dept, home) {
  const ddBy = new Map((home?.gifts || []).map((g) => [g.chip, g.changePct]));
  const cards = ['신세계', '롯데', '현대', '갤러리아', '국민관광', '백화점 공통'];
  const html = cards
    .map((card) => {
      const all = (dept?.items || []).filter((i) => i.card === card);
      if (!all.length) return '';
      const faces = [...new Set(all.map((i) => Number(i.face)))];
      const face = faces.includes(100000) ? 100000 : Math.max(...faces);
      const rows = all.filter((i) => Number(i.face) === face);
      const bestBuy = rows.filter((i) => Number.isFinite(i.buy)).sort((a, b) => b.buy - a.buy)[0];
      const bestSell = rows.filter((i) => Number.isFinite(i.sell)).sort((a, b) => a.sell - b.sell)[0];
      if (!bestBuy) return '';
      const spread = bestSell ? bestSell.sell - bestBuy.buy : null;
      const rate = (bestBuy.buy / face) * 100;
      const dd = ddBy.get(card);
      const shop = (i) => `<span class="shop">${esc(i.method ? `${i.shop}·${i.method}` : i.shop)}</span>`;
      return `<a class="gc" href="/giftcard?face=${face}">
      <div class="gc-head"><div class="gc-name">${esc(card)}상품권</div><div class="gc-face">액면 ${fmt0(face)}</div></div>
      <div class="gc-row"><span class="k">최고 매입</span><span><span class="buy">${fmt0(bestBuy.buy)}원</span>${shop(bestBuy)}</span></div>
      <div class="gc-row"><span class="k">최저 판매</span><span>${bestSell ? `<span class="sell">${fmt0(bestSell.sell)}원</span>${shop(bestSell)}` : '<span class="flat">—</span>'}</span></div>
      <div class="gc-row"><span class="k">스프레드</span><span>${spread == null ? '—' : `${fmt0(spread)}원`}</span></div>
      <div class="gc-rate"><span class="pct">${fmt2(rate)}%</span><span class="lbl">액면가율 · ${rows.length}개 업체</span>${dd != null ? `<span class="dd ${dirOf(dd)}">${pctText(dd)} D/D</span>` : ''}</div>
    </a>`;
    })
    .join('');
  $('#gift-grid').innerHTML = html || '<div class="empty">데이터 없음</div>';
  $('#gift-meta').textContent = dept?.updatedAt ? `${(dept.shops || []).filter((s) => s.ok).length}개 업체 · 갱신 ${stampHM(dept.updatedAt)}` : '';
}

/* ---------- 에너지 · 귀금속 ---------- */
const row4 = (name, price, chg, unit) =>
  `<tr><td class="sym">${esc(name)}</td><td class="num">${price}</td><td class="num ${dirOf(chg)}">${pctText(chg)}</td><td class="num">${esc(unit)}</td></tr>`;
function renderEnergy(oil, markets) {
  const rows = (oil?.items || []).map((i) => row4(i.name, fmt0(i.price), i.changePct, i.unit));
  const by = new Map((markets?.items || []).map((i) => [i.id, i]));
  for (const id of ['wti', 'brent', 'natgas']) {
    const it = by.get(id);
    if (it) rows.push(row4(it.name, fmtPrice(it), it.changePct, it.unit));
  }
  $('#energy-body').innerHTML = rows.join('') || '<tr><td colspan="4" class="empty">데이터 없음</td></tr>';
}
function renderMetals(markets) {
  const by = new Map((markets?.items || []).map((i) => [i.id, i]));
  const rows = ['gold_krx', 'gold_don', 'gold', 'silver', 'plat', 'palladium']
    .map((id) => by.get(id))
    .filter(Boolean)
    .map((it) => row4(it.name, fmtPrice(it), it.changePct, it.unit));
  $('#metal-body').innerHTML = rows.join('') || '<tr><td colspan="4" class="empty">데이터 없음</td></tr>';
}

/* ---------- 뉴스 ---------- */
const TOPIC_KR = { coin: '코인', stock: '주식', macro: '지표', giftcard: '상품권', energy: '유가', metal: '금·은', fx: '환율', realestate: '부동산', kosdaq: '코스닥', lotto: '로또' };
function renderNews(feeds) {
  const all = [];
  for (const f of feeds) {
    if (!f) continue;
    for (const it of f.items || []) {
      const t = Date.parse(it.date || it.pubDate || it.published || '');
      all.push({ ...it, topic: f.topic, ts: Number.isFinite(t) ? t : 0 });
    }
  }
  all.sort((a, b) => b.ts - a.ts);
  const top = all.slice(0, 7);
  const fmtT = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  $('#news-list').innerHTML = top.length
    ? top
        .map(
          (n) => `<div class="news-item">
      <div class="news-time">${fmtT(n.ts)}${n.source ? ` · ${esc(n.source)}` : ''}</div>
      <a class="news-title" href="${safeUrl(n.link)}" target="_blank" rel="noopener noreferrer nofollow">${esc(n.title)}</a>
      <span class="news-tag">${esc(TOPIC_KR[n.topic] || n.topic || '')}</span>
    </div>`
        )
        .join('')
    : '<div class="empty">뉴스 없음</div>';
  $('#news-cnt').textContent = all.length ? `${all.length}건 수집` : '';
}

/* ---------- 금리 ---------- */
function renderRates(rates) {
  const rows = (rates?.items || []).map((r) => {
    const d = dirOf(r.change);
    const chg = r.change == null ? '—' : `${r.change > 0 ? '+' : ''}${fmt2(r.change)}`;
    return `<div class="mini-quote"><span class="name">${esc(r.name)}</span><span class="px">${fmt2(r.price)}${esc(r.unit || '')}</span><span class="chg ${d}">${chg}</span></div>`;
  });
  $('#rates-list').innerHTML = rows.join('') || '<div class="empty">데이터 없음</div>';
}

/* ---------- 로또 ---------- */
const ballCls = (n) => `b${Math.min(5, Math.ceil(n / 10))}`;
function renderLotto(home) {
  const l = home?.lotto;
  if (!l?.numbers) {
    $('#lotto-block').innerHTML = '<div class="empty">데이터 없음</div>';
    return;
  }
  $('#lotto-cnt').textContent = `${l.round}회`;
  $('#lotto-block').innerHTML = `
    <div class="lotto-round">추첨 ${esc(l.date)}</div>
    <div class="lotto-nums">${l.numbers.map((n) => `<span class="lotto-ball ${ballCls(n)}">${n}</span>`).join('')}<span class="lotto-plus">+</span><span class="lotto-ball ${ballCls(l.bonus)}">${l.bonus}</span></div>
    <div class="lotto-meta"><span>1등 당첨금</span><span class="v hi">${l.firstPrize ? `${compactWon(l.firstPrize)}원` : '—'}</span></div>
    <div class="lotto-meta"><span>1등 당첨자</span><span class="v">${l.firstWinners != null ? `${l.firstWinners}명` : '—'}</span></div>
    ${l.sales ? `<div class="lotto-meta"><span>총 판매액</span><span class="v">${compactWon(l.sales)}원</span></div>` : ''}`;
}

/* ---------- 부동산 (서울 ㎡당, 구별 상위) ---------- */
function renderRealestate(home, re) {
  const s = home?.seoul;
  const rows = [];
  if (s?.pm2) {
    const ym = `${String(s.ym).slice(0, 4)}.${String(s.ym).slice(4, 6)}`;
    // 전월 서울 평균(건수 가중)으로 전월비 계산
    const prevYm = (() => {
      const y = Number(String(s.ym).slice(0, 4));
      const m = Number(String(s.ym).slice(4, 6));
      return m === 1 ? `${y - 1}12` : `${y}${String(m - 1).padStart(2, '0')}`;
    })();
    const seoul = Object.values(re?.sgg || {}).filter((d) => d.sido === '서울');
    let pn = 0;
    let psum = 0;
    for (const d of seoul) {
      const mm = d.m?.[prevYm];
      if (mm?.n && mm.pm2) {
        pn += mm.n;
        psum += mm.pm2 * mm.n;
      }
    }
    const prev = pn ? psum / pn : null;
    const chg = prev ? ((s.pm2 - prev) / prev) * 100 : null;
    rows.push(`<div class="mini-quote"><span class="name">서울 ㎡당 평균 · ${ym}</span><span class="px">${fmt0(s.pm2)}만</span><span class="chg ${dirOf(chg)}">${chg == null ? '—' : pctText(chg)}</span></div>`);
    rows.push(`<div class="mini-quote"><span class="name">거래 건수</span><span class="px">${fmt0(s.n)}건</span><span class="chg"></span></div>`);
    const top = seoul
      .map((d) => ({ name: d.sgg, ...(d.m?.[s.ym] || {}) }))
      .filter((d) => d.pm2 && d.n >= 5)
      .sort((a, b) => b.pm2 - a.pm2)
      .slice(0, 3);
    for (const t of top) rows.push(`<div class="mini-quote"><span class="name">${esc(t.name)}</span><span class="px">${fmt0(t.pm2)}만/㎡</span><span class="chg flat">${t.n}건</span></div>`);
  }
  $('#re-list').innerHTML = rows.join('') || '<div class="empty">데이터 없음</div>';
}

/* ---------- 사이드 주요 시세 ---------- */
function renderWatch(markets) {
  const by = new Map((markets?.items || []).map((i) => [i.id, i]));
  const rows = [
    ['BTC', 'btc'], ['ETH', 'eth'], ['KOSPI', 'kospi'], ['USDKRW', 'usdkrw'], ['금1돈', 'gold_don'], ['WTI', 'wti'],
  ]
    .map(([sym, id]) => {
      const it = by.get(id);
      if (!it) return '';
      const d = dirOf(it.changePct);
      const px = it.group === 'coin' && it.price >= 1e6 ? `${(it.price / 1e6).toFixed(2)}M` : fmtPrice(it);
      return `<div class="watch-row"><span class="watch-sym">${sym}</span><span class="watch-px">${px}</span><span class="watch-chg ${d}">${it.changePct == null ? '—' : `${it.changePct > 0 ? '+' : ''}${fmt2(it.changePct)}`}</span></div>`;
    })
    .join('');
  $('#side-watch').innerHTML = rows;
}

/* ---------- 시계 · 단축키 ---------- */
function startClock() {
  const el = $('#clock');
  const tick = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} KST`;
  };
  tick();
  setInterval(tick, 1000);
}
function bindKeys() {
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'Home') {
      scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const a = document.querySelector(`.tab[data-key="${CSS.escape(e.key)}"]`);
    if (a) location.href = a.getAttribute('href');
  });
}

/* ---------- 부트 ---------- */
(async () => {
  startClock();
  bindKeys();
  const [home, markets, rates, oil, dept, re, ...feeds] = (
    await Promise.allSettled([
      fetchJSON('/data/home.json'),
      fetchJSON('/data/markets.json'),
      fetchJSON('/data/rates.json'),
      fetchJSON('/data/oil.json'),
      fetchJSON('/data/giftcards-dept.json'),
      fetchJSON('/data/realestate.json'),
      ...['coin', 'stock', 'macro', 'giftcard', 'energy', 'metal'].map((t) => fetchJSON(`/data/news/${t}.json`)),
    ])
  ).map(settled);

  const guard = (fn) => {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  };
  guard(() => renderTicker(markets, home, oil));
  guard(() => renderKpi(home, markets));
  guard(() => initChart(markets));
  guard(() => renderMovers(markets));
  guard(() => renderFx(markets));
  guard(() => renderGiftDesk(dept, home));
  guard(() => renderEnergy(oil, markets));
  guard(() => renderMetals(markets));
  guard(() => renderNews(feeds));
  guard(() => renderRates(rates));
  guard(() => renderLotto(home));
  guard(() => renderRealestate(home, re));
  guard(() => renderWatch(markets));

  const stamp = home?.updatedAt || markets?.updatedAt;
  if (stamp) {
    const d = new Date(stamp);
    const txt = Number.isNaN(d.valueOf()) ? stamp : `${d.getMonth() + 1}/${d.getDate()} ${stampHM(stamp)}`;
    $('#status-updated').textContent = `최종 갱신 ${txt}`;
    $('#updated-top').textContent = `갱신 ${stampHM(stamp)} · 매시간`;
  }
})();
