import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutomaticSummary, AUTOMATIC_SUMMARY_LABEL } from './automatic-summary';

test('não altera a tela quando o resumo está ausente', () => {
  const markup = renderToStaticMarkup(
    createElement(AutomaticSummary, {
      summary: null,
      heading: 'Resposta',
      citationHref: (citation) => `#trecho-${citation}`,
    }),
  );
  assert.equal(markup, '');
});

test('renderiza o rótulo e torna as citações válidas clicáveis', () => {
  const markup = renderToStaticMarkup(
    createElement(AutomaticSummary, {
      summary: {
        text: 'O prazo é de dez dias [1]. A garantia é de 5% [2].',
        citations: [1, 2],
        model: 'gpt-4o-mini',
      },
      heading: 'Resposta',
      citationHref: (citation) => `#ask-passage-4-${citation}`,
    }),
  );
  assert.match(markup, /Resposta/);
  assert.match(markup, new RegExp(AUTOMATIC_SUMMARY_LABEL.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
  assert.match(markup, /href="#ask-passage-4-1"/);
  assert.match(markup, /href="#ask-passage-4-2"/);
});
