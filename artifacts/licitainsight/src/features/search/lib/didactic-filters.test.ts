import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SearchFacets, TenderSearchParams } from '@/api/types';
import { searchParamsFromUrl, searchParamsToUrl } from '@/services/search-service';
import { countMoreFilters, FacetPanel } from '../components/facet-panel';
import { appliedMessage, applyLabel } from '../components/filters-sheet';
import { buildFilterChips, chipShowsGroup } from './filter-chips';
import { activeDeadlinePreset, activeValuePreset, deadlinePresetPatch, VALUE_PRESETS, valuePresetPatch } from './filter-presets';
import { searchDefaultsToUrl, withSearchDefaults } from './search-defaults';

// Intl separates "R$" from the number with a no-break space.
const plain = (text: string) => text.replace(/ /g, ' ');
const now = new Date(2026, 9, 15, 10, 30);

const facets: SearchFacets = {
  status: [
    { value: 'open', label: 'Aberta', count: 120 },
    { value: 'closed', label: 'Encerrada', count: 40 },
  ],
  modality: [
    { value: 'pregao_eletronico', label: 'Pregão Eletrônico', count: 80 },
    { value: 'dispensa', label: 'Dispensa', count: 30 },
  ],
  state: ['SP', 'MG', 'RJ', 'BA', 'PR', 'RS', 'PE'].map((uf, index) => ({ value: uf, label: uf, count: 70 - index * 10 })),
  city: [{ value: '3550308', label: 'São Paulo/SP', count: 12 }],
  source: [{ value: 'pncp', label: 'PNCP', count: 160 }],
  category: [{ value: 'limpeza', label: 'Limpeza e conservação', count: 25 }],
  organization: [{ value: 'org-1', label: 'Prefeitura de Exemplo', count: 9 }],
  platform: [{ value: 'licitanet', label: 'Licitanet', count: 15 }],
  valueRange: { min: 1000, max: 2_000_000 },
  newCount: 7,
};

const render = (params: TenderSearchParams, withFacets: SearchFacets | null = facets) =>
  renderToStaticMarkup(createElement(FacetPanel, { params, facets: withFacets, onChange: () => undefined }));

test('o painel começa por quatro perguntas simples e deixa o resto em "Mais filtros", recolhido', () => {
  const html = render({ status: ['open'] });
  const order = ['Onde?', 'O quê?', 'Até quando?', 'Quanto?', 'Mais filtros'].map((title) => html.indexOf(`>${title}<`));
  assert.ok(order.every((index) => index >= 0), 'todas as perguntas aparecem');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'na ordem Onde → O quê → Até quando → Quanto → Mais filtros');
  assert.match(html, /aria-expanded="false"[^>]*data-testid="button-more-filters"/);
  assert.match(html, /<div[^>]*hidden=""[^>]*data-testid="more-filters"/);
  // Cada pergunta tem uma linha de ajuda em português comum.
  assert.match(html, /Último dia para enviar a proposta\./);
  assert.match(html, /Muitos editais não informam o valor/);
  assert.match(html, /Pregão eletrônico é o mais comum para quem está começando\./);
});

test('estados mostram o nome por extenso, poucas opções e "Ver todas"', () => {
  const html = render({});
  assert.match(html, /São Paulo \(SP\)/);
  assert.match(html, /data-testid="button-facet-more-state"[^>]*>Ver todas \(7\)</);
  assert.doesNotMatch(html, /Pernambuco/, 'o sétimo estado fica atrás de "Ver todas"');
});

test('município só aparece depois de escolher um estado (ou a pedido)', () => {
  const without = render({});
  assert.doesNotMatch(without, /data-testid="facet-city"/);
  assert.match(without, /Escolha um estado para ver os municípios/);
  assert.match(without, /data-testid="button-look-up-city"/);
  const withState = render({ state: ['SP'] });
  assert.match(withState, /data-testid="facet-city"/);
  assert.match(withState, /São Paulo\/SP/);
  assert.match(render({ city: ['3550308'] }), /data-testid="facet-city"/, 'link antigo só com município continua mostrando o município');
});

test('"Mais filtros" conta o que está ativo lá dentro; o status padrão não conta, "todas as situações" conta', () => {
  assert.equal(countMoreFilters({ status: ['open'] }), 0);
  assert.equal(countMoreFilters({ status: ['open'], state: ['SP'], category: ['limpeza'], valueMax: 50_000 }), 0, 'as perguntas principais ficam de fora');
  assert.equal(countMoreFilters({}), 1, 'sem status = todas as situações');
  assert.equal(countMoreFilters({ status: ['open'], modality: ['pregao_eletronico', 'dispensa'], platform: ['licitanet'], newOnly: true }), 4);
  assert.equal(countMoreFilters({ status: ['closed', 'open'], organizationId: ['org-1'], sourceId: ['pncp'] }), 4);
  assert.match(render({ status: ['open'], modality: ['dispensa'], newOnly: true }), /data-testid="badge-more-filters"[^>]*>2<span class="sr-only"> ativos<\/span>/);
  assert.doesNotMatch(render({ status: ['open'] }), /badge-more-filters/);
});

test('atalhos de prazo geram exatamente deadlineFrom=hoje e deadlineTo=hoje+N, como antes', () => {
  assert.deepEqual(deadlinePresetPatch(7, now), { deadlineFrom: '2026-10-15', deadlineTo: '2026-10-22' });
  assert.deepEqual(deadlinePresetPatch(30, now), { deadlineFrom: '2026-10-15', deadlineTo: '2026-11-14' });
  assert.equal(searchParamsToUrl(searchDefaultsToUrl({ status: ['open'], ...deadlinePresetPatch(15, now) })), '?deadlineFrom=2026-10-15&deadlineTo=2026-10-30');
  assert.equal(activeDeadlinePreset({ deadlineFrom: '2026-10-15', deadlineTo: '2026-10-22' }, now), 7);
  assert.equal(activeDeadlinePreset({ deadlineFrom: '2026-10-14', deadlineTo: '2026-10-21' }, now), undefined, 'link de ontem vira período personalizado');
});

test('atalhos de valor geram só valueMin/valueMax e chips legíveis', () => {
  assert.deepEqual(
    VALUE_PRESETS.map((preset) => searchParamsToUrl(valuePresetPatch(preset))),
    ['?valueMax=50000', '?valueMin=50000&valueMax=500000', '?valueMin=500000'],
  );
  assert.equal(activeValuePreset({ valueMin: 50_000, valueMax: 500_000 })?.id, '50-a-500-mil');
  assert.equal(activeValuePreset({ valueMin: 1_000 }), undefined);
  assert.deepEqual(
    VALUE_PRESETS.map((preset) => plain(buildFilterChips(valuePresetPatch(preset))[0].label)),
    ['Até R$ 50 mil', 'R$ 50 mil a R$ 500 mil', 'A partir de R$ 500 mil'],
  );
});

test('URLs antigas continuam abrindo e mostram chips legíveis, um por filtro, cada um removível', () => {
  const search =
    'state=SP&modality=pregao_eletronico&platform=licitanet&valueMin=1000&deadlineFrom=2026-10-15&deadlineTo=2026-10-22&publishedFrom=2026-10-01&newOnly=true';
  const params = withSearchDefaults(searchParamsFromUrl(search), search);
  assert.deepEqual(params.status, ['open'], 'sem status na URL, abre em Abertos como hoje');
  const chips = buildFilterChips(params, { statusDefault: true, now });
  assert.deepEqual(
    chips.map((chip) => [chip.id, plain(chip.label), chipShowsGroup(chip)]),
    [
      ['status:open', 'Abertos (padrão)', false],
      ['modality:pregao_eletronico', 'Pregão eletrônico', false],
      ['state:SP', 'SP', false],
      ['platform:licitanet', 'licitanet', true],
      ['value', 'A partir de R$ 1 mil', false],
      ['deadline', 'Encerra em até 7 dias', false],
      ['published', 'Publicado a partir de 01 de out de 2026', false],
      ['newOnly', 'Entraram nas últimas 24 h', false],
    ],
  );
  assert.deepEqual(chips.find((chip) => chip.id === 'deadline')!.remove, { deadlineFrom: undefined, deadlineTo: undefined });
  assert.deepEqual(chips.find((chip) => chip.id === 'value')!.remove, { valueMin: undefined, valueMax: undefined });

  const custom = buildFilterChips({ deadlineTo: '2026-12-31' }, { now });
  assert.equal(custom[0].label, 'Encerra até 31 de dez de 2026');
  assert.equal(buildFilterChips({ deadlineFrom: '2026-11-01', deadlineTo: '2026-11-30' }, { now })[0].label, 'Encerra entre 01 de nov de 2026 e 30 de nov de 2026');
  assert.deepEqual(searchDefaultsToUrl(withSearchDefaults(searchParamsFromUrl('status=all'), 'status=all')), { status: ['all'], pageSize: 20 });
});

test('período ou valor personalizado vindo da URL deixa os campos livres abertos', () => {
  assert.match(render({ deadlineTo: '2026-12-31' }), /aria-expanded="true"[^>]*data-testid="button-deadline-dates"/);
  assert.match(render({ deadlineFrom: toDay(), deadlineTo: plusDays(7) }), /aria-expanded="false"[^>]*data-testid="button-deadline-dates"/);
  assert.match(render({ valueMin: 1_000 }), /aria-expanded="true"[^>]*data-testid="button-value-custom"/);
  assert.match(render({ valueMax: 50_000 }), /aria-pressed="true"[^>]*data-testid="button-value-ate-50-mil"/);
});

test('acessibilidade básica: perguntas rotuladas, atalhos com aria-pressed, ajuda do glossário e contagens faladas', () => {
  const html = render({ status: ['open'] });
  const sections = html.match(/<section aria-labelledby="[^"]+"[^>]*data-testid="filter-question"/g) ?? [];
  assert.equal(sections.length, 4);
  assert.match(html, /aria-label="Encerra em até 7 dias"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*aria-label="Encerra em até 7 dias"/);
  assert.match(html, /aria-label="O que é Valor estimado\?"/);
  assert.match(html, /aria-label="O que é Proposta\?"/);
  assert.match(html, /aria-label="O que é Plataforma de disputa\?"/);
  assert.match(html, /<span class="sr-only"> editais<\/span>/);
  // Só tokens do design system: nenhuma cor literal (o único style= é o input escondido do checkbox do Radix).
  assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  assert.doesNotMatch(html, /\b(?:bg|text|border)-(?:red|blue|green|yellow|gray|slate|zinc|emerald|amber|indigo|purple|pink|orange)-\d/);
});

test('sem facetas (erro) o painel avisa e mantém prazo e valor utilizáveis', () => {
  const html = render({}, null);
  assert.match(html, /Algumas opções estão indisponíveis/);
  assert.match(html, /data-testid="button-deadline-7"/);
  assert.match(html, /data-testid="button-value-ate-50-mil"/);
});

test('o botão principal da folha diz quantos editais e o leitor de tela ouve o resultado ao aplicar', () => {
  assert.equal(applyLabel(undefined), 'Ver editais');
  assert.equal(applyLabel(1), 'Ver 1 edital');
  assert.equal(applyLabel(1234), 'Ver 1.234 editais');
  assert.equal(applyLabel(10_000, true), 'Ver aprox. 10.000 editais');
  assert.equal(appliedMessage(12), 'Filtros aplicados: 12 editais.');
  assert.equal(appliedMessage(undefined), 'Filtros aplicados.');
});

function toDay() {
  return deadlinePresetPatch(7).deadlineFrom!;
}
function plusDays(days: number) {
  return deadlinePresetPatch(days).deadlineTo!;
}
