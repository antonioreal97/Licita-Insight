import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OpportunitySearchParams, OpportunitySearchResponse } from '@/api';
import { OpportunityFilters } from '../components/opportunity-filters';
import { areaCounts, areaOptions, cityOptions, cityPatch, organizationOptions, selectedCityValue, stateOptions, statePatch } from './opportunity-filters';

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
const render = (params: OpportunitySearchParams, withFacets: typeof facets | null = facets) =>
  renderToStaticMarkup(createElement(OpportunityFilters, { params, facets: withFacets, onChange: noop }));

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
  assert.match(html, /data-testid="select-opportunity-area"/);
  assert.match(html, /<option value="audiovisual" selected="">Audiovisual \(12\)<\/option>/);
  assert.match(html, /data-testid="select-opportunity-city"/);
  assert.match(html, /<option value="RN\|Natal" selected="">Natal \(RN\) \(3\)<\/option>/);
  assert.match(html, /data-testid="select-opportunity-organization"/);
  assert.match(html, /<option value="Secult CE" selected="">Secult CE \(20\)<\/option>/);
});

test('a contagem por área marca a área ativa e só usa classes do design system', () => {
  const html = render({ area: ['audiovisual'] });
  assert.match(html, /aria-label="Chamadas por área cultural"/);
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
  assert.match(html, /Todas as áreas/);
  assert.match(html, /Todos os municípios/);
  assert.match(html, /Todas as instituições/);
});
