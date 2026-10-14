import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { GlossaryScope, GlossaryText, GlossaryTracker } from '../components/glossary-text';
import { entryForLabel, foldWithMap, segmentGlossary } from './term-detection';

const marked = (text: string) => segmentGlossary(text).filter((segment) => typeof segment !== 'string');
const render = (node: Parameters<typeof h>[0] extends never ? never : ReturnType<typeof h>) =>
  renderToStaticMarkup(h(Router, { ssrPath: '/tenders/x' }, node));
const termButtons = (html: string) => [...html.matchAll(/data-testid="glossary-term-([^"]+)"/g)].map((match) => match[1]);

test('marks only the first occurrence of each term and keeps the original spelling', () => {
  const segments = segmentGlossary('O SICAF é federal. Depois do SICAF, emita a CND e outra CND.');
  assert.deepEqual(
    segments.filter((segment) => typeof segment !== 'string'),
    [
      { termId: 'sicaf', text: 'SICAF' },
      { termId: 'cnd', text: 'CND' },
    ],
  );
  assert.equal(segments.map((segment) => (typeof segment === 'string' ? segment : segment.text)).join(''), 'O SICAF é federal. Depois do SICAF, emita a CND e outra CND.');
});

test('matching ignores case and accents, prefers the longest term and needs whole words', () => {
  assert.deepEqual(marked('PREGAO ELETRONICO nº 12'), [{ termId: 'pregao', text: 'PREGAO ELETRONICO' }]);
  assert.deepEqual(marked('Garantia de proposta exigida'), [{ termId: 'garantia-proposta', text: 'Garantia de proposta' }]);
  assert.deepEqual(marked('Visita técnica: Dispensada'), [{ termId: 'visita-tecnica', text: 'Visita técnica' }]);
  assert.deepEqual(marked('Cota reservada para ME/EPP'), [{ termId: 'cota-reservada', text: 'Cota reservada para ME/EPP' }]);
  assert.deepEqual(marked('Leia o edital com calma'), [], 'common words flagged detect:false stay plain');
});

test('the fold map points back to the original text even with accented letters', () => {
  const { folded, map } = foldWithMap('Impugnação');
  assert.equal(folded, 'impugnacao');
  assert.equal(map.length, folded.length + 1);
  assert.deepEqual(marked('Prazo de impugnação: 3 dias'), [{ termId: 'impugnacao', text: 'impugnação' }]);
});

test('labels resolve to entries only when they are a term or alias', () => {
  assert.equal(entryForLabel('Pregão eletrônico'), 'pregao');
  assert.equal(entryForLabel('Dispensa'), 'dispensa');
  assert.equal(entryForLabel('Outra'), undefined);
});

test('GlossaryText does not mark inside links or code, and marks the first plain occurrence', () => {
  const html = render(
    h(
      GlossaryText,
      null,
      h('a', { href: '/x' }, 'SICAF'),
      ' e ',
      h('code', null, 'CNDT'),
      ' depois SICAF e CNDT e de novo SICAF',
    ),
  );
  assert.deepEqual(termButtons(html), ['sicaf', 'cndt']);
  assert.match(html, /<a href="\/x">SICAF<\/a>/);
  assert.match(html, /<code>CNDT<\/code>/);
});

test('GlossaryText walks plain elements and skips data-glossary="off"', () => {
  const html = render(h(GlossaryText, null, h('strong', null, 'Recurso'), h('span', { 'data-glossary': 'off' }, ' Impugnação')));
  assert.deepEqual(termButtons(html), ['recurso']);
});

test('inside a scope a term is marked once across the page', () => {
  const html = render(
    h(GlossaryScope, null, h('p', null, h(GlossaryText, null, 'Qualificação técnica')), h('p', null, h(GlossaryText, null, 'Qualificação técnica e ME/EPP'))),
  );
  assert.deepEqual(termButtons(html), ['qualificacao-tecnica', 'me-epp']);
});

test('the tracker keeps a claim with its owner and frees it on release', () => {
  const tracker = new GlossaryTracker();
  assert.equal(tracker.claim('sicaf', 'a'), true);
  assert.equal(tracker.claim('sicaf', 'a'), true, 're-render of the same owner');
  assert.equal(tracker.claim('sicaf', 'b'), false);
  tracker.sync('a', []);
  assert.equal(tracker.claim('sicaf', 'b'), true, 'owner no longer shows the term');
  tracker.release('b');
  assert.equal(tracker.claim('sicaf', 'c'), true);
});
