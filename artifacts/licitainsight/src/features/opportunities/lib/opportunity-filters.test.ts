import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OpportunitySearchParams, OpportunitySearchResponse } from '@/api';
import { OpportunityFilters } from '../components/opportunity-filters';
import { deadlinePresetPatch } from '@/features/search/lib/filter-presets';
import { opportunityParamsFromUrl, opportunityParamsToUrl } from '@/services/opportunity-service';
import {
  areaCounts,
  areaOptions,
  cityOptions,
  cityPatch,
  countMoreOpportunityFilters,
  individualListingsLabel,
  opportunityChipShowsGroup,
  opportunityFilterChips,
  organizationOptions,
  selectedCityValue,
  stateOptions,
  statePatch,
} from './opportunity-filters';

const facets: NonNullable<OpportunitySearchResponse['facets']> = {
  status: [],
  state: [
    { value: 'CE', label: 'CE', count: 33 },
    { value: 'MG', label: 'MG', count: 3 },
  ],
  installation: [],
  program: [],
  kind: [],
  source: [],
  area: [
    { value: 'musica', label: 'Música', count: 1240 },
    { value: 'audiovisual', label: 'Audiovisual', count: 12 },
    { value: 'teatro', label: 'Teatro', count: 12 },
    { value: 'outras', label: 'Outras áreas', count: 5000 },
    { value: 'area-nova', label: 'Área que este cliente não conhece', count: 4 },
  ],
  city: [
    { value: 'Santa Luzia', label: 'Santa Luzia (MG)', count: 2, state: 'MG' },
    { value: 'Natal', label: 'Natal (RN)', count: 3, state: 'RN' },
    { value: 'Santa Luzia', label: 'Santa Luzia (PB)', count: 1, state: 'PB' },
  ],
  organization: [
    { value: 'Prefeitura de Natal', label: 'Prefeitura de Natal', count: 3 },
    { value: 'Secult CE', label: 'Secult CE', count: 20 },
  ],
};

const noop = () => undefined;
const render = (params: OpportunitySearchParams, withFacets: typeof facets | null = facets, hiddenIndividualListings = 0) =>
  renderToStaticMarkup(createElement(OpportunityFilters, { params, facets: withFacets, hiddenIndividualListings, onChange: noop }));

test('áreas aparecem com contagem, da maior para a menor; empates seguem a ordem canônica e "Outras áreas" fecha a lista', () => {
  assert.deepEqual(
    areaOptions(facets).map((option) => [option.value, option.label]),
    [
      ['musica', 'Música (1.240)'],
      ['audiovisual', 'Audiovisual (12)'],
      ['teatro', 'Teatro (12)'],
      ['outras', 'Outras áreas (5.000)'],
    ],
  );
});

test('a área selecionada continua na lista mesmo sem chamadas nos outros filtros', () => {
  assert.deepEqual(areaOptions(facets, ['circo']).at(-2), { value: 'circo', label: 'Circo (0)', count: 0 });
  assert.deepEqual(areaOptions(null, ['circo']), [{ value: 'circo', label: 'Circo (0)', count: 0 }]);
  assert.deepEqual(areaOptions(null), []);
});

test('contagem por área ignora valores que o cliente não conhece', () => {
  assert.deepEqual(
    areaCounts(facets).map((row) => [row.area, row.count]),
    [
      ['musica', 1240],
      ['audiovisual', 12],
      ['teatro', 12],
      ['outras', 5000],
    ],
  );
  assert.deepEqual(areaCounts(null), []);
});

test('municípios homônimos ficam separados pela UF', () => {
  const options = cityOptions(facets, {});
  assert.deepEqual(
    options.map((option) => [option.value, option.label]),
    [
      ['RN|Natal', 'Natal (RN) (3)'],
      ['MG|Santa Luzia', 'Santa Luzia (MG) (2)'],
      ['PB|Santa Luzia', 'Santa Luzia (PB) (1)'],
    ],
  );
  assert.deepEqual(cityPatch('PB|Santa Luzia'), { city: ['Santa Luzia'], state: ['PB'] });
  assert.deepEqual(cityPatch(''), { city: undefined });
  assert.equal(selectedCityValue(facets, { city: ['Santa Luzia'], state: ['PB'] }), 'PB|Santa Luzia');
  assert.equal(selectedCityValue(facets, {}), '');
});

test('trocar a UF descarta o município de outra UF e mantém o da mesma', () => {
  assert.deepEqual(statePatch('CE', facets, { city: ['Natal'], state: ['RN'] }), { state: ['CE'], city: undefined });
  assert.deepEqual(statePatch('RN', facets, { city: ['Natal'] }), { state: ['RN'] });
  assert.deepEqual(statePatch('', facets, { city: ['Natal'], state: ['RN'] }), { state: undefined });
});

test('instituições vêm da maior para a menor e a selecionada não some', () => {
  assert.deepEqual(
    organizationOptions(facets, { organization: ['Funarte'] }).map((option) => option.label),
    ['Secult CE (20)', 'Prefeitura de Natal (3)', 'Funarte (0)'],
  );
});

test('UFs mostram a contagem quando há chamadas', () => {
  assert.deepEqual(
    stateOptions(['AC', 'CE', 'MG'], facets).map((option) => option.label),
    ['AC', 'CE (33)', 'MG (3)'],
  );
});

test('os filtros renderizam área, município e instituição com o valor selecionado', () => {
  const html = render({ area: ['audiovisual'], city: ['Natal'], state: ['RN'], organization: ['Secult CE'] });
  assert.match(html, /aria-pressed="true"[^>]*data-testid="button-opportunity-area-audiovisual"/);
  assert.match(html, /data-testid="select-opportunity-city"/);
  assert.match(html, /<option value="RN\|Natal" selected="">Natal \(RN\) \(3\)<\/option>/);
  assert.match(html, /data-testid="select-opportunity-organization"/);
  assert.match(html, /<option value="Secult CE" selected="">Secult CE \(20\)<\/option>/);
});

test('a contagem por área marca a área ativa e só usa classes do design system', () => {
  const html = render({ area: ['audiovisual'] });
  assert.match(html, /role="group" aria-label="Área cultural"/);
  assert.match(html, /aria-pressed="true"[^>]*data-testid="button-opportunity-area-audiovisual"/);
  assert.match(html, /aria-pressed="false"[^>]*data-testid="button-opportunity-area-musica"/);
  assert.match(html, /Música<span[^>]*>1\.240<\/span>/);
  // Paleta só por tokens: nenhuma cor literal nem cor fora do tema no markup.
  assert.doesNotMatch(html, /#[0-9a-f]{3,8}\b|rgb\(|hsl\(|style=/i);
  assert.doesNotMatch(html, /\b(?:bg|text|border)-(?:red|blue|green|yellow|gray|slate|zinc|emerald|amber|indigo|purple|pink|orange)-\d/);
});

test('sem facetas a faixa de áreas não aparece e os filtros ficam só com a opção geral', () => {
  const html = render({}, null);
  assert.doesNotMatch(html, /list-opportunity-areas/);
  assert.match(html, /Nenhuma área com chamadas nestes filtros/);
  assert.match(html, /Todos os estados/);
  assert.match(html, /Todas as instituições/);
});

test('anúncios de proponentes individuais: desligado por padrão, com a contagem do que ficou de fora', () => {
  assert.equal(individualListingsLabel(0, false), 'Incluir anúncios de proponentes individuais');
  assert.equal(individualListingsLabel(1240, false), 'Incluir anúncios de proponentes individuais (1.240)');
  assert.equal(individualListingsLabel(7, true), 'Incluir anúncios de proponentes individuais');

  const off = render({}, facets, 7);
  assert.match(off, /data-testid="checkbox-opportunity-individual"/);
  assert.doesNotMatch(off, /data-testid="checkbox-opportunity-individual"[^>]*checked/);
  assert.match(off, /Incluir anúncios de proponentes individuais \(7\)/);
  assert.match(render({ includeIndividual: true }, facets, 0), /data-testid="checkbox-opportunity-individual"[^>]*checked/);
});

test('oportunidades seguem o mesmo padrão: Onde? O quê? Até quando? e "Mais filtros" recolhido', () => {
  const html = render({});
  const order = ['Onde?', 'O quê?', 'Até quando?', 'Mais filtros'].map((title) => html.indexOf(`>${title}<`));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(html, /aria-expanded="false"[^>]*data-testid="button-opportunity-more-filters"/);
  assert.match(html, /<div[^>]*hidden=""[^>]*data-testid="opportunity-more-filters"/);
  assert.match(html, /Escolha um estado para ver os municípios/);
  assert.doesNotMatch(html, /select-opportunity-city/, 'município só depois do estado');
  assert.match(render({ state: ['CE'] }), /select-opportunity-city/);
  assert.match(html, /aria-label="Inscrições encerram em até 7 dias"/);
});

test('áreas: poucas de início, "Ver todas" e a selecionada nunca some', () => {
  const many = {
    ...facets,
    area: ['musica', 'audiovisual', 'teatro', 'danca', 'circo', 'literatura', 'patrimonio', 'artesanato'].map((value, index) => ({ value, label: value, count: 100 - index })),
  };
  const html = render({}, many);
  assert.match(html, /data-testid="button-opportunity-areas-more"[^>]*>Ver todas \(8\)</);
  assert.doesNotMatch(html, /button-opportunity-area-artesanato/);
  assert.match(render({ area: ['artesanato'] }, many), /aria-pressed="true"[^>]*data-testid="button-opportunity-area-artesanato"/);
  assert.match(render({ area: ['gastronomia'] }), /data-testid="button-opportunity-area-gastronomia"[^>]*>Gastronomia/);
});

test('"Mais filtros" das oportunidades conta instituição, fonte e anúncios individuais', () => {
  assert.equal(countMoreOpportunityFilters({ state: ['CE'], area: ['musica'] }), 0);
  assert.equal(countMoreOpportunityFilters({ organization: ['Secult CE'], source: ['mapas'], includeIndividual: true }), 3);
  assert.match(render({ organization: ['Secult CE'] }), /data-testid="badge-opportunity-more-filters"[^>]*>1<span class="sr-only"> ativo<\/span>/);
  assert.doesNotMatch(render({}), /badge-opportunity-more-filters/);
});

test('URL antiga de oportunidades vira chips legíveis, e o atalho de prazo usa os mesmos parâmetros', () => {
  const now = new Date(2026, 9, 15, 9);
  const preset = deadlinePresetPatch(7, now);
  const search = `state=RN&city=Natal&area=musica&kind=culture&status=open&organization=Secult+CE&individual=1&deadlineFrom=${preset.deadlineFrom}&deadlineTo=${preset.deadlineTo}`;
  const params = opportunityParamsFromUrl(search);
  assert.deepEqual(opportunityParamsFromUrl(opportunityParamsToUrl(params)), params, 'a URL continua estável');
  assert.deepEqual([params.deadlineFrom, params.deadlineTo], ['2026-10-15', '2026-10-22']);
  const chips = opportunityFilterChips(params, now);
  assert.deepEqual(
    chips.map((chip) => [chip.id, chip.label, opportunityChipShowsGroup(chip)]),
    [
      ['state:RN', 'RN', false],
      ['city:Natal', 'Natal', false],
      ['area:musica', 'Música', false],
      ['kind:culture', 'Cultura', false],
      ['status:open', 'Inscrições abertas', false],
      ['deadline', 'Inscrições encerram em até 7 dias', false],
      ['organization:Secult CE', 'Secult CE', true],
      ['individual', 'Com anúncios de pessoas físicas', false],
    ],
  );
  assert.deepEqual(chips[0].remove, { state: undefined, city: undefined }, 'tirar o estado tira o município dele');
  assert.equal(opportunityFilterChips({ deadlineTo: '2026-12-31' }, now)[0].label, 'Inscrições encerram até 31 de dez de 2026');
  assert.deepEqual(
    opportunityFilterChips({ scope: 'international', state: ['CE'], kind: ['funding'] }, now).map((chip) => chip.id),
    ['kind:funding'],
    'na aba internacional, filtros nacionais esquecidos na URL não viram chip',
  );
});
