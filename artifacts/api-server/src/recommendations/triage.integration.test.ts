import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';

test('triage dismissal HTTP contract persists contextual signals in existing JSONB', { skip: !process.env.PNCP_TEST_DATABASE_URL }, async t => {
  const schema = `triage_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.PNCP_TEST_DATABASE_URL!);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  process.env.DATABASE_URL = url.toString();
  process.env.PUBLIC_APP_ORIGIN = 'http://localhost:24252';
  process.env.AUTH_DEV_LOGIN = 'true';
  process.env.SESSION_SECRET = 'triage-integration-secret-with-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.BILLING_DEV_ENTITLED = 'true';
  const { db, pool, tendersTable, recommendationDismissalsTable } = await import('@workspace/db');
  const { eq } = await import('drizzle-orm');
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const tables = await pool.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
  for (const { tablename } of tables.rows) await pool.query(`CREATE TABLE "${schema}"."${tablename}" (LIKE public."${tablename}" INCLUDING ALL)`);
  const { default: app } = await import('../app');
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    // Let the existing debounced rebuild finish before dropping its schema.
    await new Promise(resolve => setTimeout(resolve, 1700));
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  });
  const csrf = { Origin: 'http://localhost:24252', 'X-Requested-With': 'licita-insight', 'Content-Type': 'application/json' };
  const login = await fetch(`${base}/auth/dev-login`, { method: 'POST', headers: csrf, body: JSON.stringify({ email: 'triage@example.test', name: 'Teste' }) });
  assert.equal(login.status, 204);
  const Cookie = login.headers.get('set-cookie')!.split(';')[0];
  const id = 'TEST-TRIAGE';
  await db.insert(tendersTable).values({ id, pncpControlNumber: id, title: 'Serviços de filmagem', organizationId: 'test-org', organizationName: 'Órgão teste', modality: 'other', modalityLabel: 'Outra', status: 'open', estimatedValue: '100000', estimatedValueStatus: 'disclosed', state: 'RJ', sourceId: 'test', sourceName: 'Teste', searchText: 'servicos filmagem', titleNorm: 'servicos filmagem', objectNorm: '', itemsNorm: '', organizationNorm: 'orgao teste', otherNorm: '', rawPayload: {}, fetchedAt: new Date(), categories: [{ slug: 'audiovisual', label: 'Audiovisual' }] });
  const request = (body: unknown, cookie = Cookie, headers: Record<string, string> = csrf) => fetch(`${base}/recommendations/${id}/dismiss`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify(body) });
  assert.equal((await request({}, '')).status, 401);
  assert.equal((await request({}, Cookie, { 'Content-Type': 'application/json' })).status, 403);
  assert.equal((await request({ reason: 'arbitrary' })).status, 400);
  assert.equal((await db.select().from(recommendationDismissalsTable)).length, 0);
  for (const reason of ['region', 'value', 'deadline', 'not_offering'] as const) {
    assert.equal((await request({ reason })).status, 204);
    const [row] = await db.select().from(recommendationDismissalsTable).where(eq(recommendationDismissalsTable.tenderId, id));
    assert.ok(row.terms.some(term => term.includes(`"reason":"${reason}"`)));
    assert.equal(row.categories.length, reason === 'not_offering' ? 1 : 0);
  }
  assert.equal((await request({})).status, 204);
  const [legacy] = await db.select().from(recommendationDismissalsTable);
  assert.ok(legacy.terms.includes('filmagem'));
  assert.ok(!legacy.terms.some(term => term.startsWith('@triage:')));
  assert.equal(legacy.categories.length, 1);
});
