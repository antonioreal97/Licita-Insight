import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecommendationActions, RECOMMENDATION_INTEREST_TOAST } from './recommendation-actions';

const noop = () => undefined;

test('card recomendado oferece ações positivas e negativas explícitas', () => {
  const html = renderToStaticMarkup(
    createElement(RecommendationActions, {
      saved: false,
      saving: false,
      dismissing: false,
      describedBy: 'tender-title-1',
      onInterest: noop,
      onDismiss: noop,
    }),
  );

  assert.match(html, />Tenho interesse</);
  assert.match(html, /> Não tenho interesse</);
  assert.match(html, /role="group"/);
  assert.match(html, /aria-describedby="tender-title-1"/);
  assert.equal(RECOMMENDATION_INTEREST_TOAST, 'Salvo em Editais salvos. Defina se vai participar.');
});

test('card recomendado comunica o estado salvo e bloqueia ações duplicadas', () => {
  const html = renderToStaticMarkup(
    createElement(RecommendationActions, {
      saved: true,
      saving: false,
      dismissing: false,
      describedBy: 'tender-title-2',
      onInterest: noop,
      onDismiss: noop,
    }),
  );

  assert.match(html, />Salvo</);
  assert.doesNotMatch(html, />Tenho interesse</);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});
