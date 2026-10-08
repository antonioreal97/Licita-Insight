import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsPagePath } from './analytics-route';

test('remove query string and fragment from page paths', () => {
  assert.equal(analyticsPagePath('/saved-searches#saved-search-abc'), '/saved-searches');
});

test('maps every search URL to the route name without the search term', () => {
  assert.equal(analyticsPagePath('/search?q=nome%40empresa.com&organizationId=123'), '/search');
  assert.equal(analyticsPagePath('/search?cnpj=00.000.000/0001-00'), '/search');
});

test('removes resource IDs that can contain a CNPJ', () => {
  assert.equal(analyticsPagePath('/tenders/00394460000141-1-000124-2026?source=dashboard'), '/tenders/:id');
  assert.equal(analyticsPagePath('/oportunidades/42'), '/oportunidades/:id');
});
