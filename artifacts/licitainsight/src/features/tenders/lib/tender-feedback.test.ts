import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '@/api/errors';
import {
  FEEDBACK_KIND_OPTIONS,
  FEEDBACK_SECTION_OPTIONS,
  currentPagePath,
  feedbackErrorMessage,
  feedbackMessageError,
  feedbackMessageLength,
} from './tender-feedback';

test('offers the four kinds and the page sections of the contract', () => {
  assert.deepEqual(
    FEEDBACK_KIND_OPTIONS.map((option) => option.value),
    ['wrong_or_missing_info', 'possible_irregularity', 'broken_link', 'other'],
  );
  assert.deepEqual(
    FEEDBACK_KIND_OPTIONS.map((option) => option.label),
    ['Informação errada ou faltando', 'Possível irregularidade no edital', 'Documento ou link quebrado', 'Outro'],
  );
  assert.deepEqual(
    FEEDBACK_SECTION_OPTIONS.map((option) => option.value),
    ['summary', 'deadlines', 'value', 'documents', 'sheet', 'items', 'timeline', 'other'],
  );
});

test('counts the message after trimming, like the API', () => {
  assert.equal(feedbackMessageLength('   abc   '), 3);
  assert.equal(feedbackMessageError('  123456789  '), 'Escreva pelo menos 10 caracteres.');
  assert.equal(feedbackMessageError('1234567890'), null);
  assert.equal(feedbackMessageError(` ${'x'.repeat(2000)} `), null);
  assert.equal(feedbackMessageError('x'.repeat(2001)), 'Use no máximo 2000 caracteres.');
});

test('explains each API failure in Portuguese', () => {
  assert.equal(
    feedbackErrorMessage(new ApiError('RATE_LIMITED', 'limit', 429, { retryAfterSeconds: 42 })),
    'Muitos envios em pouco tempo. Tente de novo em 1 minuto.',
  );
  assert.equal(
    feedbackErrorMessage(new ApiError('RATE_LIMITED', 'limit', 429, { retryAfterSeconds: 150 })),
    'Muitos envios em pouco tempo. Tente de novo em 3 minutos.',
  );
  assert.equal(feedbackErrorMessage(new ApiError('RATE_LIMITED', 'limit', 429)), 'Muitos envios em pouco tempo. Tente de novo em instantes.');
  assert.equal(feedbackErrorMessage(new ApiError('NOT_FOUND', 'x', 404)), 'Este edital não está mais disponível. Recarregue a página.');
  assert.equal(feedbackErrorMessage(new ApiError('INVALID_PARAMETER', 'x', 400)), 'Revise o tipo e a mensagem (de 10 a 2000 caracteres).');
  assert.equal(feedbackErrorMessage(new ApiError('FORBIDDEN', 'x', 403)), 'Não foi possível validar o envio. Recarregue a página e tente de novo.');
  assert.equal(feedbackErrorMessage(new ApiError('NETWORK_ERROR', 'x', 0)), 'Sem conexão com o servidor. Tente de novo.');
  assert.equal(
    feedbackErrorMessage(new ApiError('INTERNAL_ERROR', 'x', 500, { requestId: 'req-1' })),
    'Não foi possível enviar. Tente de novo. ref. req-1',
  );
  assert.equal(feedbackErrorMessage(new Error('boom')), 'Não foi possível enviar. Tente de novo.');
});

test('sends only the path of the current page', () => {
  assert.equal(currentPagePath({ pathname: '/tenders/abc', search: '?x=1', hash: '#documentos' }), '/tenders/abc?x=1#documentos');
  assert.equal(currentPagePath(undefined), null);
});
