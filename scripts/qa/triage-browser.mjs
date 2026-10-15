/** Browser acceptance with fixture-only API, no backend/external calls.
 * Run against Vite: TRIAGE_URL=http://localhost:24253 PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/qa/triage-browser.mjs
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.TRIAGE_URL || 'http://localhost:24253';
const output = 'docs/reviews/recommendation-triage';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const records = Array.from({ length: 10 }, (_, i) => ({ tender: {
  id: `triage-${i + 1}`, title: `Filmagem de eventos culturais — lote ${i + 1}`, displayTitle: `Filmagem de eventos culturais — lote ${i + 1}`,
  organization: { id: 'org', name: 'Secretaria Municipal de Cultura' }, location: { city: 'Rio de Janeiro', state: 'RJ', cityIbgeCode: null },
  estimatedValue: 120000, estimatedValueFlag: null, proposalDeadline: '2026-11-20T17:00:00Z', publishedAt: '2026-10-15T12:00:00Z',
  categories: [{ slug: 'audiovisual', label: 'Audiovisual' }], status: 'open', modality: 'pregao_eletronico', modalityLabel: 'Pregão eletrônico',
  platform: { slug: 'compras_gov', label: 'Compras.gov.br', kind: 'platform', url: null },
  source: { id: 'pncp', name: 'PNCP', url: null }, relevance: { score: 90, highlights: [] },
}, score: 90, reasons: [{ kind: 'profile', text: 'Filmagem e produção audiovisual estão no seu perfil.' }, { kind: 'location', text: 'Oportunidade na sua região de atendimento.' }] }));
const initialProfile = { description: 'Produção audiovisual e filmagem de eventos culturais.', offerings: ['filmagem'], exclusions: ['fotografia'], selectedKeywords: [], excludedKeywords: [], selectedCategories: ['audiovisual'], registeredPlatforms: [], coverage: { scope: 'national' }, valueRange: { min: null, max: null }, size: 'me_epp', version: 1, updatedAt: new Date().toISOString() };
async function setup(options = {}, count = 10) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, reducedMotion: 'reduce', ...options });
  await context.addInitScript(() => { localStorage.setItem('licita-cookie-consent', 'accepted'); });
  const calls = []; let failSave = false; let profile = structuredClone(initialProfile);
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.replace('/api/v1', ''); const method = request.method();
    calls.push({ path, method, body: request.postDataJSON() });
    const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/auth/session') return json({ user: { id: 'triage-user', email: 'teste@example.test', name: 'Marina', createdAt: '2026-01-01' } });
    if (path === '/me/billing') return json({ entitled: true, source: 'subscription', status: 'active', canCancel: true, currentPeriodEnd: '2099-01-01', monthlyBrl: 49 });
    if (path === '/opportunities/access') return json({ entitled: true, access: true });
    if (path === '/me/usage-profile') return json({ usagePurposes: ['procurement'], applicantTypes: ['company'], usageInviteDismissed: true });
    if (path === '/me/notifications/unread-count') return json({ unreadCount: 0 });
    if (path === '/me/notifications') return json({ data: [], pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 } });
    if (path === '/me/company-profile') {
      if (method === 'PUT') profile = request.postDataJSON();
      return json({ profile });
    }
    if (path === '/me/tender-highlights') return json({ results: Object.fromEntries(records.map(({ tender }) => [tender.id, { requirements: [{ label: 'Atestado de capacidade técnica' }, { label: 'Equipe técnica especializada' }, { label: 'Entrega de portfólio' }, { label: 'Quarta exigência oculta' }] }])) });
    if (path === '/recommendations') return json({ data: records.slice(0, count), opportunities: [], pagination: { total: count, page: 1, pageSize: 50, totalPages: 1 } });
    if (path === '/recommendations/events') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'Métrica indisponível' } }) });
    if (path.endsWith('/dismiss')) return route.fulfill({ status: 204 });
    if (path === '/me/saved-tenders/ids') return json({ saved: [], monitored: [] });
    if (path.startsWith('/me/saved-tenders/') && method === 'PUT') {
      await new Promise(resolve => setTimeout(resolve, 150));
      if (failSave) { failSave = false; return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Teste' } }) }); }
      return json({ tenderId: path.split('/').at(-1) });
    }
    if (path === '/tenders' || path === '/tenders/search') return json({ data: [], pagination: { total: 0, page: 1, pageSize: 4, totalPages: 0 } });
    if (path === '/me/tender-fits') return json({ results: {} });
    if (path === '/me/saved-tenders' || path === '/me/saved-searches') return json({ data: [], pagination: { total: 0 } });
    return json({});
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/triagem`);
  await page.getByRole('heading', { name: /Filmagem de eventos culturais/ }).waitFor();
  return { context, page, calls, errors, failNextSave: () => { failSave = true; } };
}
const progress = async (page, value) => { await page.waitForFunction(n => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === String(n), value); };
const progressValue = page => page.getByRole('progressbar').getAttribute('aria-valuenow');
const arrow = async (page, key) => { await page.locator('#triage-tender-title').focus(); await page.keyboard.press(key); };
try {
  const { context, page, calls, errors, failNextSave } = await setup();
  await page.getByText('Atestado de capacidade técnica', { exact: true }).waitFor();
  assert.equal(await page.getByText('Quarta exigência oculta').count(), 0);
  await page.screenshot({ path: `${output}/desktop-creme.png`, fullPage: true });
  await arrow(page, 'ArrowRight'); await progress(page, 1);
  await arrow(page, 'ArrowLeft'); await page.getByRole('button', { name: 'Fora da minha região', exact: true }).click(); await progress(page, 2);
  assert.ok((await page.getByRole('status').allTextContents()).some(text => text.includes('menos editais em RJ')));
  await arrow(page, 'ArrowDown'); await progress(page, 3);
  failNextSave(); await page.getByRole('button', { name: 'Interessa', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Não foi possível registrar' }).waitFor();
  assert.equal(await progressValue(page), '3');
  await page.getByRole('button', { name: 'Interessa', exact: true }).dblclick(); await progress(page, 4);
  assert.equal(calls.filter(call => call.path === '/me/saved-tenders/triage-4' && call.method === 'PUT').length, 2);
  await arrow(page, 'ArrowLeft'); await page.getByRole('button', { name: 'Não faço isso', exact: true }).click(); await progress(page, 5);
  assert.equal(calls.filter(call => call.path === '/me/company-profile' && call.method === 'PUT').length, 0);
  await page.getByLabel('Termo a excluir').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await progressValue(page), '5');
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await page.getByRole('status').filter({ hasText: 'foi adicionado' }).waitFor();
  const profileCall = calls.find(call => call.path === '/me/company-profile' && call.method === 'PUT');
  assert.deepEqual(profileCall.body.exclusions, ['fotografia', 'filmagem']);
  assert.deepEqual(profileCall.body.offerings, ['filmagem']);
  await arrow(page, 'ArrowLeft'); await page.getByRole('button', { name: 'Valor fora da minha faixa', exact: true }).click(); await progress(page, 6);
  await arrow(page, 'ArrowDown'); await progress(page, 7);
  await arrow(page, 'ArrowRight'); await progress(page, 8);
  await arrow(page, 'ArrowDown'); await progress(page, 9);
  await arrow(page, 'ArrowRight'); await progress(page, 10);
  await page.getByText('Você marcou 4 de interesse — estão em Editais salvos.').waitFor();
  await page.screenshot({ path: `${output}/resumo.png`, fullPage: true });
  await page.reload(); await page.getByText('Você marcou 4 de interesse — estão em Editais salvos.').waitFor();
  assert.deepEqual(errors, []); await context.close();

  const mobile = await setup({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mobile.page.getByText('Atestado de capacidade técnica', { exact: true }).waitFor();
  await mobile.page.screenshot({ path: `${output}/mobile-creme.png`, fullPage: true });
  assert.equal(await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  const cdp = await mobile.context.newCDPSession(mobile.page);
  async function swipe(from, to) {
    await mobile.page.locator('#triage-tender-title').scrollIntoViewIfNeeded();
    const box = await mobile.page.locator('#triage-tender-title').boundingBox();
    const y = box.y + 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (to - from) * i / 5, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await swipe(70, 290); await progress(mobile.page, 1);
  await swipe(290, 70); await mobile.page.getByRole('button', { name: 'Prazo curto', exact: true }).click(); await progress(mobile.page, 2);
  await mobile.page.getByRole('button', { name: 'Não interessa', exact: true }).click();
  await mobile.page.evaluate(() => window.scrollTo(0, 0));
  await mobile.page.screenshot({ path: `${output}/mobile-motivos.png`, fullPage: true });
  await mobile.page.getByRole('button', { name: 'Dispensar sem motivo' }).click(); await progress(mobile.page, 3);
  assert.deepEqual(mobile.errors, []); await mobile.context.close();
  const dark = await setup({ viewport: { width: 1440, height: 1200 } });
  await dark.page.evaluate(() => document.documentElement.classList.add('dark'));
  await dark.page.getByText('Atestado de capacidade técnica', { exact: true }).waitFor();
  await dark.page.screenshot({ path: `${output}/desktop-petroleo.png`, fullPage: true });
  await dark.context.close();
  const entry = await setup();
  await entry.page.goto(`${origin}/dashboard`);
  await entry.page.getByTestId('triage-entry').getByText('10 editais esperando sua triagem').waitFor();
  await entry.page.screenshot({ path: `${output}/visao-geral-entrada.png` });
  await entry.context.close();
  const fewer = await setup({}, 2);
  await arrow(fewer.page, 'ArrowDown'); await progress(fewer.page, 1);
  await arrow(fewer.page, 'ArrowDown'); await progress(fewer.page, 2);
  await fewer.page.getByText('Você chegou ao fim desta seleção').waitFor();
  await fewer.context.close();
  console.log('PASS: 10-item flow, optional reasons, errors/retry, duplicate guard, explicit exclusion, keyboard, touch swipes, buttons, reload, partial queue, both themes, mobile overflow, reduced motion, screenshots.');
} finally { await browser.close(); }
