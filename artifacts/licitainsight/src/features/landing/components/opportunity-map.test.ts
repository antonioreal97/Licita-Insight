import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import type { OpenTendersByStateResponse } from '@/api';
import { UFS } from '@/lib/ufs';
import { toStateVolumes } from '@/features/landing/lib/state-volumes';
import { searchParamsFromUrl } from '@/services/search-service';
import { OpportunityMap } from './opportunity-map';

const counts: Record<string, [number, number | null]> = {
  SP: [5200, 2_300_000_000],
  MG: [2300, 910_000_000],
  RS: [1400, null],
  PR: [900, 400_500_000],
  BA: [600, 120_000_000],
  RJ: [420, 75_000_000],
  AC: [1, 18_000],
};

const response = (overrides: Record<string, [number, number | null]> = counts): OpenTendersByStateResponse => {
  const data = UFS.map((state) => {
    const [openTenders, estimatedValueTotal] = overrides[state] ?? [0, null];
    return { state, openTenders, estimatedValueTotal, updatedAt: openTenders ? '2026-10-09T09:00:00.000Z' : null };
  });
  return {
    data,
    meta: {
      totalOpenTenders: data.reduce((total, entry) => total + entry.openTenders, 0),
      generatedAt: '2026-10-09T12:00:00.000Z',
      indexUpdatedAt: '2026-10-09T09:00:00.000Z',
      cacheTtlSeconds: 900,
    },
  };
};

const render = (data: OpenTendersByStateResponse) =>
  renderToStaticMarkup(createElement(Router, { ssrPath: '/' }, createElement(OpportunityMap, { data })));

const section = (html: string, testId: string, tag: string) =>
  html.match(new RegExp(`<${tag}[^>]*data-testid="${testId}"[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '';

describe('OpportunityMap', () => {
  const html = render(response());

  it('draws the 27 states as labelled links to the search filtered by state', () => {
    const links = [...html.matchAll(/<a [^>]*data-uf="(\w\w)"[^>]*>/g)];
    assert.equal(links.length, 27);
    assert.deepEqual(links.map(([, uf]) => uf).sort(), [...UFS].sort());

    const saoPaulo = links.find(([, uf]) => uf === 'SP')?.[0] ?? '';
    assert.match(saoPaulo, /href="\/search\?state=SP"/);
    assert.match(saoPaulo, /aria-label="São Paulo: 5\.200 editais abertos, R\$\s2,3\sbi em valor estimado"/);
    assert.match(html, /aria-label="Rio Grande do Sul: 1\.400 editais abertos, valor estimado não informado"/);
    assert.match(html, /aria-label="Acre: 1 edital aberto, R\$\s18\smil em valor estimado"/);
    assert.match(html, /aria-label="Amapá: nenhum edital aberto"/);
  });

  it('fills each state with a palette token of its band, strongest for the highest volume', () => {
    const fill = (uf: string) => html.match(new RegExp(`data-uf="${uf}"[^>]*><use[^>]*class="(fill-mapa-[\\w]+)"`))?.[1];
    assert.equal(fill('SP'), 'fill-mapa-5');
    assert.equal(fill('AC'), 'fill-mapa-1');
    assert.equal(fill('AP'), 'fill-mapa-vazio');
    assert.doesNotMatch(html, /fill="#|stroke="#|rgb\(|gradient/i);
  });

  it('shows the national total until a state is hovered or focused', () => {
    const readout = section(html, 'map-readout', 'div');
    assert.match(readout, />Brasil</);
    assert.match(readout, /10\.821 editais abertos/);
  });

  it('ranks the five states with most open tenders', () => {
    const ranking = section(html, 'map-ranking', 'ol');
    const names = [...ranking.matchAll(/group-hover:underline">([^<]+)</g)].map(([, name]) => name);
    assert.deepEqual(names, ['São Paulo', 'Minas Gerais', 'Rio Grande do Sul', 'Paraná', 'Bahia']);
    assert.match(ranking, /href="\/search\?state=MG"/);
    assert.match(ranking, />5\.200</);
  });

  it('explains the scale with one legend entry per band, plus the empty one', () => {
    const legend = section(html, 'map-legend', 'ul');
    assert.match(legend, /Nenhum/);
    assert.equal([...legend.matchAll(/bg-mapa-\d/g)].length, 5);
    assert.match(legend, /5\.200/);
  });

  it('offers every state in a table for screen readers and small targets', () => {
    const table = section(html, 'map-table', 'table');
    assert.equal([...table.matchAll(/<th scope="row"/g)].length, 27);
    assert.match(table, /<caption[^>]*>Editais abertos e valor estimado somado por estado<\/caption>/);
    assert.match(table, /href="\/search\?state=AP"[^>]*>Amapá \(AP\)<\/a><\/th><td[^>]*>0<\/td><td[^>]*>—<\/td>/);
    assert.match(table, /Rio Grande do Sul \(RS\)<\/a><\/th><td[^>]*>1\.400<\/td><td[^>]*>Não informado<\/td>/);
    assert.match(html, /<details/);
  });

  it('omits the empty legend entry when every state has open tenders', () => {
    const everyState = Object.fromEntries(UFS.map((uf, index) => [uf, [index + 1, null] as [number, null]]));
    const legend = section(render(response(everyState)), 'map-legend', 'ul');
    assert.doesNotMatch(legend, /Nenhum/);
    assert.equal([...legend.matchAll(/bg-mapa-\d/g)].length, 5);
  });
});

describe('link de cada estado', () => {
  it('abre a busca filtrada pela UF com o parâmetro que a busca lê hoje', () => {
    for (const state of toStateVolumes(response().data).states) {
      const [path, query] = state.href.split('?');
      assert.equal(path, '/search');
      assert.deepEqual(searchParamsFromUrl(`?${query}`).state, [state.uf]);
    }
  });
});
