import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANY_DOCUMENT_CATALOG, documentValidity, parseCompanyDocumentKind, parseCompanyDocumentPut } from './company-documents-service';

test('company document catalog is fixed, complete and only links official sources', () => {
  assert.equal(COMPANY_DOCUMENT_CATALOG.length, 12);
  assert.equal(new Set(COMPANY_DOCUMENT_CATALOG.map(({ kind }) => kind)).size, 12);
  for (const item of COMPANY_DOCUMENT_CATALOG) {
    const host = new URL(item.officialUrl).hostname;
    assert.ok(host.endsWith('gov.br') || host.endsWith('jus.br'), item.officialUrl);
  }
  assert.equal(parseCompanyDocumentKind('cndt'), 'cndt');
  assert.throws(() => parseCompanyDocumentKind('passport'));
});

test('company document payload validates dates and removes metadata when not applicable', () => {
  assert.deepEqual(parseCompanyDocumentPut({ status: 'not_applicable', issuedAt: '2026-01-01', reference: 'ignored' }), { status: 'not_applicable', issuedAt: null, expiresAt: null, reference: null });
  assert.deepEqual(parseCompanyDocumentPut({ status: 'have', issuedAt: '2026-01-01', expiresAt: '2026-06-30', reference: '  Receita  ' }), { status: 'have', issuedAt: '2026-01-01', expiresAt: '2026-06-30', reference: 'Receita' });
  assert.throws(() => parseCompanyDocumentPut({ status: 'have', issuedAt: '2026-10-10', expiresAt: '2026-10-09' }));
  assert.throws(() => parseCompanyDocumentPut({ status: 'unknown' }));
});

test('documento que vence sem data informada não conta como em dia', () => {
  const today = '2026-10-20';
  const expiring = COMPANY_DOCUMENT_CATALOG.find(({ kind }) => kind === 'cnd_federal')!;
  const lasting = COMPANY_DOCUMENT_CATALOG.find(({ kind }) => kind === 'articles_of_association')!;
  assert.equal(documentValidity(expiring, { status: 'have', expiresAt: null }, today), 'unknown');
  assert.equal(documentValidity(expiring, { status: 'have', expiresAt: '2026-10-20' }, today), 'valid');
  assert.equal(documentValidity(expiring, { status: 'have', expiresAt: '2026-10-19' }, today), 'invalid');
  assert.equal(documentValidity(lasting, { status: 'have', expiresAt: null }, today), 'valid');
  assert.equal(documentValidity(expiring, { status: 'missing', expiresAt: null }, today), 'invalid');
  assert.equal(documentValidity(expiring, null, today), 'invalid');
});
