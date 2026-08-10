export async function onRequest(context) {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', 'noindex, follow');
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(context.request.method === 'HEAD' ? null : response.body, {
    status: 410,
    headers,
  });
}
