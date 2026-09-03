import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data', 'car-sales.json');
const temporary = `${output}.tmp`;
const sourceUrl = 'https://www.kaida.co.kr/ko/statistics/kaidaShareList.do';
const monthNumbers = new Map([
  ['Jan.', '01'], ['Feb.', '02'], ['Mar.', '03'], ['Apr.', '04'],
  ['May', '05'], ['Jun.', '06'], ['Jul.', '07'], ['Aug.', '08'],
  ['Sep.', '09'], ['Oct.', '10'], ['Nov.', '11'], ['Dec.', '12'],
]);

const cleanCell = (value) => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/\s+/g, ' ')
  .trim();
const numberCell = (value) => Number(cleanCell(value).replaceAll(',', '').replace('%', ''));

async function fetchYear(year) {
  const body = new URLSearchParams({
    searchStart: String(year),
    programId: '',
    layId: 'month',
    searchVerticalId: 'month',
    statsType: 'month',
  });
  const response = await fetch(sourceUrl, {
    method: 'POST',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'user-agent': 'modoosise-car-sales-updater/1.0 (+https://modoosise.com/car)',
    },
    body,
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`KAIDA ${year}: HTTP ${response.status}`);
  const html = await response.text();
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((match) => {
    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanCell(cell[1]));
    const month = monthNumbers.get(cells[0]);
    if (!month || cells.length < 6) return [];
    const domestic = numberCell(cells[3]);
    const imported = numberCell(cells[4]);
    const importShare = numberCell(cells[5]);
    if (![domestic, imported, importShare].every(Number.isFinite)) throw new Error(`KAIDA ${year}-${month}: 숫자 변환 실패`);
    if (domestic === 0 && imported === 0) return [];
    const total = domestic + imported;
    const calculatedShare = total ? Number(((imported / total) * 100).toFixed(1)) : 0;
    if (Math.abs(calculatedShare - importShare) > 0.2) throw new Error(`KAIDA ${year}-${month}: 점유율 검증 실패`);
    return [{ month: `${year}-${month}`, domestic, imported, total, importShare }];
  });
  if (!rows.length) throw new Error(`KAIDA ${year}: 공개된 월별 판매량이 없습니다.`);
  return rows;
}

function validate(rows) {
  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  const seen = new Set();
  for (const row of sorted) {
    if (!/^\d{4}-\d{2}$/.test(row.month) || seen.has(row.month)) throw new Error(`중복되거나 잘못된 기준월: ${row.month}`);
    seen.add(row.month);
    if (![row.domestic, row.imported, row.total, row.importShare].every(Number.isFinite)) throw new Error(`${row.month}: 숫자 누락`);
    if (row.domestic < 0 || row.imported < 0 || row.total !== row.domestic + row.imported) throw new Error(`${row.month}: 합계 검증 실패`);
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const current = new Date(`${sorted[index].month}-01T00:00:00Z`);
    const prior = new Date(`${sorted[index - 1].month}-01T00:00:00Z`);
    const expected = new Date(Date.UTC(prior.getUTCFullYear(), prior.getUTCMonth() + 1, 1));
    if (current.valueOf() !== expected.valueOf()) throw new Error(`${sorted[index - 1].month} 다음 ${sorted[index].month}: 월 자료가 비었습니다.`);
  }
  return sorted;
}

const previous = JSON.parse(await readFile(output, 'utf8'));
const currentYear = new Date().getFullYear();
const requestedYears = [currentYear - 2, currentYear - 1, currentYear];
const fetched = (await Promise.all(requestedYears.map(fetchYear))).flat();
const merged = new Map(previous.months.map((row) => [row.month, row]));
for (const row of fetched) merged.set(row.month, row);
const months = validate([...merged.values()]);
const latestMonth = months.at(-1).month;
const comparableBefore = JSON.stringify(previous.months);
const comparableAfter = JSON.stringify(months);

if (comparableBefore === comparableAfter && previous.latestMonth === latestMonth) {
  console.log(`자동차 판매량 변경 없음 (최신 ${latestMonth})`);
  process.exit(0);
}

const now = new Date().toISOString();
const sources = previous.sources.map((source) => source.url === sourceUrl ? { ...source, checkedAt: now } : source);
const next = { ...previous, updatedAt: now, latestMonth, sources, months };
await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
await rename(temporary, output);
console.log(`자동차 판매량 갱신: ${previous.latestMonth} → ${latestMonth} (${months.length}개월 보관)`);
