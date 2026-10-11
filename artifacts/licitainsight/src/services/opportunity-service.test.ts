import assert from 'node:assert/strict';
import { test } from 'node:test';
import { opportunityParamsFromUrl, opportunityParamsToUrl } from './opportunity-service';

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
    page: undefined,
  });
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
