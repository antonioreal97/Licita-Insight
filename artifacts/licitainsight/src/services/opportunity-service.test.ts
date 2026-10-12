import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ELIGIBILITY, opportunityApiParams, opportunityParamsFromUrl, opportunityParamsToUrl } from './opportunity-service';

test('filtros de tipo e fonte sobrevivem ao round-trip da URL', () => {
  const url = opportunityParamsToUrl({
    q: 'inteligência artificial',
    kind: ['innovation'],
    source: ['finep', 'cnpq'],
    status: ['open'],
  });
  assert.equal(url, '?q=intelig%C3%AAncia+artificial&status=open&kind=innovation&source=finep&source=cnpq');
  assert.deepEqual(opportunityParamsFromUrl(url), {
    q: 'inteligência artificial',
    state: undefined,
    installation: undefined,
    status: ['open'],
    program: undefined,
    kind: ['innovation'],
    source: ['finep', 'cnpq'],
    area: undefined,
    city: undefined,
    organization: undefined,
    deadlineFrom: undefined,
    deadlineTo: undefined,
    includeIndividual: undefined,
    scope: undefined,
    agency: undefined,
    region: undefined,
    country: undefined,
    language: undefined,
    opportunityType: undefined,
    eligibility: undefined,
    funding: undefined,
    page: undefined,
  });
});

test('anúncios de proponentes individuais ficam de fora, a menos que a URL peça', () => {
  assert.equal(opportunityParamsFromUrl('?state=CE').includeIndividual, undefined);
  assert.equal(opportunityParamsFromUrl('?individual=0').includeIndividual, undefined);
  const parsed = opportunityParamsFromUrl('?state=CE&individual=1');
  assert.equal(parsed.includeIndividual, true);
  assert.equal(opportunityParamsToUrl(parsed), '?state=CE&individual=1');
  assert.equal(opportunityParamsToUrl({ ...parsed, includeIndividual: undefined }), '?state=CE');
});

test('filtros de área, UF, município e instituição sobrevivem ao round-trip da URL', () => {
  const url = opportunityParamsToUrl({
    state: ['RN'],
    area: ['audiovisual', 'musica'],
    city: ['Natal'],
    organization: ['Secretaria de Cultura de Natal'],
  });
  assert.equal(url, '?state=RN&area=audiovisual&area=musica&city=Natal&organization=Secretaria+de+Cultura+de+Natal');
  const parsed = opportunityParamsFromUrl(url);
  assert.deepEqual(parsed.state, ['RN']);
  assert.deepEqual(parsed.area, ['audiovisual', 'musica']);
  assert.deepEqual(parsed.city, ['Natal']);
  assert.deepEqual(parsed.organization, ['Secretaria de Cultura de Natal']);
  assert.equal(opportunityParamsToUrl(parsed), url);
});

test('área desconhecida e nomes vazios ou longos demais são descartados', () => {
  const parsed = opportunityParamsFromUrl(`?area=cinema&area=teatro&city=+&city=Natal&city=Natal&organization=${'x'.repeat(201)}`);
  assert.deepEqual(parsed.area, ['teatro']);
  assert.deepEqual(parsed.city, ['Natal']);
  assert.equal(parsed.organization, undefined);
});

test('valores desconhecidos de tipo e fonte são descartados', () => {
  const parsed = opportunityParamsFromUrl('?kind=unknown&kind=funding&source=portal-privado&source=capes');
  assert.deepEqual(parsed.kind, ['funding']);
  assert.deepEqual(parsed.source, ['capes']);
});

test('fontes federais de cultura passam pelo filtro de fonte', () => {
  const url = '?source=transferegov&source=funarte&source=minc&source=salic';
  const parsed = opportunityParamsFromUrl(url);
  assert.deepEqual(parsed.source, ['transferegov', 'funarte', 'minc', 'salic']);
  assert.equal(opportunityParamsToUrl(parsed), url);
});

test('aba internacional e seus filtros sobrevivem ao round-trip da URL', () => {
  const url = opportunityParamsToUrl({
    scope: 'international',
    agency: ['Banco Mundial'],
    region: ['africa'],
    country: ['BR'],
    language: ['fr'],
    opportunityType: ['Obras'],
    eligibility: ['yes'],
    funding: ['no'],
    page: 2,
  });
  assert.equal(
    url,
    '?scope=international&agency=Banco+Mundial&region=africa&country=BR&language=fr&opportunityType=Obras&eligibility=yes&funding=no&page=2',
  );
  const parsed = opportunityParamsFromUrl(url);
  assert.equal(parsed.scope, 'international');
  assert.deepEqual(parsed.agency, ['Banco Mundial']);
  assert.deepEqual(parsed.region, ['africa']);
  assert.deepEqual(parsed.country, ['BR']);
  assert.deepEqual(parsed.language, ['fr']);
  assert.deepEqual(parsed.opportunityType, ['Obras']);
  assert.deepEqual(parsed.eligibility, ['yes']);
  assert.deepEqual(parsed.funding, ['no']);
  assert.equal(opportunityParamsToUrl(parsed), url);
});

test('a URL sem escopo é a lista nacional, e valores desconhecidos são descartados', () => {
  assert.equal(opportunityParamsFromUrl('').scope, undefined);
  assert.equal(opportunityParamsFromUrl('?scope=national').scope, undefined);
  assert.equal(opportunityParamsFromUrl('?scope=all').scope, undefined);
  assert.equal(opportunityParamsToUrl({ scope: 'national' }), '');
  const parsed = opportunityParamsFromUrl('?scope=international&region=antartida&eligibility=talvez&country=bra&country=br&language=EN');
  assert.equal(parsed.region, undefined);
  assert.equal(parsed.eligibility, undefined);
  assert.deepEqual(parsed.country, ['BR']);
  assert.deepEqual(parsed.language, ['en']);
});

test('aba internacional abre em "aberto ou condicional"; "todas" fica só na URL', () => {
  // Sem `eligibility` na URL, a API recebe os dois selos que um brasileiro pode disputar.
  assert.deepEqual(opportunityApiParams(opportunityParamsFromUrl('?scope=international')).eligibility, DEFAULT_ELIGIBILITY);
  assert.deepEqual(DEFAULT_ELIGIBILITY, ['yes', 'conditional']);
  // `eligibility=all` tira o filtro e nunca vai à API.
  const all = opportunityParamsFromUrl('?scope=international&eligibility=all');
  assert.equal(all.eligibility, 'all');
  assert.equal(opportunityParamsToUrl(all), '?scope=international&eligibility=all');
  assert.equal(opportunityApiParams(all).eligibility, undefined);
  assert.equal(opportunityApiParams(all).scope, 'international');
  // Um selo escolhido vai como está.
  assert.deepEqual(opportunityApiParams(opportunityParamsFromUrl('?scope=international&eligibility=no')).eligibility, ['no']);
});

test('filtros de um lado do hub não vazam para o outro', () => {
  // Na lista nacional, sobras de filtros internacionais na URL não vão à API.
  const national = opportunityApiParams(opportunityParamsFromUrl('?state=CE&region=africa&eligibility=yes&agency=Banco+Mundial&language=fr'));
  assert.equal(national.scope, undefined);
  assert.deepEqual(national.state, ['CE']);
  assert.equal(national.region, undefined);
  assert.equal(national.eligibility, undefined);
  assert.equal(national.agency, undefined);
  assert.equal(national.language, undefined);
  // Na aba internacional, UF, município, área e anúncios individuais não se aplicam.
  const international = opportunityApiParams(opportunityParamsFromUrl('?scope=international&state=CE&city=Sobral&area=musica&individual=1&q=solar&status=open'));
  assert.equal(international.state, undefined);
  assert.equal(international.city, undefined);
  assert.equal(international.area, undefined);
  assert.equal(international.includeIndividual, undefined);
  assert.equal(international.q, 'solar');
  assert.deepEqual(international.status, ['open']);
});
