import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import type { AwardHistory, AwardHistoryMeta } from '@/api';
import { AwardHistoryView, winnerLabel } from './tender-award-history';

const history: AwardHistory = {
  tenderId: '11111111000111-1-000050-2026',
  scope: 'unit',
  organizationName: 'Município de Teste',
  purchasingUnit: 'Secretaria Municipal de Saúde',
  windowMonths: 24,
  since: '2024-10-14',
  criteria: {
    keywords: ['medicamento', 'farmacia'],
    categories: [{ slug: 'medicamentos-insumos-saude', label: 'Medicamentos e insumos de saúde' }],
    rule: 'Compras do mesmo órgão (CNPJ) nos últimos 24 meses.',
  },
  purchases: { total: 3, last12Months: 2, withResults: 2 },
  winners: {
    distinct: 3,
    top: [
      { name: 'ALFA DISTRIBUIDORA LTDA', cnpj: '22222222000122', kind: 'company', wins: 2 },
      { name: null, cnpj: null, kind: 'individual', wins: 1 },
    ],
  },
  prices: {
    purchaseValue: { min: 500, median: 900, max: 1000, count: 3 },
    discountPercent: { p25: 15, median: 20, p75: 25, count: 3 },
  },
  recent: [{
    purchasePncpControlNumber: '11111111000111-1-000010/2026',
    tenderId: '11111111000111-1-000010-2026',
    date: '2026-05-01',
    object: 'Aquisição de medicamentos para a farmácia básica',
    value: 1000,
    valueSource: 'results',
    winners: [{ name: 'ALFA DISTRIBUIDORA LTDA', cnpj: '22222222000122', kind: 'company', wins: 1 }],
    officialUrl: 'https://pncp.gov.br/app/editais/11111111000111/2026/10',
  }],
};

const meta = (unlocked: boolean): AwardHistoryMeta => ({
  coverage: 'Cobertura de teste.',
  valueSemantics: 'Semântica de teste.',
  access: { winnerNames: 'entitled', unlocked },
});

const render = (data: AwardHistory, unlocked: boolean) =>
  renderToStaticMarkup(createElement(Router, { ssrPath: '/tenders/x' }, createElement(AwardHistoryView, {
    history: data,
    meta: meta(unlocked),
    lockedAction: createElement('a', { href: '#assinar' }, 'Assinar'),
  })));

test('com acesso mostra números, vencedores com CNPJ e links oficiais', () => {
  const markup = render(history, true);
  assert.match(markup, /Secretaria Municipal de Saúde/);
  assert.match(markup, /Quem costuma vencer/);
  assert.match(markup, /ALFA DISTRIBUIDORA LTDA/);
  assert.match(markup, /CNPJ 22\.222\.222\/0001-22/);
  assert.match(markup, /Pessoa física/);
  assert.match(markup, /Preço praticado/);
  assert.match(markup, /20%/);
  assert.match(markup, /href="https:\/\/pncp\.gov\.br\/app\/editais\/11111111000111\/2026\/10"/);
  assert.match(markup, /href="\/tenders\/11111111000111-1-000010-2026"/);
  assert.doesNotMatch(markup, /href="#assinar"/);
});

test('sem acesso mantém os números e esconde nomes e CNPJ', () => {
  const locked: AwardHistory = {
    ...history,
    winners: { ...history.winners, top: history.winners.top.map((winner) => ({ ...winner, name: null, cnpj: null })) },
    recent: history.recent.map((purchase) => ({ ...purchase, winners: purchase.winners.map((winner) => ({ ...winner, name: null, cnpj: null })) })),
  };
  const markup = render(locked, false);
  assert.doesNotMatch(markup, /ALFA/);
  assert.doesNotMatch(markup, /CNPJ 22/);
  assert.match(markup, /Nome disponível com acesso ativo/);
  assert.match(markup, /venceu 2 de 3/);
  assert.match(markup, /href="#assinar"/);
  assert.match(markup, /Pessoa física/);
});

test('sem histórico explica o vazio sem números inventados', () => {
  const empty: AwardHistory = {
    ...history,
    scope: 'organization',
    purchasingUnit: null,
    purchases: { total: 0, last12Months: 0, withResults: 0 },
    winners: { distinct: 0, top: [] },
    prices: { purchaseValue: null, discountPercent: null },
    recent: [],
  };
  const markup = render(empty, false);
  assert.match(markup, /Não encontramos compras parecidas/);
  assert.match(markup, /Como comparamos/);
  assert.doesNotMatch(markup, /Quem costuma vencer/);
});

test('grupos nunca recebem nome', () => {
  assert.equal(winnerLabel({ name: 'JOAO', cnpj: null, kind: 'individual', wins: 1 }), 'Pessoa física');
  assert.equal(winnerLabel({ name: null, cnpj: null, kind: 'foreign', wins: 1 }), 'Fornecedor estrangeiro');
});
