const CANONICAL_HOST = 'modoosise.com';
const REDIRECT_HOSTS = new Set(['www.modoosise.com', '26-07-19marketprice.pages.dev']);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (REDIRECT_HOSTS.has(url.hostname)) {
    url.protocol = 'https:';
    url.hostname = CANONICAL_HOST;
    url.port = '';
    return Response.redirect(url.toString(), 308);
  }

  const response = await context.next();
  if (!['/shopping', '/shopping/', '/shopping.html'].includes(url.pathname)) return response;

  const headers = new Headers(response.headers);
  headers.set('x-robots-tag', 'noindex, follow');
  headers.set('cache-control', 'public, max-age=3600');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(context.request.method === 'HEAD' ? null : response.body, {
    status: 410,
    headers,
  });
}
