import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import type { OpportunitySummary } from '@/api';
import { RecommendedOpportunityCard } from './recommended-opportunity-card';

const opportunity = {
  id: 'mc-123',
  title: 'Edital de fomento ao audiovisual',
  organizationName: 'Secretaria de Cultura',
  sourceName: 'Mapas Culturais',
  opportunityType: 'Edital',
  application: {
    url: 'https://prosas.com.br/editais/1',
    platform: 'prosas',
    label: 'Prosas',
    article: 'a',
    origin: 'source_page',
    documentTitle: null,
  },
} as unknown as OpportunitySummary;

test('card de oportunidade recomendada: o cartão inteiro é um único link para /oportunidades/:id', () => {
  const markup = renderToStaticMarkup(
    createElement(Router, { ssrPath: '/' }, createElement(RecommendedOpportunityCard, { opportunity, reasons: ['Combina com seu perfil: audiovisual'] })),
  );
  const links = markup.match(/<a\b/g) ?? [];
  assert.equal(links.length, 1, 'um único link por card');
  assert.match(markup, /href="\/oportunidades\/mc-123"/);
  assert.match(markup, /after:absolute after:inset-0/, 'o link cobre o card');
  assert.match(markup, /group-hover:text-primary/);
  assert.match(markup, /has-\[a:focus-visible\]:outline-ring/, 'foco visível no card');
  assert.match(markup, /Ver oportunidade/);
  assert.match(markup, /aria-labelledby="opportunity-title-mc-123"/);
  // O selo "Inscrição pela Plataforma X" continua texto, fora do link.
  const badge = markup.indexOf('data-testid="badge-opportunity-application"');
  assert.ok(badge > 0);
  assert.ok(badge < markup.indexOf('<a '), 'selo antes do link, não aninhado');
  assert.match(markup, /Combina com seu perfil: audiovisual/);
});
