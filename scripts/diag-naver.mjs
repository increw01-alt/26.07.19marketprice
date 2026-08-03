// [임시 진단] 네이버 검색 API 엔드포인트별 상태/에러본문 확인.
const ID = process.env.NAVER_ID;
const SECRET = process.env.NAVER_SECRET;
const headers = { 'X-Naver-Client-Id': ID, 'X-Naver-Client-Secret': SECRET };
const q = encodeURIComponent('콜라');
const eps = {
  shop: `https://openapi.naver.com/v1/search/shop.json?query=${q}&display=1`,
  shop_no_ver: `https://openapi.naver.com/v1/search/shop?query=${q}&display=1`,
  news: `https://openapi.naver.com/v1/search/news.json?query=${q}&display=1`,
  blog: `https://openapi.naver.com/v1/search/blog.json?query=${q}&display=1`,
};
console.log('ID 앞4자리:', (ID || '').slice(0, 4), '| SECRET 길이:', (SECRET || '').length);
for (const [k, u] of Object.entries(eps)) {
  try {
    const r = await fetch(u, { headers });
    const body = await r.text();
    console.log(`\n[${k}] HTTP ${r.status}\n${body.slice(0, 220)}`);
  } catch (e) {
    console.log(`\n[${k}] ERR ${e.message}`);
  }
}
