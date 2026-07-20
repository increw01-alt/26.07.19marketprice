// 국토교통부 아파트 매매 실거래가 — 시군구×월 단위로 집계해 누적합니다.
//
// 인증키는 반드시 환경변수 DATA_GO_KR_KEY 로 받습니다.
// 저장소가 공개이므로 키를 코드나 데이터 파일에 절대 쓰지 마세요.
//
// 호출량 설계 (일일 한도 10,000):
//   첫 실행: 256개 시군구 × 12개월 ≈ 3,072콜
//   이후:    256개 시군구 × 최근 3개월 = 768콜 (하루 1회)
// 실거래 신고는 계약 후 30일 이내 + 해제신고가 있어 최근 3개월은 매번 다시 받습니다.
import { getText, readJSON, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/realestate.json';
const CODES = 'data/sgg-codes.json';
const MONTHS_KEEP = 12; // 보여줄 기간
const MONTHS_REFRESH = 3; // 매번 다시 받는 최근 개월 수

const KEY = process.env.DATA_GO_KR_KEY;
if (!KEY) {
  console.error('환경변수 DATA_GO_KR_KEY 가 없습니다. GitHub Actions Secret 을 확인하세요.');
  process.exit(1);
}

const API = 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade';

/** KST 기준 이번 달부터 거꾸로 n개월의 YYYYMM 목록 */
function recentMonths(n) {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const out = [];
  let y = kst.getUTCFullYear();
  let m = kst.getUTCMonth() + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}${String(m).padStart(2, '0')}`);
    m--;
    if (m === 0) { m = 12; y--; }
  }
  return out.reverse(); // 과거 → 현재
}

/**
 * 한 시군구×월을 집계합니다.
 * numOfRows=2000 이면 전국 최대 거래 시군구도 한 번에 옵니다
 * (실측: 강남구 한 달 197건, 신도시권도 수백 건 수준).
 */
async function fetchMonth(lawd, ym) {
  const url =
    `${API}?serviceKey=${KEY}&LAWD_CD=${lawd}&DEAL_YMD=${ym}` +
    `&numOfRows=2000&pageNo=1`;
  const xml = await getText(url);

  const code = xml.match(/<resultCode>([^<]*)</)?.[1];
  if (code !== '000') {
    throw new Error(`resultCode=${code} ${xml.match(/<resultMsg>([^<]*)</)?.[1] || ''}`);
  }

  const total = Number(xml.match(/<totalCount>(\d+)</)?.[1] || 0);
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  if (total > items.length) {
    // numOfRows 를 넘는 시군구가 나타나면 조용히 일부만 집계하지 않도록 알립니다.
    console.warn(`${lawd} ${ym}: totalCount=${total} > 수신 ${items.length} — numOfRows 상향 필요`);
  }

  let n = 0;
  let sumPm2 = 0;
  for (const it of items) {
    // 해제된 거래(해제일 기재)는 제외합니다.
    const cdeal = it.match(/<cdealDay>([^<]*)</)?.[1]?.trim();
    if (cdeal) continue;
    const amount = Number((it.match(/<dealAmount>([^<]*)</)?.[1] || '').replace(/[,\s]/g, ''));
    const area = Number(it.match(/<excluUseAr>([^<]*)</)?.[1]);
    if (!amount || !area) continue;
    n++;
    sumPm2 += amount / area; // 만원/㎡
  }
  return { n, pm2: n ? Math.round((sumPm2 / n) * 10) / 10 : null };
}

const codes = await readJSON(CODES, null);
if (!codes?.items?.length) throw new Error(`${CODES} 가 없거나 비어 있습니다.`);

const prev = await readJSON(OUT, { sgg: {} });
const months = recentMonths(MONTHS_KEEP);
const refresh = new Set(months.slice(-MONTHS_REFRESH));

const sgg = {};
let calls = 0;
let failed = 0;

for (const c of codes.items) {
  const entry = { sido: c.sido, sgg: c.sgg, m: {} };
  const prevM = prev.sgg?.[c.lawd]?.m || {};

  for (const ym of months) {
    // 오래된 달은 캐시를 재사용하고, 최근 3개월만 다시 받습니다.
    if (!refresh.has(ym) && prevM[ym]) {
      entry.m[ym] = prevM[ym];
      continue;
    }
    try {
      entry.m[ym] = await fetchMonth(c.lawd, ym);
      calls++;
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      failed++;
      console.error(`${c.sido} ${c.sgg} ${ym} 실패: ${err.message}`);
      if (prevM[ym]) entry.m[ym] = prevM[ym]; // 실패 시 이전 값 유지
    }
  }
  sgg[c.lawd] = entry;
}

// 전 시군구가 0건이면 API 장애일 가능성이 높으므로 기존 파일을 덮지 않습니다.
const anyData = Object.values(sgg).some((e) => Object.values(e.m).some((v) => v?.n > 0));
if (!anyData) throw new Error('모든 시군구가 0건 — API 장애로 보고 기존 데이터를 유지합니다.');

await writeJSON(OUT, { updatedAt: nowKST(), months, sgg });
console.log(`done: ${Object.keys(sgg).length}개 시군구, API ${calls}콜, 실패 ${failed}건`);
