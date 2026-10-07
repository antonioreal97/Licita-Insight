// Encaminha /api/* para a API no servidor (túnel ngrok) mantendo a mesma origem do app.
// O header ngrok-skip-browser-warning evita a página intermediária do ngrok gratuito.
export const config = { matcher: '/api/:path*' };

const DROP = /^(host|connection|x-vercel-|x-middleware-)/;
const ORIGIN_HEADER = 'x-abriu-origin';
const CLIENT_IP_HEADER = 'x-abriu-client-ip';

const originSharedSecret = () => {
  const secret = process.env.ORIGIN_SHARED_SECRET;
  return secret && secret.length >= 32 ? secret : null;
};

const firstForwardedIp = (value) => value?.split(',')[0]?.trim() || null;

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
  const secret = originSharedSecret();
  for (const [name, value] of request.headers) {
    const lowerName = name.toLowerCase();
    if (DROP.test(lowerName)) continue;
    if (secret && (lowerName === ORIGIN_HEADER || lowerName === CLIENT_IP_HEADER)) continue;
    forwarded.set(name, value);
  }
  forwarded.set('ngrok-skip-browser-warning', '1');
  if (secret) {
    forwarded.set(ORIGIN_HEADER, secret);
    const clientIp = firstForwardedIp(request.headers.get('x-forwarded-for'));
    if (clientIp) forwarded.set(CLIENT_IP_HEADER, clientIp);
  }

  const headers = new Headers({ 'x-middleware-rewrite': target.toString() });
  const names = [];
  for (const [name, value] of forwarded) {
    names.push(name);
    headers.set(`x-middleware-request-${name}`, value);
  }
  headers.set('x-middleware-override-headers', names.join(','));
  return new Response(null, { headers });
}
