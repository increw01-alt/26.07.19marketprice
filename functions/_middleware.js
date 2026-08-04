const CANONICAL_HOST = 'modoosise.com';
const REDIRECT_HOSTS = new Set(['www.modoosise.com', '26-07-19marketprice.pages.dev']);

export function onRequest(context) {
  const url = new URL(context.request.url);
  if (!REDIRECT_HOSTS.has(url.hostname)) return context.next();

  url.protocol = 'https:';
  url.hostname = CANONICAL_HOST;
  url.port = '';
  return Response.redirect(url.toString(), 308);
}
