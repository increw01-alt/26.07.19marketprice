// GET /api/btc — 홈 BTC 차트용 업비트 프록시 (허용목록 + 엣지 캐시).
//
// 브라우저가 업비트를 직접 부르면 Origin 헤더 요청이 'origin' 레이트리밋 그룹
// (분당 약 10회, 429 응답엔 CORS 헤더도 없음)에 걸려 탭 몇 번에 실패합니다.
// 서버측 호출은 넉넉한 일반 그룹을 쓰고, 엣지 캐시로 방문자 수와 무관하게
// 업스트림 호출을 기간당 TTL 1회로 묶습니다.
const MARKET = 'KRW-BTC';
const CANDLE_TTLS = {
  'minutes/1': 15,
  'minutes/10': 60,
  'minutes/60': 120,
  days: 300,
  weeks: 600,
  months: 600,
};
const TICKER_TTL = 10;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');

  let upstream;
  let ttl;
  if (kind === 'ticker') {
    upstream = `https://api.upbit.com/v1/ticker?markets=${MARKET}`;
    ttl = TICKER_TTL;
  } else if (kind === 'candles') {
    const path = url.searchParams.get('path');
    const count = Number(url.searchParams.get('count'));
    if (!Object.hasOwn(CANDLE_TTLS, path) || !Number.isInteger(count) || count < 2 || count > 200) {
      return json({ error: 'bad-request' }, 400);
    }
    upstream = `https://api.upbit.com/v1/candles/${path}?market=${MARKET}&count=${count}`;
    ttl = CANDLE_TTLS[path];
  } else {
    return json({ error: 'bad-request' }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(upstream);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const up = await fetch(upstream, { headers: { accept: 'application/json' } });
  if (!up.ok) return json({ error: 'upstream', status: up.status }, 502);
  const body = await up.text();
  const response = new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${ttl}`,
    },
  });
  await cache.put(cacheKey, response.clone());
  return response;
}
