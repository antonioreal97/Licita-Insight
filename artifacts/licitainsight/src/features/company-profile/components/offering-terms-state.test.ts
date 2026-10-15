import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OfferingTermsField } from './offering-terms-field';
import {
  addSuggestedTerm,
  addTypedTerms,
  combinedOfferingTerms,
  listsForSave,
  OFFERING_TERMS_LIMIT,
  removeOfferingTerm,
  type OfferingLists,
} from './offering-terms-state';

const empty: OfferingLists = { selectedKeywords: [], offerings: [] };

test('campo único: sugestão escolhida vai para selectedKeywords e termo digitado para offerings', () => {
  const picked = addSuggestedTerm(empty, 'iluminação cênica');
  assert.deepEqual(picked, { selectedKeywords: ['iluminação cênica'], offerings: [] });
  const typed = addTypedTerms(picked, 'transmissão ao vivo, limpeza predial; Iluminacao cenica');
  assert.deepEqual(typed.lists, {
    selectedKeywords: ['iluminação cênica'],
    offerings: ['transmissão ao vivo', 'limpeza predial'],
  });
  assert.equal(typed.added, 2);
  assert.equal(typed.skipped, 1, 'repetido sem acento conta como o mesmo termo');
  assert.deepEqual(combinedOfferingTerms(typed.lists), ['iluminação cênica', 'transmissão ao vivo', 'limpeza predial']);
});

test('termo digitado igual a uma sugestão da base é gravado como sugestão, na forma da base', () => {
  const vocabulary = new Map([['caixa de som', 'caixa de som'], ['iluminacao', 'iluminação']]);
  const { lists } = addTypedTerms(empty, 'Iluminacao, painel de led', vocabulary);
  assert.deepEqual(lists, { selectedKeywords: ['iluminação'], offerings: ['painel de led'] });
});

test('limite combinado de 20 termos entre as duas listas', () => {
  const full: OfferingLists = {
    selectedKeywords: Array.from({ length: 12 }, (_, index) => `sugestao ${index}`),
    offerings: Array.from({ length: 8 }, (_, index) => `digitado ${index}`),
  };
  assert.equal(combinedOfferingTerms(full).length, OFFERING_TERMS_LIMIT);
  assert.equal(addSuggestedTerm(full, 'outro'), full);
  const typed = addTypedTerms(full, 'mais um');
  assert.equal(typed.lists, full);
  assert.equal(typed.skipped, 1);
  assert.equal(addTypedTerms(empty, 'a').skipped, 1, 'menos de 2 caracteres');
});

test('remover tira o termo das duas listas; perfis antigos com o mesmo termo nas duas aparecem uma vez', () => {
  const legacy: OfferingLists = { selectedKeywords: ['Limpeza'], offerings: ['limpeza', 'jardinagem'] };
  assert.deepEqual(combinedOfferingTerms(legacy), ['Limpeza', 'jardinagem']);
  assert.deepEqual(removeOfferingTerm(legacy, 'limpeza'), { selectedKeywords: [], offerings: ['jardinagem'] });
});

test('ao salvar: sem termo nas duas listas e sempre com ao menos um em offerings (exigência da API)', () => {
  assert.deepEqual(listsForSave({ selectedKeywords: ['som', 'iluminação'], offerings: [] }), {
    selectedKeywords: ['iluminação'],
    offerings: ['som'],
  });
  assert.deepEqual(listsForSave({ selectedKeywords: ['Limpeza'], offerings: ['limpeza', 'jardinagem'] }), {
    selectedKeywords: ['Limpeza'],
    offerings: ['jardinagem'],
  });
  assert.deepEqual(listsForSave(empty), empty);
});

test('campo único renderiza um rótulo, chips das duas listas, combobox e contador', () => {
  const client = new QueryClient();
  const markup = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(OfferingTermsField, {
        id: 'offerings',
        lists: { selectedKeywords: ['iluminação cênica'], offerings: ['transmissão ao vivo', 'limpeza predial'] },
        onChange: () => undefined,
      }),
    ),
  );
  client.clear();
  assert.match(markup, /O que sua empresa vende ou faz/);
  assert.doesNotMatch(markup, /Palavras-chave inteligentes|Produtos e serviços principais/);
  assert.match(markup, /termos que aparecem nos editais que interessam/);
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-describedby="offerings-hint offerings-count"/);
  for (const term of ['iluminação cênica', 'transmissão ao vivo', 'limpeza predial']) assert.match(markup, new RegExp(`Remover ${term}`));
  assert.match(markup, />3 de 20 termos</);
});
