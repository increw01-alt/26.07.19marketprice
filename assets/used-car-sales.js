'use strict';

(function initUsedCarSalesPage() {
  const VIEW = document.body.dataset.usedView || 'all';
  const VIEW_META = {
    all: { key: 'total', label: '전체 중고차', short: '전체', color: '#0f766e', estimated: false },
    domestic: { key: 'domestic', label: '국산 중고차', short: '국산차', color: '#2563eb', estimated: true },
    imported: { key: 'imported', label: '수입 중고차', short: '수입차', color: '#f59e0b', estimated: true },
  };
  const meta = VIEW_META[VIEW] || VIEW_META.all;
  const integer = new Intl.NumberFormat('ko-KR');
  const decimal = new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const monthLabel = (value, full = false) => {
    const [year, month] = String(value).split('-').map(Number);
    return full ? `${year}년 ${month}월` : `${month}월`;
  };
  const percentChange = (current, previous) => previous > 0 ? ((current - previous) / previous) * 100 : null;
  const direction = (value) => value == null || Math.abs(value) < 0.05 ? 'flat' : value > 0 ? 'up' : 'down';
  const signedPercent = (value) => value == null ? '비교 불가' : `${value > 0 ? '+' : ''}${decimal.format(value)}%`;
  const countLabel = (value, estimated = meta.estimated) => `${estimated ? '약 ' : ''}${integer.format(value)}건`;
  const compact = (value) => value >= 10000 ? `${decimal.format(value / 10000)}만 건` : `${integer.format(value)}건`;

  function validate(data) {
    if (!data || !Array.isArray(data.months) || data.months.length < 13) throw new Error('월별 중고차 거래량 데이터가 부족합니다.');
    if (!Array.isArray(data.rankings) || !data.rankings.length) throw new Error('중고차 모델 순위 데이터가 없습니다.');
    data.months.forEach((row, index) => {
      if (!/^\d{4}-\d{2}$/.test(row.month)) throw new Error('월 표기가 올바르지 않습니다.');
      for (const key of ['total', 'domestic', 'imported']) {
        if (!Number.isFinite(row[key]) || row[key] < 0) throw new Error(`${row.month} ${key} 값이 올바르지 않습니다.`);
      }
      if (row.total !== row.domestic + row.imported) throw new Error(`${row.month} 국산·수입 추정 합계가 전체와 다릅니다.`);
      if (index && data.months[index - 1].month >= row.month) throw new Error('월별 거래량이 시간순으로 정렬되지 않았습니다.');
    });
    data.rankings.forEach((row) => {
      if (!Array.isArray(row.domestic) || row.domestic.length < 10 || !Array.isArray(row.imported) || row.imported.length < 10) {
        throw new Error(`${row.month} 중고차 모델 순위가 부족합니다.`);
      }
    });
    return data;
  }

  function renderKpis(rows) {
    const latest = rows.at(-1);
    const previous = rows.at(-2);
    const yearAgo = rows.find((row) => row.month === `${Number(latest.month.slice(0, 4)) - 1}${latest.month.slice(4)}`);
    const mom = percentChange(latest[meta.key], previous?.[meta.key]);
    const yoy = percentChange(latest[meta.key], yearAgo?.[meta.key]);
    const total = rows.reduce((sum, row) => sum + row[meta.key], 0);
    const cards = [
      ['최근 월 거래량', countLabel(latest[meta.key]), monthLabel(latest.month, true), 'flat'],
      ['전월 대비', signedPercent(mom), `${monthLabel(previous.month, true)} 대비`, direction(mom)],
      ['전년 동월 대비', signedPercent(yoy), yearAgo ? `${monthLabel(yearAgo.month, true)} 대비` : '비교 자료 없음', direction(yoy)],
      [`최근 ${rows.length}개월 누계`, `${meta.estimated ? '약 ' : ''}${compact(total)}`, `월평균 ${meta.estimated ? '약 ' : ''}${integer.format(Math.round(total / rows.length))}건`, 'flat'],
    ];
    document.querySelector('#used-kpis').innerHTML = cards.map(([label, value, note, cls], index) => `
      <article class="car-kpi" style="--i:${index}"><span class="car-kpi-label">${escapeHTML(label)}</span><strong class="car-kpi-value ${cls}">${escapeHTML(value)}</strong><span class="car-kpi-note">${escapeHTML(note)}</span></article>`).join('');
  }

  function renderChart(rows) {
    const width = 960;
    const height = 350;
    const plot = { x: 68, y: 30, w: 844, h: 250 };
    const latest = rows.at(-1);
    const previous = rows.at(-2);
    const average = Math.round(rows.reduce((sum, row) => sum + row[meta.key], 0) / rows.length);
    const peak = rows.reduce((best, row) => row[meta.key] > best[meta.key] ? row : best, rows[0]);
    const mom = percentChange(latest[meta.key], previous[meta.key]);
    const share = latest[meta.key] / latest.total * 100;
    const importedShare = latest.imported / latest.total * 100;

    function niceScale(maximum) {
      const rough = maximum / 4;
      const magnitude = 10 ** Math.floor(Math.log10(rough));
      const normalized = rough / magnitude;
      const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
      const interval = multiplier * magnitude;
      return { interval, ceiling: interval * 4 };
    }

    const step = plot.w / rows.length;
    const barWidth = Math.max(14, Math.min(24, step * 0.62));

    function pointSeries(values, ceiling) {
      return values.map((value, index) => ({
        x: plot.x + step * (index + 0.5),
        y: plot.y + plot.h - (value / ceiling * plot.h),
        value,
      }));
    }

    function smoothPath(points) {
      return points.slice(1).reduce((path, point, index) => {
        const previousPoint = points[index];
        const middle = (previousPoint.x + point.x) / 2;
        return `${path} C ${middle.toFixed(1)} ${previousPoint.y.toFixed(1)}, ${middle.toFixed(1)} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      }, `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`);
    }

    const rolling = rows.map((row, index) => {
      const window = rows.slice(Math.max(0, index - 2), index + 1);
      return Math.round(window.reduce((sum, item) => sum + item[meta.key], 0) / window.length);
    });
    const maxValue = VIEW === 'all'
      ? Math.max(...rows.map((row) => row.total))
      : Math.max(...rows.map((row) => row[meta.key]), ...rolling);
    const scale = niceScale(maxValue * 1.06);
    const baseline = plot.y + plot.h;
    const centers = pointSeries(rows.map((row) => row[meta.key]), scale.ceiling);
    const gradientId = `used-bar-${VIEW}`;
    const grid = Array.from({ length: 5 }, (_, index) => {
      const value = scale.ceiling - scale.interval * index;
      const y = plot.y + plot.h * index / 4;
      return `<g class="used-chart-grid"><line x1="${plot.x}" y1="${y}" x2="${plot.x + plot.w}" y2="${y}"/><text x="${plot.x - 12}" y="${y + 4}">${value >= 10000 ? `${decimal.format(value / 10000)}만` : integer.format(value)}</text></g>`;
    }).join('');
    const axisLabels = rows.map((row, index) => {
      const show = index === 0 || index === rows.length - 1 || row.month.endsWith('-01') || index % 4 === 0;
      if (!show) return '';
      const x = centers[index].x;
      const label = row.month.endsWith('-01') ? `${row.month.slice(2, 4)}년 1월` : `${Number(row.month.slice(5))}월`;
      return `<text class="used-chart-axis" x="${x.toFixed(1)}" y="${baseline + 28}">${label}</text>`;
    }).join('');
    const bars = rows.map((row, index) => {
      const center = centers[index];
      const x = center.x - barWidth / 2;
      const detail = VIEW === 'all'
        ? `${monthLabel(row.month, true)} · 전체 ${integer.format(row.total)}건 · 국산 약 ${integer.format(row.domestic)}건 · 수입 약 ${integer.format(row.imported)}건`
        : `${monthLabel(row.month, true)} · ${meta.short} 약 ${integer.format(row[meta.key])}건`;
      if (VIEW === 'all') {
        const domesticHeight = row.domestic / scale.ceiling * plot.h;
        const importedHeight = row.imported / scale.ceiling * plot.h;
        return `<g class="used-chart-bar"><title>${escapeHTML(detail)}</title><rect class="used-chart-bar-domestic" x="${x.toFixed(1)}" y="${(baseline - domesticHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${domesticHeight.toFixed(1)}"/><rect class="used-chart-bar-imported" x="${x.toFixed(1)}" y="${(baseline - domesticHeight - importedHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${importedHeight.toFixed(1)}" rx="3"/></g>`;
      }
      const barHeight = row[meta.key] / scale.ceiling * plot.h;
      return `<g class="used-chart-bar"><title>${escapeHTML(detail)}</title><rect class="used-chart-bar-primary" x="${x.toFixed(1)}" y="${(baseline - barHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" fill="url(#${gradientId})"/></g>`;
    }).join('');

    let averageLine = '';
    let legend = '';
    if (VIEW === 'all') {
      legend = '<span><i class="domestic"></i>국산 추정</span><span><i class="imported"></i>수입 추정</span>';
    } else {
      const rollingPath = smoothPath(pointSeries(rolling, scale.ceiling));
      averageLine = `<path class="used-chart-line is-average" d="${rollingPath}"/>`;
      legend = `<span><i class="${VIEW}"></i>${meta.short} 추정</span><span><i class="average"></i>3개월 이동평균</span>`;
    }

    const latestCenter = centers.at(-1);
    const latestTop = plot.y + plot.h - latest[meta.key] / scale.ceiling * plot.h;
    const calloutY = Math.max(plot.y + 7, latestTop - 44);
    const callout = `<g class="used-chart-callout"><rect x="${latestCenter.x - 112}" y="${calloutY}" width="112" height="32" rx="8"/><text x="${latestCenter.x - 56}" y="${calloutY + 20}">${meta.estimated ? '약 ' : ''}${integer.format(latest[meta.key])}건</text></g>`;
    const donutValue = VIEW === 'all' ? importedShare : share;
    const donutLabel = VIEW === 'all' ? '수입 비중' : `전체 내 ${meta.short} 비중`;
    const donutColor = VIEW === 'domestic' ? '#2563eb' : '#f59e0b';
    const chartNote = VIEW === 'all' ? '누적 막대의 전체 높이는 정확한 전체 건수이며, 국산·수입 구성은 공개 비중 기반 추정치입니다.' : '막대는 월별 추정치, 점선은 단기 흐름을 보여주는 3개월 이동평균입니다.';

    document.querySelector('#used-chart').innerHTML = `
      <div class="used-chart-dashboard">
        <div class="used-chart-summary">
          <div class="used-chart-current"><span>LATEST · ${escapeHTML(monthLabel(latest.month, true))}</span><strong>${countLabel(latest[meta.key])}</strong><small class="${direction(mom)}">전월 대비 ${signedPercent(mom)}</small></div>
          <dl class="used-chart-facts"><div><dt>24개월 월평균</dt><dd>${meta.estimated ? '약 ' : ''}${integer.format(average)}건</dd></div><div><dt>24개월 최고</dt><dd>${escapeHTML(monthLabel(peak.month))} · ${meta.estimated ? '약 ' : ''}${integer.format(peak[meta.key])}건</dd></div></dl>
          <div class="used-chart-donut" style="--donut-value:${donutValue};--donut-color:${donutColor}" role="img" aria-label="${escapeHTML(donutLabel)} ${decimal.format(donutValue)}퍼센트"><div><strong>${decimal.format(donutValue)}%</strong><span>${escapeHTML(donutLabel)}</span></div></div>
        </div>
        <div class="used-chart-plot-panel">
          <div class="used-chart-toolbar"><p>${escapeHTML(chartNote)}</p><div class="car-legend" aria-hidden="true">${legend}</div></div>
          <div class="car-chart-scroll"><svg class="car-chart-svg used-chart-svg" style="--series-color:${meta.color}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="used-chart-title used-chart-desc"><title id="used-chart-title">${escapeHTML(meta.label)} 월별 거래량 막대그래프</title><desc id="used-chart-desc">${monthLabel(rows[0].month, true)}부터 ${monthLabel(latest.month, true)}까지 월별 거래량을 막대로 비교합니다.</desc><defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${meta.color}"/><stop offset="100%" stop-color="${meta.color}" stop-opacity=".58"/></linearGradient></defs>${grid}<rect class="used-chart-latest-column" x="${(latestCenter.x - step / 2).toFixed(1)}" y="${plot.y}" width="${step.toFixed(1)}" height="${plot.h}" rx="5"/>${bars}${averageLine}${callout}${axisLabels}<text class="used-chart-unit" x="${plot.x}" y="${height - 7}">단위: 이전등록 건</text></svg></div>
        </div>
      </div>`;
  }

  function renderAnalysis(data, rows) {
    const latest = rows.at(-1);
    if (VIEW === 'all') {
      const total = data.latestDealTypes.reduce((sum, item) => sum + item.count, 0) || latest.total;
      const colors = ['#2563eb', '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#94a3b8'];
      document.querySelector('#used-composition').innerHTML = `<h3>${monthLabel(latest.month, true)} 거래유형 구성</h3><div class="used-type-track" role="img" aria-label="거래유형별 이전등록 비중">${data.latestDealTypes.map((item, index) => `<span style="width:${item.count / total * 100}%;background:${colors[index]}"></span>`).join('')}</div><ul class="used-type-list">${data.latestDealTypes.map((item, index) => `<li><i style="background:${colors[index]}"></i><span>${escapeHTML(item.name)}</span><strong>${integer.format(item.count)}건</strong></li>`).join('')}</ul>`;
    } else {
      const share = latest[meta.key] / latest.total * 100;
      document.querySelector('#used-composition').innerHTML = `<h3>${monthLabel(latest.month, true)} 전체 내 추정 비중</h3><strong class="car-share-number">${decimal.format(share)}%</strong><p>공개 모델 TOP10의 거래량·비중을 역산한 ${meta.short} 추정 비중입니다.</p>`;
    }
    const values = rows.map((row) => row[meta.key]);
    const peak = rows[values.indexOf(Math.max(...values))];
    const low = rows[values.indexOf(Math.min(...values))];
    const mom = percentChange(latest[meta.key], rows.at(-2)[meta.key]);
    document.querySelector('#used-insight').innerHTML = `<h3>24개월 흐름 요약</h3><ul class="car-insight-list"><li>최근 월은 <strong>${countLabel(latest[meta.key])}</strong>으로 전월보다 <strong class="${direction(mom)}">${signedPercent(mom)}</strong> 변했습니다.</li><li>가장 많았던 달은 <strong>${monthLabel(peak.month, true)} ${countLabel(peak[meta.key])}</strong>입니다.</li><li>가장 적었던 달은 <strong>${monthLabel(low.month, true)} ${countLabel(low[meta.key])}</strong>입니다.</li></ul><p class="used-definition-note">${VIEW === 'all' ? '전체는 공개된 이전등록 정확한 건수입니다.' : '국산·수입 합계는 공개 비중을 활용한 추정치입니다.'}</p>`;
  }

  function renderTable(rows) {
    document.querySelector('#used-table-body').innerHTML = [...rows].reverse().map((row, index) => {
      const prior = rows.find((item) => item.month === `${Number(row.month.slice(0, 4)) - 1}${row.month.slice(4)}`);
      const change = percentChange(row[meta.key], prior?.[meta.key]);
      return `<tr${index === 0 ? ' class="is-latest"' : ''}><th scope="row">${monthLabel(row.month, true)}${index === 0 ? '<span class="car-latest-tag">최신</span>' : ''}</th><td>${integer.format(row.total)}</td><td>약 ${integer.format(row.domestic)}</td><td>약 ${integer.format(row.imported)}</td><td>${decimal.format(row.importShare)}%</td><td class="${direction(change)}">${signedPercent(change)}</td></tr>`;
    }).join('');
  }

  function modelTable(items) {
    return `<div class="table-scroll"><table class="car-model-table used-model-table"><thead><tr><th scope="col">순위</th><th scope="col">모델</th><th scope="col">거래량</th><th scope="col">구분 내 비중</th></tr></thead><tbody>${items.map((item) => {
      const image = item.image ? safeHttpUrl(item.image) : '/assets/car-placeholder.svg';
      return `<tr><td><strong>${item.rank}</strong></td><th scope="row"><a class="car-model-main" href="${safeHttpUrl(item.detailUrl)}" target="_blank" rel="noopener noreferrer nofollow"><img src="${image}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span class="car-model-copy"><span>${escapeHTML(item.name)}</span><small>${escapeHTML(item.brand)}</small></span></a></th><td>${integer.format(item.sales)}건</td><td>${decimal.format(item.share)}%</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function rankingCard(market, items) {
    const label = market === 'domestic' ? '국산 중고차' : '수입 중고차';
    return `<article class="car-ranking-market car-ranking-${market}"><header><div><span>${market === 'domestic' ? 'DOMESTIC' : 'IMPORTED'}</span><h3>${label} 모델 TOP 10</h3></div><p>이전등록 기준</p></header><section>${modelTable(items)}</section></article>`;
  }

  function renderRankingMonth(data, month) {
    const row = data.rankings.find((item) => item.month === month) || data.rankings.at(-1);
    const markets = VIEW === 'all' ? ['domestic', 'imported'] : [VIEW];
    const target = document.querySelector('#used-rankings');
    target.classList.toggle('is-single', markets.length === 1);
    target.innerHTML = markets.map((market) => rankingCard(market, row[market])).join('');
    target.querySelectorAll('.car-model-main img').forEach((image) => image.addEventListener('error', () => {
      if (!image.src.endsWith('/assets/car-placeholder.svg')) image.src = '/assets/car-placeholder.svg';
    }, { once: true }));
  }

  function renderRankings(data) {
    const selector = document.querySelector('#used-ranking-month');
    selector.innerHTML = [...data.rankings].reverse().map((row) => `<option value="${row.month}">${monthLabel(row.month, true)}</option>`).join('');
    selector.value = data.latestMonth;
    document.querySelector('#used-ranking-basis').textContent = data.basis.ranking;
    renderRankingMonth(data, selector.value);
    selector.addEventListener('change', () => renderRankingMonth(data, selector.value));
    document.querySelector('#used-ranking-loading').hidden = true;
    document.querySelector('#used-rankings').hidden = false;
  }

  function renderSources(data) {
    document.querySelector('#used-basis-notice').textContent = data.basis.notice;
    document.querySelector('#used-definitions').innerHTML = `<dt>전체</dt><dd>${escapeHTML(data.basis.total)}</dd><dt>국산·수입</dt><dd>${escapeHTML(data.basis.split)}</dd><dt>모델 순위</dt><dd>${escapeHTML(data.basis.ranking)}</dd><dt>차량 이미지</dt><dd>${escapeHTML(data.basis.image)}</dd>`;
    document.querySelector('#used-sources').innerHTML = `<li><div><a href="${safeHttpUrl(data.source.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(data.source.name)}</a><span>${escapeHTML(data.source.upstream)}</span></div><time datetime="${escapeHTML(data.updatedAt)}">확인 ${new Date(data.updatedAt).toLocaleDateString('ko-KR')}</time></li><li><div><a href="${safeHttpUrl(data.sourceGuide.url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(data.sourceGuide.name)}</a><span>월별 업데이트·공식 등록자료 집계기준 안내</span></div></li>`;
  }

  function showError(error) {
    const target = document.querySelector('#used-error');
    target.hidden = false;
    target.textContent = `자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. (${error.message})`;
  }

  renderShell();
  fetchJSON('/data/used-car-sales.json')
    .then(validate)
    .then((data) => {
      const rows = data.months.slice(-Math.max(1, Number(data.displayMonths) || 24));
      setStatus(data.updatedAt);
      document.querySelector('#used-range').textContent = `${rows[0].month.replace('-', '.')} — ${rows.at(-1).month.replace('-', '.')}`;
      renderKpis(rows);
      renderChart(rows);
      renderAnalysis(data, rows);
      renderTable(rows);
      renderRankings(data);
      renderSources(data);
      document.querySelector('#used-content').hidden = false;
      document.querySelector('#used-loading').hidden = true;
    })
    .catch((error) => {
      console.error(error);
      document.querySelector('#used-loading').hidden = true;
      showError(error);
    });
})();
