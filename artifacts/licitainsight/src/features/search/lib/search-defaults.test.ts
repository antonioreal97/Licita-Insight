import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SearchFacets, TenderSearchParams } from '@/api/types';
import { searchParamsFromUrl } from '@/services/search-service';
import { SearchModeControl } from '../components/search-mode-control';
import { rememberFacetLabels } from './facet-config';
import { buildFilterChips } from './filter-chips';
import { readRememberedSearch, rememberSearch } from './search-navigation-state';
import { savedQueryHref, searchDefaultsToUrl, withoutFilters, withSearchDefaults } from './search-defaults';

// `parsed` stands for `searchParamsFromUrl(search)`, which keeps only valid statuses (drops `all` and `bogus`).
const fromUrl = (parsed: TenderSearchParams, search: string) => withSearchDefaults(parsed, search);

test('sem status na URL, a busca abre em Abertos e a URL continua sem status', () => {
  assert.deepEqual(fromUrl({}, '').status, ['open']);
  const params = fromUrl({ q: 'limpeza' }, 'q=limpeza');
  assert.deepEqual(params, { q: 'limpeza', status: ['open'] });
  assert.deepEqual(searchDefaultsToUrl(params), { q: 'limpeza' });
  assert.deepEqual(fromUrl({}, 'status=bogus').status, ['open'], 'status inválido cai no padrão');
});

test('"Todos os status" fica na URL como status=all e sobrevive ao recarregar', () => {
  const unchecked = { q: 'obra', status: [] };
  const url = searchDefaultsToUrl(unchecked);
  assert.deepEqual(url, { q: 'obra', status: ['all'] });
  const reloaded = fromUrl({ q: 'obra' }, 'q=obra&status=all');
  assert.equal(reloaded.status, undefined, 'a API recebe a busca sem filtro de status');
  assert.deepEqual(searchDefaultsToUrl(reloaded), url);
});

test('status explícito (link do painel, busca salva) é mantido como está', () => {
  const params = fromUrl({ status: ['closed', 'open'] }, 'status=open&status=closed');
  assert.deepEqual(params.status, ['closed', 'open']);
  assert.deepEqual(searchDefaultsToUrl(params), params);
  assert.deepEqual(fromUrl({ status: ['open'], sort: 'deadline_asc' }, 'status=open&sort=deadline_asc').status, ['open']);
});

test('limpar filtros volta ao padrão Abertos e mantém termo, ordem e tamanho de página', () => {
  const cleared = withoutFilters({ q: 'merenda', sort: 'deadline_asc', pageSize: 50, page: 3, state: ['SP'], valueMin: 1000, deadlineTo: '2026-12-31' });
  assert.deepEqual(cleared, { q: 'merenda', sort: 'deadline_asc', pageSize: 50, status: ['open'] });
  assert.deepEqual(withoutFilters({}), { status: ['open'] }, 'também desfaz "Todos os status"');
  assert.deepEqual(searchDefaultsToUrl(cleared), { q: 'merenda', sort: 'deadline_asc', pageSize: 50 });
});

test('chips deixam claro quando o padrão está aplicado e quando são todos os status', () => {
  const [chip] = buildFilterChips({ status: ['open'] }, { statusDefault: true });
  assert.equal(chip.label, 'Aberto (padrão)');
  assert.deepEqual(chip.remove, { status: [] }, 'remover o padrão mostra todos os status');

  const [all] = buildFilterChips({}, { statusDefault: true });
  assert.deepEqual(all, { id: 'status:all', group: 'Status', label: 'Todos', remove: { status: ['open'] } });

  assert.deepEqual(
    buildFilterChips({ status: ['open', 'closed'] }, { statusDefault: true }).map((item) => item.label),
    ['Aberto', 'Encerrado'],
    'escolha explícita não leva "(padrão)"',
  );
  assert.deepEqual(buildFilterChips({}), [], 'fora da página de busca (resumo de busca salva), sem status é só sem filtro');
});

test('link antigo com mode=semantic vira busca por palavra-chave, sem seletor nem aviso', () => {
  const params = fromUrl({ q: 'software', mode: 'semantic' }, 'q=software&mode=semantic');
  assert.equal(params.mode, undefined);
  assert.deepEqual(searchDefaultsToUrl(params), { q: 'software' });
  const markup = renderToStaticMarkup(
    createElement(SearchModeControl, { mode: 'semantic', appliedMode: 'keyword', fallbackReason: 'not_available', onChange: () => undefined }),
  );
  assert.equal(markup, '');
});

test('busca salva sem status abre com todos os status; com status, abre igual', () => {
  assert.equal(savedQueryHref('q=limpeza&state=DF'), '/search?q=limpeza&state=DF&status=all');
  assert.equal(savedQueryHref(''), '/search?status=all');
  assert.equal(savedQueryHref('q=limpeza&status=open'), '/search?q=limpeza&status=open');
});

test('estado da busca permanece na navegação da aba até voltar ao padrão', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  rememberSearch('?state=SP&modality=dispensa&view=table', storage);
  assert.equal(readRememberedSearch(storage), 'state=SP&modality=dispensa&view=table');

  rememberSearch('', storage);
  assert.equal(readRememberedSearch(storage), '');
});

test('filtro de plataforma vem da URL, vira chip com o nome da faceta e sai em "limpar filtros"', () => {
  const params = searchParamsFromUrl('platform=licitanet&platform=bll');
  assert.deepEqual(params.platform, ['bll', 'licitanet']);
  rememberFacetLabels({ platform: [{ value: 'licitanet', label: 'Licitanet', count: 12 }] } as SearchFacets);
  const chips = buildFilterChips(params).filter((chip) => chip.group === 'Plataforma de disputa');
  assert.deepEqual(
    chips.map((chip) => [chip.label, chip.remove]),
    [
      ['bll', { platform: ['licitanet'] }],
      ['Licitanet', { platform: ['bll'] }],
    ],
  );
  assert.equal(withoutFilters(params).platform, undefined);
});
