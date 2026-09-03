import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(root, 'data', 'used-car-sales.json');
const temporaryPath = `${outputPath}.tmp`;
const mobilePriceUrl = 'https://m.carisyou.com/price/';
const apiRoot = 'https://m.carisyou.com';
const detailApi = 'https://www.carisyou.com/common/ajax/getCarInfo.do';
const monthCount = 24;

const number = (value) => Number(String(value ?? '').replaceAll(',', '').trim());
const https = (value) => String(value ?? '').replace(/^http:\/\//i, 'https://');
const formatMonth = (value) => `${value.slice(0, 4)}-${value.slice(4)}`;

function previousMonth(value) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4));
  return month === 1 ? `${year - 1}12` : `${year}${String(month - 1).padStart(2, '0')}`;
}

function monthsEndingAt(value, count) {
  const rows = [];
  let cursor = value;
  while (rows.length < count) {
    rows.unshift(cursor);
    cursor = previousMonth(cursor);
  }
  return rows;
}

async function postJson(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'user-agent': 'modoosise-used-car-updater/1.0 (+https://modoosise.com/car/used)',
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${url}: JSON 응답이 아닙니다.`);
  }
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

async function fetchLatestMonth() {
  const response = await fetch(mobilePriceUrl, {
    headers: { 'user-agent': 'modoosise-used-car-updater/1.0 (+https://modoosise.com/car/used)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`카이즈유 중고차 페이지: HTTP ${response.status}`);
  const html = await response.text();
  const match = html.match(/basicData\s*:\s*\{[\s\S]*?date1\s*:\s*['"](20\d{4})['"]/);
  if (!match) throw new Error('카이즈유 중고차 최신 기준월을 찾지 못했습니다.');
  return match[1];
}

async function fetchMonthlyTotal(month) {
  const previous = previousMonth(month);
  const result = await postJson(`${apiRoot}/usedcar/axios/getDealInfo.do`, {
    date1: month,
    date2: previous,
    transrGb: '',
  });
  if (result.date1 !== month || !Number.isFinite(number(result.cnt1))) {
    throw new Error(`${month} 중고차 거래량 응답이 올바르지 않습니다.`);
  }
  return {
    month: formatMonth(month),
    total: number(result.cnt1),
    previousTotal: number(result.cnt2),
    changePct: Number(result.percent),
  };
}

async function fetchDealType(month, type) {
  const result = await postJson(`${apiRoot}/usedcar/axios/getDealInfo.do`, {
    date1: month,
    date2: previousMonth(month),
    transrGb: type,
  });
  return { name: type, count: number(result.cnt1), previousCount: number(result.cnt2) };
}

async function fetchRanking(month, market) {
  const result = await postJson(`${apiRoot}/usedcar/axios/recentRankList.do`, {
    date1: month,
    impSeNm: market === 'domestic' ? '국산' : '수입',
  });
  if (!Array.isArray(result) || result.length < 10) throw new Error(`${month} ${market} 모델 순위가 부족합니다.`);
  return result.slice(0, 10).map((item) => ({
    rank: number(item.rn),
    brand: String(item.carMakerKor || '').trim(),
    name: String(item.carModelDt || '').trim(),
    fullName: String(item.repCarClassNm || '').trim(),
    sales: number(item.cnt),
    share: Number(item.percent),
    brandLogo: https(item.brandImgUrl),
    repCarClassNbr: String(item.repCarClassNbr || '').trim(),
    detailUrl: `https://www.carisyou.com/car/${encodeURIComponent(item.repCarClassNbr)}`,
  }));
}

async function fetchVehicleImage(repCarClassNbr) {
  const data = await postJson(detailApi, { repCarClassNbr });
  const image = data.carImagePath && data.carImageId ? https(`${data.carImagePath}${data.carImageId}`) : '';
  return { repCarClassNbr, image };
}

function estimateMarketTotal(items) {
  const usable = items.filter((item) => item.sales > 0 && item.share > 0);
  const numerator = usable.reduce((sum, item) => sum + (100 * item.sales) ** 2, 0);
  const denominator = usable.reduce((sum, item) => sum + 100 * item.sales * item.share, 0);
  if (!denominator) throw new Error('국산·수입 비중 역산에 필요한 모델 순위가 부족합니다.');
  return numerator / denominator;
}

const latestMonth = await fetchLatestMonth();
const rawMonths = monthsEndingAt(latestMonth, monthCount);
console.log(`중고차 거래량 수집: ${rawMonths[0]}~${rawMonths.at(-1)}`);

const months = await mapWithConcurrency(rawMonths, 4, fetchMonthlyTotal);
const latestDealTypes = await mapWithConcurrency(
  ['매입', '매도', '상사이전', '알선', '개인거래', '기타'],
  4,
  (type) => fetchDealType(latestMonth, type),
);
const rankings = await mapWithConcurrency(rawMonths, 3, async (month) => ({
  month: formatMonth(month),
  domestic: await fetchRanking(month, 'domestic'),
  imported: await fetchRanking(month, 'imported'),
}));

for (let index = 0; index < months.length; index += 1) {
  const rawDomestic = estimateMarketTotal(rankings[index].domestic);
  const rawImported = estimateMarketTotal(rankings[index].imported);
  const domestic = Math.round(months[index].total * rawDomestic / (rawDomestic + rawImported));
  months[index].domestic = domestic;
  months[index].imported = months[index].total - domestic;
  months[index].importShare = Number((months[index].imported / months[index].total * 100).toFixed(1));
}

const imageIds = new Set();
for (const row of rankings.slice(-6)) {
  for (const market of ['domestic', 'imported']) {
    for (const model of row[market]) imageIds.add(model.repCarClassNbr);
  }
}
const imageResults = await mapWithConcurrency([...imageIds], 4, async (id) => {
  try {
    return await fetchVehicleImage(id);
  } catch (error) {
    console.warn(`차량 이미지 ${id}: ${error.message}`);
    return { repCarClassNbr: id, image: '' };
  }
});
const imageById = new Map(imageResults.map((item) => [item.repCarClassNbr, item.image]));
for (const row of rankings) {
  for (const market of ['domestic', 'imported']) {
    for (const model of row[market]) {
      model.image = imageById.get(model.repCarClassNbr) || '';
      delete model.repCarClassNbr;
    }
  }
}

const output = {
  version: 1,
  updatedAt: new Date().toISOString(),
  latestMonth: formatMonth(latestMonth),
  displayMonths: months.length,
  basis: {
    notice: '중고차의 단순 매물 수가 아니라 자동차등록원부의 이전등록 건수를 월별 거래량으로 집계합니다. 매입·매도·상사이전·알선·개인거래·기타가 모두 포함되므로 순수 최종소비자 판매량과는 다를 수 있습니다.',
    total: '카이즈유가 국토교통부 자동차 이전등록 데이터를 거래유형 전체로 집계한 정확한 건수입니다.',
    split: '국산·수입 월별 합계는 공개된 모델 TOP10의 거래량과 비중을 통계적으로 역산한 뒤 정확한 전체 건수에 맞춘 추정치입니다.',
    ranking: '국산·수입 구분과 모델별 거래량·비중은 카이즈유 공개 순위를 그대로 따릅니다.',
    image: '카이즈유 공개 차량정보의 대표차종 이미지를 연결합니다. 최근 6개월 순위에서 확인되지 않은 모델은 실루엣으로 표시합니다.',
  },
  source: {
    name: '카이즈유 중고차 시세·거래 통계',
    url: mobilePriceUrl,
    upstream: '국토교통부 자동차 등록자료(이전등록 DB)',
  },
  sourceGuide: {
    name: '카이즈유 중고차시세 소개',
    url: 'https://www.carisyou.com/price/sample',
  },
  months,
  latestDealTypes,
  rankings,
};

try {
  const previous = JSON.parse(await readFile(outputPath, 'utf8'));
  const withoutStamp = (value) => {
    const copy = structuredClone(value);
    delete copy.updatedAt;
    return JSON.stringify(copy);
  };
  if (withoutStamp(previous) === withoutStamp(output)) {
    console.log(`중고차 데이터 변경 없음 (최신 ${output.latestMonth})`);
    process.exit(0);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') console.warn(`기존 중고차 데이터 비교 생략: ${error.message}`);
}

await writeFile(temporaryPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
await rename(temporaryPath, outputPath);
console.log(`중고차 데이터 갱신 완료: ${output.latestMonth}, ${months.length}개월, 모델 순위 ${rankings.length}개월`);
