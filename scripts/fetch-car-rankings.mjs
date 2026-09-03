import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const salesPath = path.join(root, 'data', 'car-sales.json');
const outputPath = path.join(root, 'data', 'car-rankings.json');
const temporaryPath = `${outputPath}.tmp`;
const sourceUrl = 'https://mauto.danawa.com/newcar/?Work=record';

const clean = (value) => String(value ?? '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, ' ')
  .trim();
const number = (value) => Number(clean(value).replaceAll(',', '').replace('%', '').replace(/[▲▼]/g, '').trim());
const monthFromKorean = (value) => {
  const match = clean(value).match(/(20\d{2})년\s*(\d{1,2})월/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : null;
};

function section(html, id, nextId) {
  const pattern = new RegExp(`<div\\s+id=['"]${id}['"][^>]*>([\\s\\S]*?)<div\\s+class=['"]finder_paging['"]\\s+id=['"]${nextId}['"]`, 'i');
  const match = html.match(pattern);
  if (!match) throw new Error(`${id} 영역을 찾지 못했습니다.`);
  return match[1];
}

function sideLists(sectionHtml) {
  const lists = [...sectionHtml.matchAll(/<ul\s+class=['"]sideRankR homeRankR['"][^>]*>([\s\S]*?)<\/ul>/gi)].map((match) => match[1]);
  if (lists.length < 2) throw new Error('국산·수입 순위 목록을 찾지 못했습니다.');
  return lists.slice(0, 2);
}

function parseItems(listHtml, kind) {
  return [...listHtml.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => {
    const block = match[1];
    const rank = number(block.match(/<span\s+class=['"]rank['"][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const titleBlock = block.match(/<span\s+class=['"]title['"][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
    const name = clean(titleBlock);
    const sales = number(block.match(/<span\s+class=['"]sales['"][^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const rateBlock = block.match(/<span\s+class=['"]rate['"][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '';
    const brand = clean(titleBlock.match(/<img\b[^>]*\balt=['"]([^'"]*)['"]/i)?.[1]);
    const result = { rank, name, sales };
    if (kind === 'brand') result.share = number(rateBlock);
    if (kind === 'model') {
      const delta = number(rateBlock);
      result.brand = brand;
      result.brandId = block.match(/[?&](?:amp;)?Brand=([\d,]+)/i)?.[1] || null;
      result.change = Number.isFinite(delta) ? (rateBlock.includes('▼') ? -delta : delta) : null;
    }
    return result;
  }).filter((item) => Number.isInteger(item.rank) && item.rank > 0 && item.name && Number.isFinite(item.sales));
}

async function fetchBrandModels({ month, brandId }) {
  const url = `${sourceUrl}&Tab=Brand&Brand=${encodeURIComponent(brandId)}&Month=${month}-00`;
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'modoosise-car-ranking-updater/1.0 (+https://modoosise.com/car)',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`다나와 모델 이미지 ${month}/${brandId}: HTTP ${response.status}`);
  const html = await response.text();
  return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].flatMap((match) => {
    const block = match[1];
    const modelId = block.match(/<button\b[^>]*\bmodel=['"](\d+)['"][^>]*\bname=['"]sub_model_sel['"]/i)?.[1];
    const link = block.match(/<a\b[^>]*href=['"]\/auto\/\?Work=model(?:&|&amp;)Model=\d+['"][^>]*>([\s\S]*?)<\/a>/i)?.[1];
    const name = clean(link);
    if (!modelId || !name) return [];
    return [{
      brandId,
      name,
      image: `https://autoimg.danawa.com/photo/${modelId}/model_360.png`,
      detailUrl: `https://auto.danawa.com/auto/?Work=model&Model=${modelId}`,
    }];
  });
}

function parseTotals(sectionHtml) {
  return [...sectionHtml.matchAll(/<div\s+class=['"]cmnt['"][^>]*>([\s\S]*?)<\/div>/gi)].map((match) => {
    const label = clean(match[1]);
    const total = number(label.match(/합계\s*([\d,]+)\s*대/)?.[1]);
    return { month: monthFromKorean(label), total };
  });
}

function parseModelMonths(sectionHtml) {
  return [...sectionHtml.matchAll(/<h3\s+class=['"]screen_out['"][^>]*>([\s\S]*?)<\/h3>/gi)].map((match) => monthFromKorean(match[1]));
}

async function fetchMonth(month) {
  const response = await fetch(`${sourceUrl}&Month=${month}-00`, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'modoosise-car-ranking-updater/1.0 (+https://modoosise.com/car)',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`다나와 ${month}: HTTP ${response.status}`);
  const html = await response.text();
  const brandSection = section(html, 'recordBrand_slider', 'recordBrand_paging');
  const modelSection = section(html, 'recordModel_slider', 'recordModel_paging');
  const brandLists = sideLists(brandSection);
  const modelLists = sideLists(modelSection);
  const totals = parseTotals(brandSection);
  const modelMonths = parseModelMonths(modelSection);
  const markets = ['domestic', 'imported'];
  const result = { month };

  markets.forEach((market, index) => {
    if (totals[index]?.month !== month || modelMonths[index] !== month) {
      throw new Error(`다나와 ${month} ${market}: 요청월과 응답월이 다릅니다.`);
    }
    const brands = parseItems(brandLists[index], 'brand');
    const models = parseItems(modelLists[index], 'model');
    if (brands.length < 5 || models.length < 10 || !Number.isFinite(totals[index].total)) {
      throw new Error(`다나와 ${month} ${market}: 순위 항목이 부족합니다.`);
    }
    result[market] = { total: totals[index].total, brands: brands.slice(0, 5), models: models.slice(0, 10) };
  });
  return result;
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

const sales = JSON.parse(await readFile(salesPath, 'utf8'));
const months = sales.months.slice(-Math.max(1, Number(sales.displayMonths) || 24)).map((row) => row.month);
const rankings = await mapWithConcurrency(months, 3, fetchMonth);
const imagePairs = new Map();
for (const row of rankings.slice(-6)) {
  for (const market of ['domestic', 'imported']) {
    for (const model of row[market].models) {
      if (model.brandId) imagePairs.set(`${row.month}|${model.brandId}`, { month: row.month, brandId: model.brandId });
    }
  }
}
const discoveredModels = (await mapWithConcurrency([...imagePairs.values()], 3, async (pair) => {
  try {
    return await fetchBrandModels(pair);
  } catch (error) {
    console.warn(error.message);
    return [];
  }
})).flat();
const imageByExactName = new Map();
for (const model of discoveredModels) imageByExactName.set(`${model.brandId}|${model.name}`, model);
for (const row of rankings) {
  for (const market of ['domestic', 'imported']) {
    for (const model of row[market].models) {
      const match = imageByExactName.get(`${model.brandId}|${model.name}`);
      if (match) {
        model.image = match.image;
        model.detailUrl = match.detailUrl;
      }
      delete model.brandId;
    }
  }
}
const output = {
  version: 1,
  updatedAt: new Date().toISOString(),
  latestMonth: rankings.at(-1).month,
  displayMonths: months.length,
  basisNotice: '다나와자동차가 KAMA·KAIDA 공식자료를 자체 모델 분류 기준으로 재구성한 판매실적입니다. 버스·상용차와 모델 분류 차이로 상단 총판매량과 합계가 다를 수 있습니다.',
  source: {
    name: '다나와자동차 신차 판매실적',
    url: sourceUrl,
    upstream: ['한국자동차모빌리티산업협회(KAMA)', '한국수입자동차협회(KAIDA)'],
  },
  imageSource: {
    name: '다나와자동차 모델 이미지',
    url: 'https://auto.danawa.com/',
    coverage: '최근 6개월 판매 모델을 기준으로 연결하며, 미확인 모델은 공통 실루엣을 표시합니다.',
  },
  rankings,
};

await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(`자동차 브랜드·모델 순위 갱신: ${rankings[0].month}~${rankings.at(-1).month} (${rankings.length}개월)`);
