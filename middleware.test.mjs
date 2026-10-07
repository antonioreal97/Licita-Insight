import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loadMiddleware = async () => {
  const source = await readFile(new URL('./middleware.js', import.meta.url), 'utf8');
  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);
};

const requestOverrides = (response) => {
  const names = response.headers.get('x-middleware-override-headers')?.split(',').filter(Boolean) ?? [];
  const headers = new Headers();
  for (const name of names) {
    headers.set(name, response.headers.get(`x-middleware-request-${name}`));
  }
  return headers;
};

test('middleware keeps current header behavior when ORIGIN_SHARED_SECRET is not configured', async () => {
  const previousUpstream = process.env.API_UPSTREAM_ORIGIN;
  const previousSecret = process.env.ORIGIN_SHARED_SECRET;
  process.env.API_UPSTREAM_ORIGIN = 'https://api.example.test';
  delete process.env.ORIGIN_SHARED_SECRET;
  try {
    const { default: middleware } = await loadMiddleware();
    const response = middleware(
      new Request('https://app.example.test/api/v1/tenders/search?q=abc', {
        headers: {
          'x-forwarded-for': '203.0.113.1, 10.0.0.1',
          'x-abriu-origin': 'client-forged',
          'x-abriu-client-ip': '198.51.100.1',
        },
      }),
    );

    assert.equal(
      response.headers.get('x-middleware-rewrite'),
      'https://api.example.test/api/v1/tenders/search?q=abc',
    );
    const headers = requestOverrides(response);
    assert.equal(headers.get('ngrok-skip-browser-warning'), '1');
    assert.equal(headers.get('x-abriu-origin'), 'client-forged');
    assert.equal(headers.get('x-abriu-client-ip'), '198.51.100.1');
  } finally {
    if (previousUpstream === undefined) delete process.env.API_UPSTREAM_ORIGIN;
    else process.env.API_UPSTREAM_ORIGIN = previousUpstream;
    if (previousSecret === undefined) delete process.env.ORIGIN_SHARED_SECRET;
    else process.env.ORIGIN_SHARED_SECRET = previousSecret;
  }
});

test('middleware injects trusted origin headers and strips client-forged values', async () => {
  const previousUpstream = process.env.API_UPSTREAM_ORIGIN;
  const previousSecret = process.env.ORIGIN_SHARED_SECRET;
  process.env.API_UPSTREAM_ORIGIN = 'https://api.example.test';
  process.env.ORIGIN_SHARED_SECRET = '0123456789abcdef0123456789abcdef';
  try {
    const { default: middleware } = await loadMiddleware();
    const response = middleware(
      new Request('https://app.example.test/api/v1/tenders/search', {
        headers: {
          'x-forwarded-for': '203.0.113.2, 10.0.0.1',
          'x-abriu-origin': 'client-forged',
          'x-abriu-client-ip': '198.51.100.1',
          'x-vercel-id': 'drop-me',
        },
      }),
    );

    const headers = requestOverrides(response);
    assert.equal(headers.get('x-abriu-origin'), process.env.ORIGIN_SHARED_SECRET);
    assert.equal(headers.get('x-abriu-client-ip'), '203.0.113.2');
    assert.equal(headers.get('x-vercel-id'), null);
    assert.equal(headers.get('ngrok-skip-browser-warning'), '1');
  } finally {
    if (previousUpstream === undefined) delete process.env.API_UPSTREAM_ORIGIN;
    else process.env.API_UPSTREAM_ORIGIN = previousUpstream;
    if (previousSecret === undefined) delete process.env.ORIGIN_SHARED_SECRET;
    else process.env.ORIGIN_SHARED_SECRET = previousSecret;
  }
});
