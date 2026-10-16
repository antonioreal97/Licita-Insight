/** Browser component/integration checks. All API traffic is intercepted; no database or external service is used.
 * Start Vite with PORT=24317 BASE_PATH=/ pnpm --filter @workspace/licitainsight run dev
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node artifacts/licitainsight/scripts/test-guided-onboarding.mjs
 * A standard local Playwright installation also works without PLAYWRIGHT_MODULE.
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.GUIDED_TEST_ORIGIN || 'http://localhost:24317';
const shots = fileURLToPath(new URL('../../../docs/reviews/guided-onboarding/', import.meta.url));
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const pagination = { page: 1, pageSize: 20, total: 0, totalPages: 0 };
const emptyList = { data: [], pagination };
let passed = 0;
function ok(name) { passed++; console.log(`PASS ${name}`); }
const defaultProfile = () => ({ description: 'Prestamos serviços de limpeza predial.', offerings: ['limpeza predial'], selectedKeywords: [], exclusions: [], excludedKeywords: [], selectedCategories: [], registeredPlatforms: [], coverage: { scope: 'national', mode: 'strict', acceptsRemote: false }, valueRange: { min: null, max: null }, size: 'me_epp', version: 1, updatedAt: '2026-10-15T12:00:00Z' });

async function setup({ consent = 'accepted', theme = 'light', mobile = false, profile = null, entitled = true, userId = 'test-company' } = {}) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
  await context.addInitScript(({ consent, theme }) => {
    if (!localStorage.getItem('licita-cookie-consent')) localStorage.setItem('licita-cookie-consent', consent);
    localStorage.setItem('licita-theme', theme);
  }, { consent, theme });
  const state = { profile, userId, entitled, saves: [], alerts: [], previews: [], failSave: false, failPreview: false, noRecommendations: false, failRecommendations: false, failAlert: false, unknown: [], errors: [] };
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    const fulfill = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
    const failure = () => fulfill({ error: { code: 'INVALID_PARAMETER', message: 'Falha simulada', details: [] } }, 400);
    if (path === '/auth/session') return fulfill({ user: { id: state.userId, name: 'Marina Oliveira', email: 'marina@example.test', avatarUrl: null, createdAt: '2026-10-15T12:00:00Z' } });
    if (path === '/me/billing') return fulfill({ status: state.entitled ? 'active' : 'none', entitled: state.entitled, source: 'subscription', currentPeriodEnd: null, canCancel: false, monthlyBrl: 49 });
    if (path === '/billing/plan') return fulfill({ monthlyBrl: 49, trialDays: 7 });
    if (path === '/me/company-profile') {
      if (method === 'PUT') {
        const body = route.request().postDataJSON(); state.saves.push(body);
        if (state.failSave) return failure();
        state.profile = { ...body, version: (state.profile?.version ?? 0) + 1, updatedAt: '2026-10-15T12:00:00Z' };
      }
      return fulfill({ profile: state.profile });
    }
    if (path === '/profile/match-preview') {
      const input = route.request().postDataJSON(); state.previews.push(input);
      return state.failPreview ? failure() : fulfill({ estimatedOpenTenderCount: input.terms.length === 1 ? 37 : 12 });
    }
    if (path === '/profile/platforms') return fulfill({ data: [{ slug: 'compras-gov', label: 'Compras.gov.br', url: null, kind: 'platform', openTenderCount: 40 }, { slug: 'sicaf', label: 'SICAF', url: null, kind: 'registry', openTenderCount: null }] });
    if (path === '/profile/categories') return fulfill({ data: [] });
    if (path === '/profile/keywords/suggest') return fulfill({ data: [{ displayTerm: 'limpeza predial', normalizedTerm: 'limpeza predial', openTenderCount: 37, predominantCategory: null, related: false }] });
    if (path === '/profile/keywords/from-description') return fulfill({ keywords: [], categories: [], estimatedOpenTenderCount: 37 });
    if (path === '/profile/municipalities') return fulfill({ data: [{ ibgeCode: '3550308', name: 'São Paulo', state: 'SP' }] });
    if (path === '/me/company-profile/region-preview') return fulfill({ count: 9 });
    if (path === '/recommendations') {
      if (state.failRecommendations) return failure();
      return fulfill({ data: state.noRecommendations || !state.profile ? [] : [1, 2, 3, 4].slice(0, Number(url.searchParams.get('pageSize') || 3)).map((i) => ({ tender: { id: `tender-${i}`, title: ['Limpeza e conservação de escolas municipais', 'Serviços de limpeza de prédios públicos', 'Conservação de unidades administrativas', 'Quarto edital'][i - 1], displayTitle: `Edital simulado ${i}`, displayTitleSource: null, objectSummary: null, organization: { id: 'org', name: 'Prefeitura Municipal' }, purchasingUnit: null, modality: 'pregao_eletronico', modalityLabel: 'Pregão eletrônico', status: 'open', tenderNumber: null, estimatedValue: 42000, publishedAt: '2026-10-15', openingAt: null, proposalDeadline: null, location: { state: 'SP', city: 'São Paulo', cityIbgeCode: '3550308' }, source: { id: 'pncp', name: 'PNCP', url: null }, categories: [{ slug: 'servicos', label: 'Serviços' }], relevance: { score: null, highlights: [] }, updatedAt: '2026-10-15', firstSeenAt: '2026-10-15', isNew: false }, reasons: [{ kind: 'profile', text: 'Relacionado a limpeza predial' }], score: 1, generatedAt: '2026-10-15' })), pagination });
    }
    if (path === '/me/saved-searches') {
      if (method === 'POST') {
        const body = route.request().postDataJSON(); state.alerts.push(body);
        if (state.failAlert) return failure();
        return fulfill({ ...body, id: 'saved-search-1', createdAt: '2026-10-15', updatedAt: '2026-10-15', lastCheckedAt: null, newMatchesCount: 0 });
      }
      return fulfill({ data: [] });
    }
    if (path === '/me/usage-profile') return fulfill({ usagePurposes: [], applicantTypes: [], usageInviteDismissed: false });
    if (path === '/me/saved-tenders/ids') return fulfill({ saved: [], monitored: [] });
    if (path === '/me/notifications/unread-count') return fulfill({ unreadCount: 0 });
    if (path === '/me/notifications') return fulfill({ ...emptyList, unreadCount: 0 });
    if (path === '/me/saved-tenders') return fulfill(emptyList);
    if (path === '/tenders/search') return fulfill({ ...emptyList, facets: { status: [], modality: [], state: [], source: [], category: [], organization: [], valueRange: { min: null, max: null }, newCount: 0 }, meta: { searchMode: 'keyword', query: null, tookMs: 1, generatedAt: '2026-10-15' } });
    if (path === '/me/fit' || path === '/me/tender-highlights') return fulfill({ results: {} });
    if (path === '/me/recommendation-preferences') return fulfill({ enabled: true, showInternationalOpportunities: false });
    if (path === '/me/notification-preferences') return fulfill({ emailEnabled: false, digestFrequency: 'daily' });
    if (path === '/auth/logout' || path === '/auth/session/touch') return fulfill({});
    state.unknown.push(`${method} ${path}`);
    return fulfill({ error: { code: 'NOT_FOUND', message: 'Unmocked endpoint' } }, 404);
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => state.errors.push(error.message));
  await page.goto(`${base}/dashboard`);
  return { context, page, state };
}
async function visible(page, text) { await page.getByText(text, { exact: true }).waitFor(); }
async function step(page, number) { await visible(page, `Passo ${number} de 4`); }
async function click(page, name) { await page.getByRole('button', { name, exact: true }).click(); }
async function addTerm(page) {
  await page.getByTestId('offering-terms-input').fill('limpeza');
  await page.getByRole('option', { name: /limpeza predial/ }).click();
  await visible(page, '≈ 37 editais abertos combinam');
}
async function finishBasic(page) {
  await click(page, 'Avançar'); await click(page, 'Avançar'); await click(page, 'Avançar');
  await page.getByLabel('ME ou EPP', { exact: true }).check();
  await click(page, 'Salvar e ver editais');
  await page.getByTestId('guided-completion').waitFor();
}
async function verifyContext({ context, state }) {
  assert.deepEqual(state.errors, [], 'No runtime errors');
  assert.deepEqual(state.unknown, [], 'Every API route is explicitly mocked');
  await context.close();
}
try {
  for (const mobile of [false, true]) for (const theme of ['light', 'dark']) {
    const test = await setup({ theme, mobile }); const { page, state } = test;
    const name = `${mobile ? 'mobile' : 'desktop'}-${theme === 'light' ? 'creme' : 'petroleo'}`;
    await step(page, 1); await addTerm(page);
    await page.screenshot({ path: `${shots}/${name}-inicio.jpg`, quality: 80, fullPage: true });
    await click(page, 'Avançar'); await step(page, 2);
    assert.match(await page.locator(':focus').textContent(), /Onde você atende/);
    await visible(page, '≈ 37 editais abertos combinam');
    await page.getByLabel('Definir minha região', { exact: true }).check();
    await page.getByLabel('SP', { exact: true }).check();
    await page.getByTestId('guided-municipality').fill('São Paulo');
    await click(page, 'São Paulo — SP');
    await page.getByTestId('guided-headquarters').fill('São Paulo');
    await click(page, 'São Paulo — SP');
    await page.getByLabel(/^Raio máximo/).selectOption('200');
    await click(page, 'Voltar'); await step(page, 1);
    await visible(page, '≈ 37 editais abertos combinam');
    await page.getByTestId('offering-terms-input').fill('conservação');
    await page.getByTestId('offering-terms-input').press('Enter');
    await visible(page, '≈ 12 editais abertos combinam');
    await click(page, 'Avançar'); await step(page, 2);
    assert.equal(await page.getByLabel('SP', { exact: true }).isChecked(), true);
    await page.getByRole('button', { name: 'Remover São Paulo-SP' }).waitFor();
    await click(page, 'Pular'); await step(page, 3); await visible(page, '≈ 12 editais abertos combinam');
    await page.getByLabel('Valor mínimo (R$)', { exact: true }).fill('1000');
    await page.getByLabel('Valor máximo (R$)', { exact: true }).fill('50000');
    await click(page, 'Avançar'); await step(page, 4); await visible(page, '≈ 12 editais abertos combinam');
    await page.getByLabel('ME ou EPP', { exact: true }).check();
    await page.getByLabel('Compras.gov.br', { exact: true }).check();
    assert.equal(state.saves.length, 0, 'Only saves on the final action');
    await click(page, 'Salvar e ver editais'); await page.getByTestId('guided-completion').waitFor();
    await page.getByRole('link', { name: 'Conservação de unidades administrativas', exact: true }).waitFor();
    assert.equal(await page.getByTestId('guided-completion').locator('ol li').count(), 3);
    await visible(page, 'Perfil 100%');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${shots}/${name}-conclusao.jpg`, quality: 80, fullPage: true });
    assert.equal(state.saves.length, 1);
    assert.deepEqual(state.saves[0].coverage.states, ['SP']);
    assert.equal(state.saves[0].coverage.radius.km, 200);
    assert.deepEqual(state.saves[0].registeredPlatforms, ['compras-gov']);
    assert.equal(state.saves[0].valueRange.max, 50000);
    await click(page, 'Criar alerta destes editais');
    await page.getByText('Alerta criado.', { exact: false }).waitFor();
    assert.equal(state.alerts.length, 1);
    const savedQuery = new URLSearchParams(state.alerts[0].query);
    assert.equal(savedQuery.get('q'), 'limpeza predial conservação');
    assert.equal(savedQuery.get('status'), 'open');
    assert.equal(savedQuery.get('valueMax'), '50000');
    assert.equal(savedQuery.has('myRegion'), false);
    assert.equal(state.alerts[0].alertsEnabled, true);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'No horizontal overflow');
    await click(page, 'Ir para a Visão geral');
    await page.getByTestId('profile-meter').waitFor();
    assert.equal(await page.getByTestId('guided-onboarding').count(), 0);
    await verifyContext(test); ok(`${name}: navegação, foco, contador em 4 passos, PUT, 3 recomendações, alerta e captura`);
  }
  {
    const test = await setup(); const { page, state } = test;
    await step(page, 1); await click(page, 'Pular'); await step(page, 2); await click(page, 'Pular'); await step(page, 3); await click(page, 'Pular'); await step(page, 4);
    await page.getByLabel('ME ou EPP', { exact: true }).check(); await click(page, 'Salvar e ver editais');
    await step(page, 1); await visible(page, 'Adicione pelo menos um termo do que sua empresa vende ou faz.'); assert.equal(state.saves.length, 0);
    await addTerm(page); await click(page, 'Avançar'); await click(page, 'Avançar');
    await page.getByLabel('Valor mínimo (R$)', { exact: true }).fill('200'); await page.getByLabel('Valor máximo (R$)', { exact: true }).fill('100');
    await click(page, 'Avançar'); await visible(page, 'O valor mínimo deve ser menor ou igual ao máximo.');
    await page.getByLabel('Valor mínimo (R$)', { exact: true }).fill(''); await page.getByLabel('Valor máximo (R$)', { exact: true }).fill(''); await click(page, 'Avançar');
    state.failSave = true; await click(page, 'Salvar e ver editais'); await visible(page, 'Não foi possível salvar o perfil. Seus dados continuam nesta tela. Tente novamente.');
    state.failSave = false; state.noRecommendations = true; await click(page, 'Salvar e ver editais');
    await page.getByTestId('guided-completion').waitFor(); await page.getByText('Ainda não encontramos recomendações', { exact: false }).waitFor();
    await visible(page, 'Perfil 60%');
    state.failAlert = true; await click(page, 'Criar alerta destes editais'); await page.getByText('Não foi possível criar o alerta.', { exact: false }).waitFor();
    state.failAlert = false; await click(page, 'Criar alerta destes editais'); await page.getByText('Alerta criado.', { exact: false }).waitFor();
    await verifyContext(test); ok('pular/voltar, validação, falha de PUT com recuperação, resultado vazio e falha de alerta');
  }
  for (const consent of ['accepted', 'refused']) {
    const test = await setup({ consent }); const { page, state } = test;
    await step(page, 1); await click(page, 'Continuar depois');
    await page.getByTestId('button-dashboard-guided-start').waitFor();
    assert.equal(state.saves.length, 0);
    assert.equal(await page.evaluate(() => !!localStorage.getItem('licita-guided-onboarding-dismissed-v1')), consent === 'accepted');
    await page.reload();
    if (consent === 'accepted') {
      await page.getByTestId('button-dashboard-guided-start').waitFor();
      assert.equal(await page.getByTestId('guided-onboarding').count(), 0);
      state.userId = 'second-account'; await page.reload(); await step(page, 1);
    } else await step(page, 1);
    await verifyContext(test); ok(`dispensa por usuário e recarga com consentimento ${consent}`);
  }
  {
    const test = await setup({ profile: defaultProfile() }); const { page, state } = test;
    await page.getByTestId('button-dashboard-guided-start').waitFor(); await visible(page, 'Perfil 60%');
    await page.screenshot({ path: `${shots}/desktop-creme-visao-geral.jpg`, quality: 80 });
    assert.equal(await page.getByTestId('guided-onboarding').count(), 0);
    await click(page, 'Defina a faixa de valor'); await step(page, 3);
    await click(page, 'Voltar'); await step(page, 2); await click(page, 'Voltar'); await step(page, 1);
    state.failPreview = true;
    await page.getByTestId('offering-terms-input').fill('conservação'); await page.getByTestId('offering-terms-input').press('Enter');
    await visible(page, 'Não foi possível calcular agora.');
    state.failPreview = false; await click(page, 'Tentar novamente'); await visible(page, '≈ 12 editais abertos combinam');
    await click(page, 'Continuar depois');
    await page.goto(`${base}/settings#perfil-empresa`); await page.getByTestId('profile-meter').waitFor(); await visible(page, 'Perfil 60%');
    await verifyContext(test); ok('perfil incompleto abre no item escolhido, contador com erro recuperável e medidor no perfil');
  }
  {
    const test = await setup({ entitled: false }); const { page, state } = test;
    await step(page, 1); await addTerm(page); await finishBasic(page);
    await page.getByRole('link', { name: 'Ver acesso aos alertas', exact: true }).waitFor();
    assert.equal(state.saves.length, 1); assert.equal(state.alerts.length, 0);
    await verifyContext(test); ok('sem assinatura: permite salvar perfil e informa acesso necessário a recomendações e alertas');
  }
  console.log(`Browser checks passed: ${passed}; screenshots: ${shots}`);
} finally { await browser.close(); }
