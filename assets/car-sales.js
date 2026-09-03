'use strict';

(function initCarSalesPage() {
  const VIEW = document.body.dataset.carView || 'all';
  const VIEW_META = {
    all: { key: 'total', label: '전체', color: '#2563eb' },
    domestic: { key: 'domestic', label: '국산차', color: '#2563eb' },
    imported: { key: 'imported', label: '수입차', color: '#f59e0b' },
  };
  const meta = VIEW_META[VIEW] || VIEW_META.all;
  const integer = new Intl.NumberFormat('ko-KR');
  const oneDecimal = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const monthLabel = (value, full = false) => {
    const [year, month] = String(value).split('-').map(Number);
    return full ? `${year}년 ${month}월` : `${month}월`;
  };
  const percentChange = (current, previous) => previous > 0 ? ((current - previous) / previous) * 100 : null;
  const direction = (value) => value == null || Math.abs(value) < 0.05 ? 'flat' : value > 0 ? 'up' : 'down';
  const signedPercent = (value) => value == null ? '비교 불가' : `${value > 0 ? '+' : ''}${oneDecimal.format(value)}%`;
  const compact = (value) => value >= 1000000
    ? `${oneDecimal.format(value / 10000)}만 대`
    : `${integer.format(Math.round(value))}대`;

  function validate(data) {
    if (!data || !Array.isArray(data.months) || data.months.length < 13) throw new Error('월별 자동차 판매량 데이터가 부족합니다.');
    const seen = new Set();
    data.months.forEach((row, index) => {
      if (!/^\d{4}-\d{2}$/.test(row.month) || seen.has(row.month)) throw new Error('월 표기가 중복되었거나 올바르지 않습니다.');
      seen.add(row.month);
      if (index && data.months[index - 1].month >= row.month) throw new Error('월별 데이터가 시간순으로 정렬되지 않았습니다.');
      for (const key of ['domestic', 'imported', 'total']) {
        if (!Number.isFinite(row[key]) || row[key] < 0) throw new Error(`${row.month} ${key} 값이 올바르지 않습니다.`);
      }
      if (row.total !== row.domestic + row.imported) throw new Error(`${row.month} 합계가 국산차와 수입차의 합과 다릅니다.`);
    });
    return data;
  }

  function renderKpis(rows) {
    const latest = rows.at(-1);
    const previous = rows.at(-2);
    const yearAgo = rows.find((row) => row.month === `${Number(latest.month.slice(0, 4)) - 1}${latest.month.slice(4)}`);
    const mom = percentChange(latest[meta.key], previous?.[meta.key]);
    const yoy = percentChange(latest[meta.key], yearAgo?.[meta.key]);
    const total24 = rows.reduce((sum, row) => sum + row[meta.key], 0);
    const average = total24 / rows.length;
    const cards = [
      ['최근 월 판매량', `${integer.format(latest[meta.key])}대`, monthLabel(latest.month, true), 'flat'],
      ['전월 대비', signedPercent(mom), `${monthLabel(previous.month, true)} 대비`, direction(mom)],
      ['전년 동월 대비', signedPercent(yoy), yearAgo ? `${monthLabel(yearAgo.month, true)} 대비` : '비교 자료 없음', direction(yoy)],
      [`최근 ${rows.length}개월 누계`, compact(total24), `월평균 ${integer.format(Math.round(average))}대`, 'flat'],
    ];
    document.querySelector('#car-kpis').innerHTML = cards.map(([label, value, note, cls], index) => `
      <article class="car-kpi" style="--i:${index}">
        <span class="car-kpi-label">${escapeHTML(label)}</span>
        <strong class="car-kpi-value ${cls}">${escapeHTML(value)}</strong>
        <span class="car-kpi-note">${escapeHTML(note)}</span>
      </article>`).join('');
  }

  function renderChart(rows) {
    const width = 960;
    const height = 330;
    const plot = { x: 58, y: 18, w: 880, h: 250 };
    const max = Math.max(...rows.map((row) => row[meta.key]));
    const ceiling = Math.ceil(max / 20000) * 20000;
    const step = plot.w / rows.length;
    const barWidth = Math.max(8, Math.min(25, step * 0.7));
    const y = (value) => plot.y + plot.h - (value / ceiling) * plot.h;
    const grid = Array.from({ length: 5 }, (_, i) => {
      const value = ceiling * (4 - i) / 4;
      const lineY = plot.y + plot.h * i / 4;
      return `<g class="car-gridline"><line x1="${plot.x}" y1="${lineY}" x2="${plot.x + plot.w}" y2="${lineY}"/><text x="${plot.x - 9}" y="${lineY + 4}">${Math.round(value / 1000)}천</text></g>`;
    }).join('');
    const bars = rows.map((row, index) => {
      const x = plot.x + step * index + (step - barWidth) / 2;
      const showMonth = index === 0 || index === rows.length - 1 || row.month.endsWith('-01') || index % 3 === 0;
      const label = showMonth ? `<text class="car-axis-label" x="${x + barWidth / 2}" y="${plot.y + plot.h + 25}">${row.month.endsWith('-01') ? row.month.slice(0, 4) : Number(row.month.slice(5)) + '월'}</text>` : '';
      if (VIEW === 'all') {
        const domesticHeight = (row.domestic / ceiling) * plot.h;
        const importedHeight = (row.imported / ceiling) * plot.h;
        const base = plot.y + plot.h;
        return `<g class="car-bar-group"><title>${monthLabel(row.month, true)} 전체 ${integer.format(row.total)}대 · 국산 ${integer.format(row.domestic)}대 · 수입 ${integer.format(row.imported)}대</title><rect class="car-bar-domestic" x="${x}" y="${base - domesticHeight}" width="${barWidth}" height="${domesticHeight}" rx="3"/><rect class="car-bar-imported" x="${x}" y="${base - domesticHeight - importedHeight}" width="${barWidth}" height="${importedHeight}" rx="3"/>${label}</g>`;
      }
      const barHeight = (row[meta.key] / ceiling) * plot.h;
      return `<g class="car-bar-group"><title>${monthLabel(row.month, true)} ${meta.label} ${integer.format(row[meta.key])}대</title><rect class="car-bar-${VIEW}" x="${x}" y="${y(row[meta.key])}" width="${barWidth}" height="${barHeight}" rx="3"/>${label}</g>`;
    }).join('');
    const legend = VIEW === 'all'
      ? '<span><i class="domestic"></i>국산차</span><span><i class="imported"></i>수입차</span>'
      : `<span><i class="${VIEW}"></i>${meta.label}</span>`;
    document.querySelector('#car-chart').innerHTML = `
      <div class="car-legend" aria-hidden="true">${legend}</div>
      <div class="car-chart-scroll"><svg class="car-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="car-chart-title car-chart-desc"><title id="car-chart-title">${escapeHTML(meta.label)} 월별 판매량 차트</title><desc id="car-chart-desc">${monthLabel(rows[0].month, true)}부터 ${monthLabel(rows.at(-1).month, true)}까지 월별 판매 대수를 막대로 비교합니다.</desc>${grid}${bars}</svg></div>`;
  }

  function renderAnalysis(rows) {
    const latest = rows.at(-1);
    const previous = rows.at(-2);
    const values = rows.map((row) => row[meta.key]);
    const peak = rows[values.indexOf(Math.max(...values))];
    const low = rows[values.indexOf(Math.min(...values))];
    const mom = percentChange(latest[meta.key], previous[meta.key]);
    let composition = '';
    if (VIEW === 'all') {
      const domesticShare = 100 - latest.importShare;
      composition = `<h3>${monthLabel(latest.month, true)} 구성</h3><div class="car-share-head"><span>국산차 ${oneDecimal.format(domesticShare)}%</span><span>수입차 ${oneDecimal.format(latest.importShare)}%</span></div><div class="car-share-track" role="img" aria-label="국산차 ${oneDecimal.format(domesticShare)}퍼센트, 수입차 ${oneDecimal.format(latest.importShare)}퍼센트"><span style="width:${domesticShare}%"></span></div><p>국산차 ${integer.format(latest.domestic)}대와 수입차 ${integer.format(latest.imported)}대를 합친 참고 합계입니다.</p>`;
    } else {
      const share = VIEW === 'domestic' ? 100 - latest.importShare : latest.importShare;
      composition = `<h3>${monthLabel(latest.month, true)} 시장 내 비중</h3><strong class="car-share-number">${oneDecimal.format(share)}%</strong><p>${VIEW === 'domestic' ? '전체 참고 합계에서 국산차가 차지하는 비중' : '전체 참고 합계에서 수입차가 차지하는 비중'}입니다.</p>`;
    }
    document.querySelector('#car-composition').innerHTML = composition;
    document.querySelector('#car-insight').innerHTML = `<h3>24개월 흐름 요약</h3><ul class="car-insight-list"><li>최근 월은 <strong>${integer.format(latest[meta.key])}대</strong>로 전월보다 <strong class="${direction(mom)}">${signedPercent(mom)}</strong> 변했습니다.</li><li>가장 많았던 달은 <strong>${monthLabel(peak.month, true)} ${integer.format(peak[meta.key])}대</strong>입니다.</li><li>가장 적었던 달은 <strong>${monthLabel(low.month, true)} ${integer.format(low[meta.key])}대</strong>입니다.</li></ul>`;
  }

  function renderTable(rows) {
    const body = document.querySelector('#car-table-body');
    body.innerHTML = [...rows].reverse().map((row, index) => {
      const prior = rows.find((item) => item.month === `${Number(row.month.slice(0, 4)) - 1}${row.month.slice(4)}`);
      const change = percentChange(row[meta.key], prior?.[meta.key]);
      return `<tr${index === 0 ? ' class="is-latest"' : ''}><th scope="row">${escapeHTML(monthLabel(row.month, true))}${index === 0 ? '<span class="car-latest-tag">최신</span>' : ''}</th><td>${integer.format(row.domestic)}</td><td>${integer.format(row.imported)}</td><td><strong>${integer.format(row.total)}</strong></td><td>${oneDecimal.format(row.importShare)}%</td><td class="${direction(change)}">${signedPercent(change)}</td></tr>`;
    }).join('');
  }

  function renderSources(data) {
    document.querySelector('#car-basis-notice').textContent = data.basis.notice;
    document.querySelector('#car-sources').innerHTML = data.sources.map((source) => `<li><div><a href="${safeHttpUrl(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.name)}</a><span>${source.state === 'connection-pending' ? '자동수집 연결 준비 중' : '현재 공개자료 기준'}</span></div><time datetime="${escapeHTML(source.checkedAt)}">확인 ${new Date(source.checkedAt).toLocaleDateString('ko-KR')}</time></li>`).join('');
    const definitions = document.querySelector('#car-definitions');
    definitions.innerHTML = `<dt>국산차</dt><dd>${escapeHTML(data.basis.domestic)}</dd><dt>수입차</dt><dd>${escapeHTML(data.basis.imported)}</dd><dt>전체</dt><dd>${escapeHTML(data.basis.total)}</dd>`;
  }

  function validateRankings(data) {
    if (!data || !Array.isArray(data.rankings) || !data.rankings.length) throw new Error('브랜드·차종 순위 데이터가 없습니다.');
    data.rankings.forEach((row) => {
      if (!/^\d{4}-\d{2}$/.test(row.month)) throw new Error('순위 기준월이 올바르지 않습니다.');
      for (const market of ['domestic', 'imported']) {
        const group = row[market];
        if (!group || !Number.isFinite(group.total) || group.brands?.length < 5 || group.models?.length < 10) {
          throw new Error(`${row.month} ${market} 순위가 부족합니다.`);
        }
      }
    });
    return data;
  }

  function brandRanking(items) {
    const max = Math.max(...items.map((item) => item.sales));
    return `<ol class="car-brand-ranks">${items.map((item) => `<li><span class="car-rank-number">${item.rank}</span><div><div class="car-rank-line"><strong>${escapeHTML(item.name)}</strong><span>${integer.format(item.sales)}대 · ${oneDecimal.format(item.share)}%</span></div><div class="car-rank-bar"><span style="width:${Math.max(4, item.sales / max * 100)}%"></span></div></div></li>`).join('')}</ol>`;
  }

  function modelRanking(items) {
    return `<div class="table-scroll"><table class="car-model-table"><thead><tr><th scope="col">순위</th><th scope="col">모델</th><th scope="col">판매량</th><th scope="col">전월 대비</th></tr></thead><tbody>${items.map((item) => {
      const change = Number(item.change);
      const changeClass = direction(change);
      const changeLabel = Number.isFinite(change) ? `${change > 0 ? '+' : ''}${integer.format(change)}대` : '—';
      const imageUrl = item.image ? safeHttpUrl(item.image) : '/assets/car-placeholder.svg';
      const text = `<span class="car-model-copy"><span>${escapeHTML(item.name)}</span><small>${escapeHTML(item.brand)}</small></span>`;
      const modelInfo = item.detailUrl
        ? `<a class="car-model-main" href="${safeHttpUrl(item.detailUrl)}" target="_blank" rel="noopener noreferrer nofollow"><img src="${imageUrl}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">${text}</a>`
        : `<span class="car-model-main"><img src="${imageUrl}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">${text}</span>`;
      return `<tr><td><strong>${item.rank}</strong></td><th scope="row">${modelInfo}</th><td>${integer.format(item.sales)}대</td><td class="${changeClass}">${changeLabel}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function rankingMarketCard(market, data) {
    const label = market === 'domestic' ? '국산차' : '수입차';
    return `<article class="car-ranking-market car-ranking-${market}"><header><div><span>${market === 'domestic' ? 'DOMESTIC' : 'IMPORTED'}</span><h3>${label} 판매 순위</h3></div><p>분류 합계 <strong>${integer.format(data.total)}대</strong></p></header><section><h4>브랜드 TOP 5</h4>${brandRanking(data.brands)}</section><section><h4>차종 TOP 10</h4>${modelRanking(data.models)}</section></article>`;
  }

  function renderRankingMonth(data, month) {
    const row = data.rankings.find((item) => item.month === month) || data.rankings.at(-1);
    const markets = VIEW === 'all' ? ['domestic', 'imported'] : [VIEW];
    const target = document.querySelector('#car-rankings');
    target.classList.toggle('is-single', markets.length === 1);
    target.innerHTML = markets.map((market) => rankingMarketCard(market, row[market])).join('');
    target.querySelectorAll('.car-model-main img').forEach((image) => image.addEventListener('error', () => {
      if (!image.src.endsWith('/assets/car-placeholder.svg')) image.src = '/assets/car-placeholder.svg';
    }, { once: true }));
  }

  function renderRankings(data) {
    const selector = document.querySelector('#car-ranking-month');
    selector.innerHTML = [...data.rankings].reverse().map((row) => `<option value="${row.month}">${monthLabel(row.month, true)}</option>`).join('');
    selector.value = data.latestMonth;
    document.querySelector('#car-ranking-basis').textContent = data.basisNotice;
    renderRankingMonth(data, selector.value);
    selector.addEventListener('change', () => renderRankingMonth(data, selector.value));
    document.querySelector('#car-ranking-loading').hidden = true;
    document.querySelector('#car-rankings').hidden = false;
    const sources = document.querySelector('#car-sources');
    sources.insertAdjacentHTML('beforeend', `<li><div><a href="${safeHttpUrl(data.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(data.source.name)}</a><span>KAMA·KAIDA 자료 재구성 · 브랜드/차종 순위</span></div><time datetime="${escapeHTML(data.updatedAt)}">확인 ${new Date(data.updatedAt).toLocaleDateString('ko-KR')}</time></li>`);
    setStatus(data.updatedAt);
  }

  function loadRankings() {
    fetchJSON('/data/car-rankings.json')
      .then(validateRankings)
      .then(renderRankings)
      .catch((error) => {
        console.error(error);
        const loading = document.querySelector('#car-ranking-loading');
        loading.classList.add('is-error');
        loading.textContent = `브랜드·차종 순위를 불러오지 못했습니다. (${error.message})`;
      });
  }

  function showError(error) {
    const target = document.querySelector('#car-error');
    target.hidden = false;
    target.textContent = `자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. (${error.message})`;
  }

  renderShell();
  fetchJSON('/data/car-sales.json')
    .then(validate)
    .then((data) => {
      const rows = data.months.slice(-Math.max(1, Number(data.displayMonths) || 24));
      setStatus(data.updatedAt);
      renderKpis(rows);
      renderChart(rows);
      renderAnalysis(rows);
      renderTable(rows);
      renderSources(data);
      document.querySelector('#car-content').hidden = false;
      document.querySelector('#car-loading').hidden = true;
      loadRankings();
    })
    .catch((error) => {
      console.error(error);
      document.querySelector('#car-loading').hidden = true;
      showError(error);
    });
})();
