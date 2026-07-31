// 네이버 쇼핑 검색 API — 인기 상품의 판매처별 최저가를 수집합니다.
// 인증키는 환경변수 NAVER_ID / NAVER_SECRET 로만 받습니다 (GitHub Actions Secret).
//
// 상품 목록은 아래 QUERIES 를 직접 편집하면 됩니다.
//   id    : 파일 내에서 고유한 식별자 (영문/하이픈)
//   name  : 화면에 보일 상품명(짧게)
//   query : 네이버 쇼핑에서 실제로 검색할 검색어(사람들이 찾는 그대로)
// 각 검색어로 최저가순 상위 판매처를 모아 가격비교 표를 만듭니다.
import { getJSON, writeJSON, nowKST } from './lib.mjs';

const OUT = 'data/shopping.json';

const ID = process.env.NAVER_ID;
const SECRET = process.env.NAVER_SECRET;
if (!ID || !SECRET) {
  console.error('환경변수 NAVER_ID / NAVER_SECRET 가 없습니다.');
  process.exit(1);
}

// 비교할 상품 목록 — 여기만 고치면 됩니다.
const QUERIES = [
  { id: 'coke-zero', name: '코카콜라 제로 355ml 24캔', query: '코카콜라 제로 355ml 24캔' },
  { id: 'samdasoo', name: '제주 삼다수 2L 12병', query: '제주 삼다수 2L 12병' },
  { id: 'shin-ramyun', name: '농심 신라면 20개입', query: '농심 신라면 20개입' },
  { id: 'hetbahn', name: '햇반 백미 210g 24개', query: '햇반 백미 210g 24개입' },
  { id: 'spam', name: '스팸 클래식 200g 세트', query: '스팸 클래식 200g 선물세트' },
  { id: 'pocachip', name: '오리온 포카칩 오리지널', query: '오리온 포카칩 오리지널 66g' },
  { id: 'seoul-milk', name: '서울우유 1L', query: '서울우유 1L' },
  { id: 'bibigo-mandu', name: '비비고 왕교자 1.05kg', query: '비비고 왕교자 1.05kg' },
  { id: 'downy', name: '다우니 섬유유연제', query: '다우니 섬유유연제 본품' },
  { id: 'kleenex', name: '크리넥스 3겹 화장지 30롤', query: '크리넥스 데코소프트 3겹 30롤' },
];

const API = 'https://openapi.naver.com/v1/search/shop.json';
const headers = { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET };

/** 네이버 응답의 title 은 <b> 강조 태그와 HTML 엔티티를 포함하므로 순수 텍스트로 정리합니다. */
const strip = (s) =>
  String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

/** 검색어 하나 → 판매처별(몰당 1건) 최저가 상위 목록 */
async function collect(q) {
  const url = `${API}?query=${encodeURIComponent(q.query)}&display=30&sort=asc`;
  const res = await getJSON(url, { headers });
  const items = Array.isArray(res.items) ? res.items : [];

  // sort=asc 라 저렴한 순으로 옵니다. 같은 몰은 대표(최저) 1건만 남깁니다.
  const seen = new Set();
  const offers = [];
  for (const it of items) {
    const price = Number(it.lprice);
    if (!Number.isFinite(price) || price <= 0) continue;
    const mall = strip(it.mallName) || '기타';
    if (seen.has(mall)) continue;
    seen.add(mall);
    offers.push({ mall, price, link: it.link });
    if (offers.length >= 6) break;
  }
  if (!offers.length) return null;

  const top = items[0]; // 전체 최저가 상품 (대표 이미지·카테고리용)
  return {
    id: q.id,
    name: q.name,
    query: q.query,
    image: top?.image || null,
    category: strip(top?.category1) || null,
    lprice: offers[0].price,
    offers, // 이미 최저가순
  };
}

const products = [];
for (const q of QUERIES) {
  try {
    const p = await collect(q);
    if (p) {
      products.push(p);
      console.log(`${q.name}: 최저 ${p.lprice.toLocaleString('ko-KR')}원 (${p.offers.length}곳)`);
    } else {
      console.warn(`${q.name}: 결과 없음`);
    }
  } catch (err) {
    console.warn(`${q.name}: 수집 실패 — ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 300)); // API 배려 (초당 호출 제한 여유)
}

if (!products.length) throw new Error('수집된 상품이 없습니다 — API 키/응답을 확인하세요');
await writeJSON(OUT, { updatedAt: nowKST(), source: '네이버 쇼핑', products });
console.log(`done: ${products.length}개 상품`);
