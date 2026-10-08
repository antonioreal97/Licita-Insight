import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SavedTenderDecisionActions } from './saved-tender-decision-actions';

const noop = () => undefined;

test('editais em análise exibem as três decisões rápidas com contexto acessível', () => {
  const html = renderToStaticMarkup(
    createElement(SavedTenderDecisionActions, {
      monitored: false,
      pending: false,
      describedBy: 'tender-title-1',
      onParticipate: noop,
      onDismiss: noop,
      onMonitor: noop,
    }),
  );

  assert.match(html, /> Vou participar</);
  assert.match(html, /> Não vou participar</);
  assert.match(html, /> Só acompanhar \(receber notificações\)</);
  assert.match(html, /aria-label="Decidir sobre este edital"/);
  assert.equal((html.match(/aria-describedby="tender-title-1"/g) ?? []).length, 3);
});

test('ação de acompanhar comunica o estado e permite desativar notificações', () => {
  const html = renderToStaticMarkup(
    createElement(SavedTenderDecisionActions, {
      monitored: true,
      pending: false,
      describedBy: 'tender-title-2',
      onParticipate: noop,
      onDismiss: noop,
      onMonitor: noop,
    }),
  );

  assert.match(html, /Parar de acompanhar \(desativar notificações\)/);
  assert.match(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /data-testid="button-quick-monitor"[^>]*disabled=""/);
});
