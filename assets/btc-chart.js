// 홈 BTC 블록의 인터랙티브 차트 (B단계) — 업비트 공개 API 를 브라우저에서 직접 호출합니다.
// 점진적 향상: 이 스크립트/API 가 실패하면 프리렌더된 정적 일봉 차트가 그대로 남습니다.
// 시안(design_handoff_home_redesign)의 좌표·툴팁 규칙을 따릅니다.
(function initBtcChart(root) {
  'use strict';

  const MARKET = 'KRW-BTC';
  const API = 'https://api.upbit.com/v1';
  const FAV_KEY = 'modoo-btc-fav';

  const fmt0 = (n) => Math.round(Number(n)).toLocaleString('ko-KR');
  const fmt2 = (n) =>
    Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compactWon = (n) => {
    const v = Number(n);
    if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조원`;
    if (v >= 1e8) return `${Math.round(v / 1e8).toLocaleString('ko-KR')}억원`;
    return `${fmt0(v)}원`;
  };

  // 기간 탭 → 업비트 캔들 엔드포인트. 캡션은 실제 데이터 단위를 정직하게 표기합니다.
  // 주의: 업비트 캔들 count 상한은 200 — '1년'을 일봉 365개로 요청하면 조용히
  // 200개(약 6.5개월)로 잘려 오므로 주봉을 씁니다. ttl 은 캐시 유효시간(ms).
  const RANGES = {
    '1시간': { path: 'minutes/1', count: 60, label: 'time', tip: 'time', ttl: 60_000, cap: '1분봉 60개 · 업비트' },
    '1일': { path: 'minutes/10', count: 144, label: 'time', tip: 'time', ttl: 300_000, cap: '10분봉 144개 (24시간) · 업비트' },
    '1주': { path: 'minutes/60', count: 168, label: 'date', tip: 'datetime', ttl: 600_000, cap: '60분봉 168개 (7일) · 업비트' },
    '1개월': { path: 'days', count: 30, label: 'date', tip: 'day', ttl: 600_000, cap: '일봉 30개 · 업비트' },
    '3개월': { path: 'days', count: 91, label: 'date', tip: 'day', ttl: 600_000, cap: '일봉 91개 · 업비트' },
    '1년': { path: 'weeks', count: 53, label: 'ym', tip: 'day', ttl: 600_000, cap: '주봉 53개 (1년) · 업비트' },
    전체: { path: 'months', count: 120, label: 'year', tip: 'day', ttl: 600_000, cap: '월봉 · 업비트' },
  };
  const TAB_ORDER = ['1시간', '1일', '1주', '1개월', '3개월', '1년', '전체'];

  /** candle_date_time_kst("YYYY-MM-DDTHH:mm:ss") → 축/툴팁 라벨 */
  function tickLabel(kst, kind) {
    if (typeof kst !== 'string' || kst.length < 16) return '';
    if (kind === 'time') return kst.slice(11, 16);
    if (kind === 'date') return `${Number(kst.slice(5, 7))}/${Number(kst.slice(8, 10))}`;
    if (kind === 'ym') return `${kst.slice(2, 4)}.${Number(kst.slice(5, 7))}`;
    return kst.slice(0, 4);
  }
  // 툴팁 라벨 — 봉 단위에 맞는 정밀도만 표기합니다 (일봉에 09:00 을 붙이지 않음).
  const tipLabel = (kst, kind) => {
    if (kind === 'time') return tickLabel(kst, 'time');
    if (kind === 'datetime') return `${kst.slice(0, 10)} ${kst.slice(11, 16)}`;
    return kst.slice(0, 10);
  };

  // 업비트는 초당 요청 한도를 넘으면 429 를 주는데, 이때 CORS 헤더가 빠져
  // 브라우저에선 fetch 자체가 실패로 보입니다. 잠시 후 1회 재시도로 흡수합니다.
  async function getJSON(url) {
    let lastErr;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (attempt) await new Promise((r) => setTimeout(r, 800));
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return await res.json();
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  const candleCache = new Map();
  async function loadCandles(rangeKey) {
    const r = RANGES[rangeKey];
    const cached = candleCache.get(rangeKey);
    if (cached && Date.now() - cached.at < r.ttl) return cached.list;
    const rows = await getJSON(`${API}/candles/${r.path}?market=${MARKET}&count=${r.count}`);
    // 업비트는 최신순으로 주므로 과거→현재로 뒤집습니다.
    const list = (Array.isArray(rows) ? rows : [])
      .slice()
      .reverse()
      .map((c) => ({
        t: String(c.candle_date_time_kst || ''),
        p: Number(c.trade_price),
        h: Number(c.high_price),
        l: Number(c.low_price),
        v: Number(c.candle_acc_trade_volume) || 0,
      }))
      .filter((c) => Number.isFinite(c.p));
    // 길이 검증은 필터 이후에 — 비유한 가격이 섞인 응답이 그대로 렌더되지 않게.
    if (list.length < 2) throw new Error('캔들 데이터 부족');
    candleCache.set(rangeKey, { at: Date.now(), list });
    return list;
  }

  const state = { range: '1일', token: 0, candles: null, els: null };

  function readFav() {
    try {
      return localStorage.getItem(FAV_KEY) === '1';
    } catch {
      return false;
    }
  }
  function writeFav(on) {
    try {
      if (on) localStorage.setItem(FAV_KEY, '1');
      else localStorage.removeItem(FAV_KEY);
    } catch {}
  }

  function starSvg(on) {
    return `<svg viewBox="0 0 24 24" fill="${on ? '#f59e0b' : 'none'}" stroke="${on ? '#d97706' : '#9aa8bd'}" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"></path></svg>`;
  }

  /** 캔들 배열 → 라인/면 path (0..860 × 0..240) + 그리드 값 */
  function chartPaths(candles) {
    const ps = candles.map((c) => c.p);
    const mn = Math.min(...ps);
    const mx = Math.max(...ps);
    const pad = (mx - mn || mn * 0.01) * 0.06;
    const lo = mn - pad;
    const hi = mx + pad;
    const X = (i) => (i / (candles.length - 1)) * 860;
    const Y = (p) => (1 - (p - lo) / (hi - lo)) * 240;
    const line = `M${candles.map((c, i) => `${X(i).toFixed(1)} ${Y(c.p).toFixed(1)}`).join('L')}`;
    return { line, area: `${line}L860 240L0 240Z`, lo, hi };
  }

  function volumePath(candles) {
    const vols = candles.map((c) => c.v);
    const max = Math.max(...vols) || 1;
    const nb = vols.length;
    const bw = 860 / nb;
    let d = '';
    for (let i = 0; i < nb; i += 1) {
      const h = (vols[i] / max) * 46;
      if (h < 0.5) continue;
      d += `M${(i * bw + bw * 0.15).toFixed(1)} ${(50 - h).toFixed(1)}h${(bw * 0.7).toFixed(1)}v${h.toFixed(1)}h-${(bw * 0.7).toFixed(1)}Z`;
    }
    return d;
  }

  function renderRange(candles, rangeKey) {
    const { els } = state;
    const r = RANGES[rangeKey];
    const { line, area, lo, hi } = chartPaths(candles);
    els.line.setAttribute('d', line);
    els.area.setAttribute('d', area);

    // Y 그리드 4줄 (위→아래)
    els.ygrid.innerHTML = [0, 1, 2, 3]
      .map((k) => {
        const value = hi - ((hi - lo) * k) / 3;
        return `<div class="btcx-yline" style="top:${(k / 3) * 100}%"><span>${fmt0(value)}</span></div>`;
      })
      .join('');

    // X 라벨 5개 균등
    const n = candles.length;
    els.xrow.innerHTML = [0, 1, 2, 3, 4]
      .map((k) => `<span>${tickLabel(candles[Math.round(((n - 1) * k) / 4)].t, r.label)}</span>`)
      .join('');

    // 거래량
    els.volPath.setAttribute('d', volumePath(candles));
    const volSum = candles.reduce((s, c) => s + c.v, 0);
    els.volSum.textContent =
      volSum >= 1000 ? `${(volSum / 1000).toFixed(2)}K BTC` : `${volSum.toFixed(1)} BTC`;

    els.caption.textContent =
      rangeKey === '전체' && candles[0]?.t
        ? `${RANGES.전체.cap} · ${candles[0].t.slice(0, 4)}년~`
        : r.cap;
    els.hover.hidden = true;
    state.candles = candles;
    state.rangeMeta = { lo, hi, tipKind: r.tip };
  }

  function setPressed(rangeKey) {
    for (const b of state.els.tabs.querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset.range === rangeKey));
    }
  }

  async function selectRange(rangeKey) {
    const prev = state.range;
    const token = ++state.token;
    setPressed(rangeKey); // 낙관적 표시 — 실패하면 아래에서 되돌립니다.
    try {
      const candles = await loadCandles(rangeKey);
      if (token !== state.token) return; // 뒤늦게 도착한 응답 무시
      state.range = rangeKey;
      renderRange(candles, rangeKey);
    } catch (err) {
      console.error('BTC 캔들 로드 실패', err);
      if (token === state.token) {
        // 차트·호버는 이전 기간 데이터 그대로이므로 탭 표시도 되돌려 일관성 유지
        setPressed(prev);
        state.els.caption.textContent = '차트 데이터를 불러오지 못했습니다. 기존 기간을 유지합니다.';
      }
    }
  }

  function onMove(e) {
    const { candles, rangeMeta, els } = state;
    if (!candles || !rangeMeta) return;
    const rect = els.plotHit.getBoundingClientRect();
    const frac = Math.min(0.999, Math.max(0, (e.clientX - rect.left) / rect.width));
    const i = Math.round(frac * (candles.length - 1));
    const c = candles[i];
    const x = (i / (candles.length - 1)) * 100;
    const y = (1 - (c.p - rangeMeta.lo) / (rangeMeta.hi - rangeMeta.lo)) * 100;
    els.hover.hidden = false;
    els.hover.style.left = `${x}%`;
    els.hoverDot.style.top = `${y}%`;
    els.hoverTip.textContent = `${tipLabel(c.t, rangeMeta.tipKind)} · ${fmt0(c.p)}원`;
    els.hoverTip.style.transform = frac > 0.55 ? 'translate(calc(-100% - 14px),0)' : 'translate(10px,0)';
  }

  /**
   * 티커·캔들로 시장 요약을 실시간 값으로 갱신합니다.
   * 24H 고저는 티커의 high/low(UTC 일 기준이라 '당일'로 쓰면 거짓)가 아니라,
   * 기본 탭('1일')의 롤링 24시간 캔들에서 직접 계산합니다.
   */
  async function applyTicker(container, dayCandles) {
    try {
      const [t] = await getJSON(`${API}/ticker?markets=${MARKET}`);
      if (!t) return;
      const now = container.querySelector('.btc-now');
      if (now && Number.isFinite(t.trade_price)) now.textContent = `${fmt0(t.trade_price)}원`;
      let deltaText = null;
      let deltaCls = null;
      if (Number.isFinite(t.signed_change_rate)) {
        const up = t.signed_change_rate > 0;
        const flat = Math.abs(t.signed_change_rate) < 1e-9;
        deltaCls = flat ? 'flat' : up ? 'up' : 'down';
        deltaText = flat
          ? '보합'
          : `${up ? '▲' : '▼'} ${fmt2(Math.abs(t.signed_change_rate) * 100)}% (${up ? '+' : '-'}${fmt0(Math.abs(t.signed_change_price))}원)`;
      }
      const headDelta = container.querySelector('.btc-price .hcard-d');
      if (headDelta && deltaText) {
        headDelta.className = `hcard-d ${deltaCls}`;
        headDelta.textContent = deltaText;
      }
      const side = container.querySelector('.btc-side');
      if (side) {
        // 사이드의 '전일 대비'도 같은 실시간 값으로 맞춥니다 (헤드라인과 어긋나지 않게).
        if (deltaText) {
          for (const row of side.querySelectorAll('.btc-row')) {
            if (row.querySelector('span')?.textContent === '전일 대비') {
              const b = row.querySelector('b');
              if (b) {
                b.className = deltaCls;
                b.textContent = deltaText;
              }
            }
          }
        }
        const highs = (dayCandles || []).map((c) => c.h).filter(Number.isFinite);
        const lows = (dayCandles || []).map((c) => c.l).filter(Number.isFinite);
        const mk = (label, value) =>
          `<div class="btc-row"><span>${label}</span><b>${value}</b></div>`;
        const extra = [
          highs.length ? mk('24H 고가', `${fmt0(Math.max(...highs))}원`) : '',
          lows.length ? mk('24H 저가', `${fmt0(Math.min(...lows))}원`) : '',
          Number.isFinite(t.acc_trade_volume_24h)
            ? mk('24H 거래량', `${fmt2(t.acc_trade_volume_24h)} BTC`)
            : '',
          Number.isFinite(t.acc_trade_price_24h)
            ? mk('24H 거래대금', compactWon(t.acc_trade_price_24h))
            : '',
        ].join('');
        if (extra) {
          // 프리렌더의 24H 거래대금(시간 단위 markets.json 값)은 티커 실시간 값으로 대체합니다.
          for (const row of side.querySelectorAll('.btc-row')) {
            if (row.querySelector('span')?.textContent === '24H 거래대금') row.remove();
          }
          const firstRow = side.querySelector('.btc-row');
          if (firstRow) firstRow.insertAdjacentHTML('afterend', extra);
        }
      }
    } catch (err) {
      console.error('BTC 티커 로드 실패', err);
    }
  }

  /** pageHome 하이드레이션 뒤 호출 — 정적 차트를 인터랙티브 버전으로 교체합니다. */
  async function enhance() {
    const block = document.querySelector('#btc-block');
    const main = block?.querySelector('.btc-main');
    const staticChart = main?.querySelector('.btc-chart');
    if (!block || !main || !staticChart || main.dataset.enhanced) return;

    // 첫 데이터를 먼저 받아 성공했을 때만 정적 차트를 교체합니다 (실패 시 그대로 유지).
    // enhanced 플래그도 성공 이후에 세워, 향후 재호출 시 재시도가 막히지 않게 합니다.
    let candles;
    try {
      candles = await loadCandles(state.range);
    } catch (err) {
      console.error('BTC 캔들 로드 실패 — 정적 차트 유지', err);
      return;
    }
    if (main.dataset.enhanced) return; // 동시 호출 경합 방어
    main.dataset.enhanced = 'true';

    // 관심(별) 토글
    const head = main.querySelector('.btc-head');
    if (head && !head.querySelector('.btc-fav')) {
      const fav = document.createElement('button');
      fav.type = 'button';
      fav.className = 'btc-fav';
      fav.setAttribute('aria-pressed', String(readFav()));
      fav.setAttribute('aria-label', '비트코인 관심 등록');
      fav.innerHTML = starSvg(readFav());
      fav.addEventListener('click', () => {
        const next = !readFav();
        writeFav(next);
        fav.innerHTML = starSvg(next);
        fav.setAttribute('aria-pressed', String(next));
      });
      head.appendChild(fav);
    }

    // 탭 + 플롯 + 거래량 마크업으로 교체
    const wrap = document.createElement('div');
    wrap.className = 'btcx';
    wrap.innerHTML = `
<div class="btc-tabs" role="group" aria-label="차트 기간">
  ${TAB_ORDER.map(
    (k) =>
      `<button type="button" data-range="${k}" aria-pressed="${k === state.range}">${k}</button>`
  ).join('')}
</div>
<div class="btcx-plot">
  <div class="btcx-ygrid" aria-hidden="true"></div>
  <svg viewBox="0 0 860 240" preserveAspectRatio="none" class="btcx-svg" aria-hidden="true">
    <defs><linearGradient id="gBtcLive" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.26"></stop><stop offset="1" stop-color="#3b82f6" stop-opacity="0"></stop></linearGradient></defs>
    <path class="btcx-area" fill="url(#gBtcLive)"></path>
    <path class="btcx-line" fill="none" stroke="#2563eb" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"></path>
  </svg>
  <div class="btcx-hit"></div>
  <div class="btcx-hover" hidden>
    <span class="btcx-dot"></span>
    <span class="btcx-tip"></span>
  </div>
</div>
<div class="btcx-xrow" aria-hidden="true"></div>
<div class="btcx-volhead"><span>거래량</span><span class="btcx-volsum"></span></div>
<svg viewBox="0 0 860 50" preserveAspectRatio="none" class="btcx-vol" aria-hidden="true"><path fill="#c9d8f0"></path></svg>
<p class="kpi-cap btcx-cap"></p>`;

    // 정적 차트(svg)와 캡션을 새 UI 로 교체
    const oldCap = main.querySelector('.kpi-cap');
    staticChart.replaceWith(wrap);
    if (oldCap) oldCap.remove();

    state.els = {
      tabs: wrap.querySelector('.btc-tabs'),
      line: wrap.querySelector('.btcx-line'),
      area: wrap.querySelector('.btcx-area'),
      ygrid: wrap.querySelector('.btcx-ygrid'),
      xrow: wrap.querySelector('.btcx-xrow'),
      volPath: wrap.querySelector('.btcx-vol path'),
      volSum: wrap.querySelector('.btcx-volsum'),
      caption: wrap.querySelector('.btcx-cap'),
      plotHit: wrap.querySelector('.btcx-hit'),
      hover: wrap.querySelector('.btcx-hover'),
      hoverDot: wrap.querySelector('.btcx-dot'),
      hoverTip: wrap.querySelector('.btcx-tip'),
    };

    state.els.tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-range]');
      if (b) selectRange(b.dataset.range);
    });
    state.els.plotHit.addEventListener('mousemove', onMove);
    state.els.plotHit.addEventListener('mouseleave', () => {
      state.els.hover.hidden = true;
    });

    renderRange(candles, state.range);
    applyTicker(block, candles);
  }

  root.MODOO_BTC_CHART = { enhance };
})(typeof globalThis === 'object' ? globalThis : this);
