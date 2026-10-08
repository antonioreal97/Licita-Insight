import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AI_PERSONAL_DATA_NOTICE, AskPrivacyNotice } from './ask-privacy-notice';

test('warns before a question is sent to the AI provider', () => {
  assert.equal(AI_PERSONAL_DATA_NOTICE, 'Não inclua dados pessoais (nomes, CPF, contatos) — a pergunta é enviada a um provedor de IA.');
  const html = renderToStaticMarkup(createElement(AskPrivacyNotice));
  assert.match(html, /data-testid="text-ask-privacy"/);
  assert.match(html, /Não inclua dados pessoais/);
});
