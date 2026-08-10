// 홈 화면 렌더러 — 빌드(정적 프리렌더)와 브라우저(하이드레이션)가 같은 코드를 씁니다.
// site-config.js 와 같은 UMD 패턴: 브라우저 전역 MODOO_HOME_RENDER / Node require 겸용.
// 데이터 구성(composeHome)도 여기 두어 home.json(런타임)과 프리렌더가 절대 어긋나지 않게 합니다.
(function initHomeRender(root) {
  'use strict';

  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const fmt0 = (n) => Math.round(Number(n)).toLocaleString('ko-KR');
  const fmt2 = (n) =>
    Number(n).toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function compactWon(n) {
    const v = Number(n);
    if (v >= 1e12) return `${(v / 1e12).toFixed(1)}조원`;
    if (v >= 1e8) return `${Math.round(v / 1e8).toLocaleString('ko-KR')}억원`;
    if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString('ko-KR')}만원`;
    return `${fmt0(v)}원`;
  }

  const dirOf = (pct) => {
    const v = Number(pct);
    if (!Number.isFinite(v) || Math.abs(v) < 1e-9) return 'flat';
    return v > 0 ? 'up' : 'down';
  };
  const deltaText = (pct) => {
    // 결측(null)은 '변동 없음'이 아니라 '알 수 없음'입니다.
    if (pct == null || !Number.isFinite(Number(pct))) return '—';
    const d = dirOf(pct);
    if (d === 'flat') return '보합';
    return `${d === 'up' ? '▲' : '▼'} ${fmt2(Math.abs(pct))}%`;
  };

  /** ISO(+09:00) → "HH:MM" — 로케일 무관·노드/브라우저 동일 결과 */
  const stampHM = (iso) => (typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '');

  /** 값 배열 → 220×56 영역 스파크라인 path (시안의 spark 로직) */
  function areaSpark(values) {
    const vals = (values || []).map(Number).filter(Number.isFinite);
    if (vals.length < 2) return null;
    const n = vals.length;
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const sp = mx - mn || 1;
    const pts = vals.map(
      (v, i) => `${((i / (n - 1)) * 220).toFixed(1)} ${(5 + (1 - (v - mn) / sp) * 44).toFixed(1)}`
    );
    const line = `M${pts.join('L')}`;
    return { line, fill: `${line}L220 56L0 56Z` };
  }

  // 카테고리 컬러 아이콘 (시안 원본 그대로 — data URI SVG)
  const svgUri = (b) =>
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${b}</svg>`);
  const ICONS = {
    coin: svgUri('<path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.548z" fill="#f7931a"/><path fill-rule="evenodd" d="M17.288 10.29c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.236c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.524 2.75 2.09z" fill="#fff"/>'),
    stock: svgUri('<rect x="3" y="13" width="4.6" height="8" rx="1.3" fill="#93c5fd"/><rect x="9.7" y="9" width="4.6" height="12" rx="1.3" fill="#3b82f6"/><rect x="16.4" y="4.5" width="4.6" height="16.5" rx="1.3" fill="#1d4ed8"/>'),
    kosdaq: svgUri('<path d="M3 21v-5l4.5-5 3.5 3 5-7 5 4v10Z" fill="#ddd6fe"/><path d="M3 16l4.5-5 3.5 3 5-7 5 4" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    fx: svgUri('<circle cx="12" cy="12" r="10" fill="#10b981"/><text x="12" y="16.6" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">$</text>'),
    metal: svgUri('<path d="M8.4 4.8h7.2l1.7 5.4H6.7Z" fill="#fbbf24"/><path d="M3.9 12.6h7.2l1.7 5.4H2.2Z" fill="#f59e0b"/><path d="M13.2 12.6h7.2l1.7 5.4h-10.6Z" fill="#fcd34d"/>'),
    gift: svgUri('<rect x="2.5" y="5.5" width="19" height="13.5" rx="2.6" fill="#14b8a6"/><rect x="2.5" y="9.2" width="19" height="2.8" fill="#0f766e"/><circle cx="17" cy="15.6" r="1.7" fill="#99f6e4"/>'),
    estate: svgUri('<rect x="3" y="9.5" width="7.6" height="11.5" rx="1" fill="#93c5fd"/><rect x="12.6" y="3.5" width="8.4" height="17.5" rx="1" fill="#2563eb"/><rect x="14.6" y="6.5" width="1.7" height="1.7" fill="#bfdbfe"/><rect x="17.6" y="6.5" width="1.7" height="1.7" fill="#bfdbfe"/><rect x="14.6" y="10" width="1.7" height="1.7" fill="#bfdbfe"/><rect x="17.6" y="10" width="1.7" height="1.7" fill="#bfdbfe"/><rect x="14.6" y="13.5" width="1.7" height="1.7" fill="#bfdbfe"/><rect x="17.6" y="13.5" width="1.7" height="1.7" fill="#bfdbfe"/><rect x="5" y="12" width="1.6" height="1.6" fill="#dbeafe"/><rect x="7.8" y="12" width="1.6" height="1.6" fill="#dbeafe"/>'),
    lotto: svgUri('<g transform="rotate(45 12 12)"><rect x="4.2" y="4.2" width="7" height="7" rx="3.3" fill="#22c55e"/><rect x="12.8" y="4.2" width="7" height="7" rx="3.3" fill="#4ade80"/><rect x="4.2" y="12.8" width="7" height="7" rx="3.3" fill="#4ade80"/><rect x="12.8" y="12.8" width="7" height="7" rx="3.3" fill="#22c55e"/></g>'),
    oil: svgUri('<path d="M12 2.6S5.6 9.9 5.6 14.4a6.4 6.4 0 0 0 12.8 0C18.4 9.9 12 2.6 12 2.6Z" fill="#f97316"/><path d="M8.9 14.6a3.1 3.1 0 0 0 3.1 3.1" fill="none" stroke="#fed7aa" stroke-width="1.7" stroke-linecap="round"/>'),
    macro: svgUri('<path d="M3.2 19a8.8 8.8 0 0 1 17.6 0" fill="none" stroke="#bae6fd" stroke-width="3.2" stroke-linecap="round"/><path d="M3.2 19a8.8 8.8 0 0 1 12.3-8.08" fill="none" stroke="#0284c7" stroke-width="3.2" stroke-linecap="round"/><path d="M12 19l4.7-5.5" stroke="#075985" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19" r="2.1" fill="#075985"/>'),
    hotdeal: svgUri('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z" fill="#f97316"/><path d="M12 20.6a3.4 3.4 0 0 0 3.4-3.4c0-1-.5-1.9-1.2-2.6-.8.9-2.2 1.4-2.2 2.8a2.2 2.2 0 0 1-2.2-2.2c-.7.7-1.2 1.5-1.2 2A3.4 3.4 0 0 0 12 20.6Z" fill="#fde68a"/>'),
  };
  const iconTile = (key, bg, size) =>
    `<span class="hicon${size === 'lg' ? ' hicon-lg' : ''}" style="background:${bg}"><span class="hicon-img" style="background-image:url('${ICONS[key]}')"></span></span>`;

  /**
   * 원본 JSON 묶음 → 홈 데이터. build-runtime-data(→ home.json)와
   * build-static(프리렌더) 이 같은 함수를 써서 어긋남을 원천 차단합니다.
   */
  function composeHome(src) {
    const { markets, rates, dept, manual, realestate, lotto } = src;
    const byId = new Map((markets?.items || []).map((i) => [i.id, i]));
    const pick = (id) => {
      const it = byId.get(id);
      if (!it) return null;
      const { name, group, unit, price, date, change, changePct, spark, volume } = it;
      return {
        id,
        name,
        group,
        unit,
        price,
        date,
        change,
        changePct,
        volume: Number.isFinite(volume) ? volume : null,
        spark: (spark || []).slice(-40),
      };
    };
    const homeMarkets = ['kospi', 'kosdaq', 'btc', 'kimchi', 'usdkrw', 'gold_don', 'wti', 'ust10']
      .map(pick)
      .filter(Boolean);

    const base = (rates?.items || []).find((i) => i.id === 'base_rate') || null;
    const rate = base
      ? { price: base.price, change: base.change ?? null, spark: (base.spark || []).slice(-24) }
      : null;

    // 상품권 — 실데이터가 있는 항목만 (백화점 3종 최고 매입가 + 수동 상품권 중 rate 입력분)
    const CHIPS = {
      신세계: { chip: '신세계', color: '#c8102e', href: '/giftcard/shinsegae' },
      롯데: { chip: '롯데', color: '#da291c', href: '/giftcard/lotte' },
      현대: { chip: '현대', color: '#00805a', href: '/giftcard/hyundai' },
    };
    const gifts = [];
    for (const card of ['신세계', '롯데', '현대']) {
      const best = (dept?.items || [])
        .filter((i) => i.card === card && Number(i.face) === 100000 && Number.isFinite(i.buy))
        .sort((a, b) => b.buy - a.buy)[0];
      if (best) gifts.push({ ...CHIPS[card], name: `${card}상품권 10만원권`, value: best.buy });
    }
    for (const m of manual?.items || []) {
      if (typeof m.rate !== 'number') continue;
      if (!['culture', 'happymoney'].includes(m.id)) continue;
      gifts.push({
        chip: m.id === 'culture' ? '컬쳐랜드' : '해피머니',
        color: m.id === 'culture' ? '#2d3f8f' : '#b45309',
        href: '/giftcard',
        name: `${m.name} ${m.face >= 10000 ? `${m.face / 10000}만원권` : ''}`.trim(),
        value: Math.round((m.face * m.rate) / 100),
      });
    }

    // 서울 아파트 ㎡당 (전월, 건수 가중평균 — realestate 페이지와 같은 방식)
    let seoul = null;
    if (realestate?.months?.length) {
      const ym = realestate.months.at(-2) || realestate.months.at(-1);
      let n = 0;
      let w = 0;
      for (const e of Object.values(realestate.sgg || {})) {
        if (e.sido !== '서울') continue;
        const cur = e.m?.[ym];
        if (cur?.pm2 && cur.n) {
          n += cur.n;
          w += cur.pm2 * cur.n;
        }
      }
      if (n) seoul = { pm2: Math.round(w / n), n, ym };
    }

    const rounds = (lotto?.rounds || []).filter((r) => Number.isInteger(r.round));
    const latest = rounds.length ? rounds.reduce((a, b) => (a.round > b.round ? a : b)) : null;
    const bestGift = gifts.length
      ? gifts.reduce((a, b) => (a.value >= b.value ? a : b))
      : null;

    return {
      updatedAt: markets?.updatedAt || null,
      markets: homeMarkets,
      // 요약 필드 — 표시 항목 중 최고 매입가 (구 스키마의 shop/method/buyRate 와는 다름)
      giftcard: bestGift ? { shop: bestGift.chip, buy: bestGift.value } : null,
      lotto: latest
        ? {
            round: latest.round,
            date: latest.date,
            numbers: latest.numbers,
            bonus: latest.bonus,
            sales: latest.sales,
            firstWinners: latest.firstWinners,
            firstPrize: latest.firstPrize ?? null,
          }
        : null,
      rate,
      gifts,
      seoul,
    };
  }

  const by = (home, id) => (home.markets || []).find((m) => m.id === id) || null;
  const deltaEl = (pct) => `<span class="hcard-d ${dirOf(pct)}">${deltaText(pct)}</span>`;
  const flatEl = (text) => `<span class="hcard-d flat">${esc(text)}</span>`;

  /** 1) 카테고리 요약 카드 8종 */
  function catCards(home) {
    const btc = by(home, 'btc');
    const kospi = by(home, 'kospi');
    const kosdaq = by(home, 'kosdaq');
    const usd = by(home, 'usdkrw');
    const gold = by(home, 'gold_don');
    const cards = [];
    const card = (href, icon, bg, k, n, v, d, i) =>
      cards.push(`<a class="hcard" href="${href}" style="--i:${i}">
  <span class="hcard-top">${iconTile(icon, bg)}<span class="hcard-k">${k}</span></span>
  <span class="hcard-n">${esc(n)}</span>
  <span class="hcard-v">${v}</span>
  ${d}
</a>`);
    if (btc) card('/coin', 'coin', '#fdf1d8', '코인', 'BTC/KRW', `${fmt0(btc.price)}원`, deltaEl(btc.changePct), 0);
    if (kospi) card('/stock', 'stock', '#dbeafe', '주식', '코스피', fmt2(kospi.price), deltaEl(kospi.changePct), 1);
    if (kosdaq) card('/kosdaq', 'kosdaq', '#ede9fe', '코스닥', '코스닥 지수', fmt2(kosdaq.price), deltaEl(kosdaq.changePct), 2);
    if (usd) card('/fx', 'fx', '#d1fae5', '환율', 'USD/KRW', `${fmt0(usd.price)}원`, deltaEl(usd.changePct), 3);
    if (gold) card('/metal', 'metal', '#fef9c3', '금·은', '금 1돈 (국내)', `${fmt0(gold.price)}원`, deltaEl(gold.changePct), 4);
    if (home.gifts?.length)
      card('/giftcard', 'gift', '#ccfbf1', '상품권', `${home.gifts[0].chip} 10만원권`, `${fmt0(home.gifts[0].value)}원`, flatEl('최고 매입가'), 5);
    if (home.seoul)
      card('/realestate', 'estate', '#dbeafe', '부동산', '서울 아파트 ㎡당', `${fmt0(home.seoul.pm2)}만원`, flatEl('전월 기준'), 6);
    if (home.lotto?.firstPrize)
      card('/lotto', 'lotto', '#dcfce7', '로또', `1등 당첨금 · 제${home.lotto.round}회`, `${(home.lotto.firstPrize / 1e8).toFixed(1)}억원`, flatEl(`추첨 ${String(home.lotto.date || '').slice(5)}`), 7);
    return cards.join('\n');
  }

  /** 2) 주요 지표 스파크 카드 8종 */
  function kpiCards(home) {
    const items = [];
    const add = (href, k, v, dHtml, cap, spark, dir, i) => {
      const s = areaSpark(spark);
      const svg = s
        ? `<svg viewBox="0 0 220 56" preserveAspectRatio="none" class="kpi-spark ${dir}" aria-hidden="true"><path d="${s.fill}" fill="currentColor" opacity="0.12"></path><path d="${s.line}" fill="none" stroke="currentColor" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"></path></svg>`
        : '<span class="kpi-spark kpi-spark-empty" aria-hidden="true"></span>';
      items.push(`<a class="hcard kpi" href="${href}" style="--i:${i}">
  <span class="kpi-k">${esc(k)}</span>
  <span class="hcard-v">${v}</span>
  ${dHtml}
  ${svg}
  <span class="kpi-cap">${esc(cap)}</span>
</a>`);
    };
    const m = (id) => by(home, id);
    const btc = m('btc');
    const usd = m('usdkrw');
    const kospi = m('kospi');
    const kosdaq = m('kosdaq');
    const gold = m('gold_don');
    const wti = m('wti');
    const kim = m('kimchi');
    if (btc) add('/coin', 'BTC/KRW', `${fmt0(btc.price)}원`, deltaEl(btc.changePct), '최근 40일 (일봉)', btc.spark, dirOf(btc.changePct), 0);
    if (usd) add('/fx', 'USD/KRW', `${fmt0(usd.price)}원`, deltaEl(usd.changePct), '최근 40거래일', usd.spark, dirOf(usd.changePct), 1);
    if (kospi) add('/stock', 'KOSPI', fmt2(kospi.price), deltaEl(kospi.changePct), '최근 40거래일', kospi.spark, dirOf(kospi.changePct), 2);
    if (kosdaq) add('/kosdaq', 'KOSDAQ', fmt2(kosdaq.price), deltaEl(kosdaq.changePct), '최근 40거래일', kosdaq.spark, dirOf(kosdaq.changePct), 3);
    if (gold) add('/metal', '금 1돈 (국내)', `${fmt0(gold.price)}원`, deltaEl(gold.changePct), '최근 40일 (일별)', gold.spark, dirOf(gold.changePct), 4);
    if (wti) add('/energy', 'WTI 유가', `$${fmt2(wti.price)}`, deltaEl(wti.changePct), '최근 40거래일', wti.spark, dirOf(wti.changePct), 5);
    if (home.rate)
      add(
        '/macro',
        '한국 기준금리',
        `${fmt2(home.rate.price)}%`,
        Number(home.rate.change)
          ? `<span class="hcard-d ${home.rate.change > 0 ? 'up' : 'down'}">${home.rate.change > 0 ? '▲' : '▼'} ${fmt2(Math.abs(home.rate.change))}%p</span>`
          : flatEl('동결'),
        '월별 · 최근 24개월',
        home.rate.spark,
        home.rate.change > 0 ? 'up' : home.rate.change < 0 ? 'down' : 'flat',
        6
      );
    if (kim)
      add(
        '/macro',
        '김치 프리미엄',
        `${kim.price > 0 ? '+' : ''}${fmt2(kim.price)}%`,
        flatEl('실시간'),
        '업비트 · 코인베이스 대비',
        kim.spark,
        kim.price > 0 ? 'up' : 'down',
        7
      );
    return items.join('\n');
  }

  /** 3) 비트코인 요약 블록 (A단계: 스냅샷 추이 정적 차트 + 시장 요약) */
  function btcBlock(home) {
    const btc = by(home, 'btc');
    if (!btc) return '<p class="empty">데이터를 불러오지 못했습니다.</p>';
    const kim = by(home, 'kimchi');
    const dir = dirOf(btc.changePct);
    const changeAbs = Number.isFinite(btc.change) && btc.change !== 0
      ? ` (${btc.change > 0 ? '+' : '-'}${fmt0(Math.abs(btc.change))}원)`
      : '';

    // 40일 일봉 시계열 → 900×250 (좌측 라벨 거터 84px 포함)
    const vals = (btc.spark || []).map(Number).filter(Number.isFinite);
    let chart = '';
    if (vals.length >= 2) {
      const mn = Math.min(...vals);
      const mx = Math.max(...vals);
      const pad = (mx - mn || mn * 0.01) * 0.06;
      const lo = mn - pad;
      const hi = mx + pad;
      const X = (i) => 84 + (i / (vals.length - 1)) * (900 - 84 - 6);
      const Y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (250 - 16);
      const linePts = vals.map((v, i) => `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('L');
      const grid = [0, 1, 2, 3]
        .map((k) => {
          const v = hi - ((hi - lo) * k) / 3;
          const y = Y(v).toFixed(1);
          return `<line x1="84" x2="894" y1="${y}" y2="${y}" class="btc-grid"></line><text x="76" y="${(Number(y) + 4).toFixed(1)}" class="btc-ylabel" text-anchor="end">${fmt0(v)}</text>`;
        })
        .join('');
      chart = `<svg viewBox="0 0 900 250" preserveAspectRatio="none" class="btc-chart" aria-hidden="true">
  <defs><linearGradient id="gBtcHome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.26"></stop><stop offset="1" stop-color="#3b82f6" stop-opacity="0"></stop></linearGradient></defs>
  ${grid}
  <path d="M${linePts}L894 250L84 250Z" fill="url(#gBtcHome)"></path>
  <path d="M${linePts}" fill="none" stroke="#2563eb" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"></path>
</svg>`;
    }

    const rows = [];
    rows.push(
      `<div class="btc-row"><span>전일 대비</span><b class="${dir}">${deltaText(btc.changePct)}${changeAbs}</b></div>`
    );
    if (Number.isFinite(btc.volume))
      rows.push(`<div class="btc-row"><span>24H 거래대금</span><b>${compactWon(btc.volume)}</b></div>`);
    if (kim)
      rows.push(
        `<div class="btc-row"><span>김치 프리미엄</span><b class="${kim.price > 0 ? 'up' : 'down'}">${kim.price > 0 ? '+' : ''}${fmt2(kim.price)}%</b></div>`
      );

    return `<div class="btc-main">
  <div class="btc-head"><h3>비트코인</h3><span class="btc-code">BTC/KRW</span></div>
  <div class="btc-price"><span class="btc-now">${fmt0(btc.price)}원</span><span class="hcard-d ${dir}">${deltaText(btc.changePct)}${changeAbs}</span></div>
  ${chart}
  <p class="kpi-cap">최근 40일 일봉 추이 · 상세 차트는 코인 페이지에서</p>
</div>
<aside class="btc-side">
  <h4>시장 요약</h4>
  ${rows.join('\n  ')}
  <a class="btc-more" href="/coin">코인 시세 더보기 →</a>
</aside>`;
  }

  /** 4) 상품권 패널 행 (실데이터 있는 항목만) */
  function giftRows(home) {
    return (home.gifts || [])
      .map(
        (g) => `<a class="gift-row" href="${g.href}">
  <span class="gift-chip" style="background:${g.color}">${esc(g.chip)}</span>
  <span class="gift-name">${esc(g.name)}</span>
  <span class="gift-val">${fmt0(g.value)}원</span>
</a>`
      )
      .join('\n');
  }

  /** 5) 바로 보기 11종 (정적) */
  function quickCards() {
    const list = [
      ['/coin', 'coin', '#fdf1d8', '코인', '실시간 코인 시세와 김치 프리미엄'],
      ['/stock', 'stock', '#dbeafe', '주식', '코스피 지수와 주요 종목 시세'],
      ['/kosdaq', 'kosdaq', '#ede9fe', '코스닥', '코스닥 지수와 시장 동향'],
      ['/fx', 'fx', '#d1fae5', '환율', '주요국 환율과 외환 시장 동향'],
      ['/metal', 'metal', '#fef9c3', '금·은', '국내외 금·은 시세와 귀금속 가격'],
      ['/energy', 'oil', '#ffedd5', '유가·원자재', '국제 유가와 전국 주유소 기름값'],
      ['/macro', 'macro', '#e0f2fe', '지표', '기준금리·국고채 등 국내 금리 지표'],
      ['/giftcard', 'gift', '#ccfbf1', '상품권', '백화점·문화상품권 매입/판매 시세'],
      ['/hotdeal', 'hotdeal', '#fee2e2', '핫딜', '핫딜 커뮤니티 실시간 특가 모음'],
      ['/realestate', 'estate', '#dbeafe', '부동산', '전국 아파트 실거래가 지도와 통계'],
      ['/lotto', 'lotto', '#dcfce7', '로또', '로또 당첨 결과와 번호 추첨'],
    ];
    return list
      .map(
        ([href, icon, bg, t, d]) => `<a class="quick-card" href="${href}">
  ${iconTile(icon, bg, 'lg')}
  <span class="quick-body"><span class="quick-t">${t}</span><span class="quick-d">${d}</span></span>
  <svg class="quick-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
</a>`
      )
      .join('\n');
  }

  /** 6) 히어로 — 라이브 배지 텍스트 · 미니 통계 · BTC 알약 */
  const heroLive = (home) =>
    `매시간 자동 업데이트${home.updatedAt ? ` · 마지막 갱신 ${stampHM(home.updatedAt)}` : ''}`;

  function heroStats(home) {
    const mini = (m, label, fmt) => {
      if (!m) return '';
      const d = dirOf(m.changePct);
      const arrow = d === 'up' ? '▲' : d === 'down' ? '▼' : '';
      return `<div class="hero-mini"><div class="hero-mini-k">${label}</div><div class="hero-mini-v">${fmt(m.price)} <span class="${d}">${arrow}</span></div></div>`;
    };
    return [
      mini(by(home, 'kospi'), 'KOSPI', fmt2),
      mini(by(home, 'usdkrw'), 'USD/KRW', (v) => fmt0(v)),
      mini(by(home, 'gold_don'), '금 1돈', (v) => fmt0(v)),
    ].join('\n');
  }

  function heroPill(home) {
    const btc = by(home, 'btc');
    if (!btc) return '';
    return `<span class="hero-pill-v">${fmt0(btc.price)}원</span><span class="hero-pill-d ${dirOf(btc.changePct)}">${deltaText(btc.changePct)}</span>`;
  }

  const api = {
    composeHome,
    catCards,
    kpiCards,
    btcBlock,
    giftRows,
    quickCards,
    heroLive,
    heroStats,
    heroPill,
    stampHM,
  };
  root.MODOO_HOME_RENDER = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : this);
