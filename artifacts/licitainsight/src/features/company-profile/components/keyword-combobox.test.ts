import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { moveComboboxIndex } from './keyword-combobox-state';
import { SmartKeywordCombobox } from './keyword-combobox';

test('combobox percorre opções com setas e faz wrap sem índice inválido', () => {
  assert.equal(moveComboboxIndex(-1, 'ArrowDown', 3), 0);
  assert.equal(moveComboboxIndex(2, 'ArrowDown', 3), 0);
  assert.equal(moveComboboxIndex(0, 'ArrowUp', 3), 2);
  assert.equal(moveComboboxIndex(0, 'ArrowDown', 0), -1);
});

test('combobox renderiza sem consulta por tecla e expõe a semântica ARIA', () => {
  const client = new QueryClient();
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(SmartKeywordCombobox, {
        label: 'Palavras-chave inteligentes',
        hint: 'Digite dois caracteres',
        placeholder: 'Ex.: iluminação',
        selected: ['sonorização'],
        onChange: () => undefined,
        testId: 'smart-keywords',
      }),
    ),
  );
  client.clear();
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-autocomplete="list"/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /Remover sonorização/);
  assert.match(markup, /data-testid="smart-keywords-input"/);
});
