import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { CompanyDocumentsResponse, TenderHighlights, TenderSheet } from '@/api';
import { daysUntil } from './bid-readiness-page';
import { documentValidity, requiredDocumentKinds, tenderReadiness } from './lib/readiness';

const catalog = (kind: CompanyDocumentsResponse['items'][number]['catalog']['kind'], label: string) => ({
  kind, label, description: label, glossaryId: 'cnd', officialUrl: 'https://www.gov.br/', suggestedValidityDays: null,
});

test('checklist date copy uses calendar days and progress UI remains accessible', () => {
  assert.equal(daysUntil('2026-10-31', '2026-10-16'), 15);
  assert.equal(daysUntil('2026-10-15', '2026-10-16'), -1);
  const source = readFileSync(new URL('./bid-readiness-page.tsx', import.meta.url), 'utf8');
  assert.match(source, /role="progressbar"/);
  assert.match(source, /Próximos passos/);
  assert.match(source, /sem upload de arquivos/i);
});

test('maps ready sheet qualifications and highlights to fixed document kinds', () => {
  const sheet = { status: 'ready', qualificationChecklist: [{ type: 'regularidade_trabalhista' }, { type: 'qualificacao_economica' }] } as TenderSheet;
  const highlights: TenderHighlights = { requirements: [{ code: 'technical_certificate', label: 'Exige atestado' }] };
  assert.deepEqual(requiredDocumentKinds({ sheet, highlights }), ['cndt', 'bankruptcy_clearance', 'balance_sheet', 'technical_capacity_certificate']);
  assert.equal(requiredDocumentKinds({}), null, 'no sheet means no badge');
});

test('readiness seal counts absent and expired required documents', () => {
  const documents: CompanyDocumentsResponse = {
    asOf: '2026-10-16', progress: { ready: 1, total: 2, unknownValidity: 0 }, items: [
      { catalog: catalog('technical_capacity_certificate', 'Atestado'), document: { id: '1', kind: 'technical_capacity_certificate', status: 'have', issuedAt: null, expiresAt: null, reference: null, updatedAt: '2026-10-01T00:00:00Z' } },
      { catalog: catalog('professional_council_registration', 'Conselho'), document: { id: '2', kind: 'professional_council_registration', status: 'have', issuedAt: null, expiresAt: '2026-10-15', reference: null, updatedAt: '2026-10-01T00:00:00Z' } },
    ],
  };
  const result = tenderReadiness(documents, { highlights: { requirements: [{ code: 'technical_qualification', label: 'Qualificação técnica' }] } });
  assert.deepEqual(result, { state: 'missing', labels: ['Conselho'] });
  documents.items[1]!.document!.expiresAt = '2026-10-17';
  assert.deepEqual(tenderReadiness(documents, { highlights: { requirements: [{ code: 'technical_qualification', label: 'Qualificação técnica' }] } }), { state: 'ready', required: 2 });
});

test('tender rows and detail expose the readiness badge with the automatic-reading disclaimer', () => {
  const row = readFileSync(new URL('../tenders/components/tender-row.tsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('./components/tender-readiness-panel.tsx', import.meta.url), 'utf8');
  assert.match(row, /ReadinessBadge/);
  assert.match(panel, /pode errar/);
  assert.match(panel, /Revisar documentos da empresa/);
});

test('certidão que vence sem data informada não deixa o selo verde', () => {
  const expiring = { ...catalog('cndt', 'CNDT'), suggestedValidityDays: 180 };
  const item = { catalog: expiring, document: { id: '3', kind: 'cndt' as const, status: 'have' as const, issuedAt: null, expiresAt: null, reference: null, updatedAt: '2026-10-01T00:00:00Z' } };
  assert.equal(documentValidity(item, '2026-10-16'), 'unknown');
  assert.equal(documentValidity({ ...item, catalog: catalog('cndt', 'CNDT') }, '2026-10-16'), 'valid', 'kinds without validity do not expire');
  const documents: CompanyDocumentsResponse = { asOf: '2026-10-16', progress: { ready: 0, total: 1, unknownValidity: 1 }, items: [item] };
  const sheet = { status: 'ready', qualificationChecklist: [{ type: 'regularidade_trabalhista' }] } as TenderSheet;
  assert.deepEqual(tenderReadiness(documents, { sheet }), { state: 'missing', labels: ['CNDT (sem validade informada)'] });
});
