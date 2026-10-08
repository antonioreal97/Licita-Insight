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
    deadlineFrom: undefined,
    deadlineTo: undefined,
    page: undefined,
  });
});

test('valores desconhecidos de tipo e fonte são descartados', () => {
  const parsed = opportunityParamsFromUrl('?kind=unknown&kind=funding&source=portal-privado&source=capes');
  assert.deepEqual(parsed.kind, ['funding']);
  assert.deepEqual(parsed.source, ['capes']);
});
