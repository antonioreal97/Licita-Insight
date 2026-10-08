import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentReadingMessage } from './document-reading-notice';

test('descreve a leitura parcial com motivo específico', () => {
  assert.equal(
    documentReadingMessage({
      read: 2,
      total: 3,
      unread: [{ id: 'scan', title: 'edital.pdf', url: 'https://example.test/edital.pdf', reason: 'scanned_pdf' }],
    }),
    '2 de 3 documentos lidos; 1 é imagem digitalizada',
  );
});

test('agrupa formatos não compatíveis sem esconder os demais motivos', () => {
  assert.equal(
    documentReadingMessage({
      read: 0,
      total: 3,
      unread: [
        { id: 'a', title: 'a.bin', url: 'https://example.test/a', reason: 'unsupported_format:binary' },
        { id: 'b', title: 'b.bin', url: 'https://example.test/b', reason: 'unsupported_format:binary' },
        { id: 'c', title: 'c.zip', url: 'https://example.test/c', reason: 'size_limit' },
      ],
    }),
    'Nenhum de 3 documentos foi lido; 2 estão em formato não compatível; 1 excede o limite de tamanho',
  );
});

test('explica falha definitiva do OCR', () => {
  assert.equal(
    documentReadingMessage({
      read: 1,
      total: 2,
      unread: [{ id: 'scan', title: 'scan.pdf', url: 'https://example.test/scan', reason: 'ocr_failed' }],
    }),
    '1 de 2 documentos lidos; 1 não pôde ser reconhecido pelo OCR',
  );
});
