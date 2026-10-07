// Encaminha /api/* para a API no servidor (túnel ngrok) mantendo a mesma origem do app.
// O header ngrok-skip-browser-warning evita a página intermediária do ngrok gratuito.
export const config = { matcher: '/api/:path*' };

const DROP = /^(host|connection|x-vercel-|x-middleware-)/;

export default function middleware(request) {
  const upstream = process.env.API_UPSTREAM_ORIGIN;
  if (!upstream) {
    return new Response(
      JSON.stringify({ error: { code: 'UPSTREAM_NOT_CONFIGURED', message: 'API upstream is not configured' } }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }
  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, upstream);

  const forwarded = new Headers();
  for (const [name, value] of request.headers) {
    if (!DROP.test(name)) forwarded.set(name, value);
  }
  forwarded.set('ngrok-skip-browser-warning', '1');

  const headers = new Headers({ 'x-middleware-rewrite': target.toString() });
  const names = [];
  for (const [name, value] of forwarded) {
    names.push(name);
    headers.set(`x-middleware-request-${name}`, value);
  }
  headers.set('x-middleware-override-headers', names.join(','));
  return new Response(null, { headers });
}
