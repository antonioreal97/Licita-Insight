import assert from 'node:assert/strict';
import test from 'node:test';
import type { TenderFit, TenderHighlights } from '@/api';
import { cardHighlights, mainFitReason } from './card-highlights';

const fit = (patch: Partial<TenderFit>): TenderFit => ({
  status: 'ready',
  level: 'high',
  score: 0.9,
  reasons: [],
  model: 'test',
  checkedAt: '2026-10-14T10:00:00.000Z',
  ...patch,
});

const highlights: TenderHighlights = {
  requirements: [
    { code: 'me_epp_quota', label: 'Cota reservada para ME/EPP' },
    { code: 'site_visit', label: 'Visita técnica obrigatória' },
    { code: 'technical_certificate', label: 'Exige atestado de capacidade técnica' },
  ],
};

test('a card without data stays as it was', () => {
  assert.equal(cardHighlights(undefined, undefined), null);
  assert.equal(cardHighlights({ requirements: [] }, fit({ status: 'pending', level: null })), null);
  // A fit with no explaining reason adds nothing beyond the badge.
  assert.equal(cardHighlights(undefined, fit({ reasons: [{ kind: 'value_not_published' }] })), null);
});

test('shows the requirements read from the sheet, at most three', () => {
  assert.deepEqual(cardHighlights({ requirements: [...highlights.requirements, { code: 'contract_guarantee', label: 'Exige garantia contratual' }] }, undefined), {
    fitReason: null,
    requirements: ['Cota reservada para ME/EPP', 'Visita técnica obrigatória', 'Exige atestado de capacidade técnica'],
  });
});

test('explains a good fit by what matched and a weak one by what ruled it out', () => {
  const match = { kind: 'offering_match', terms: ['limpeza'] } as const;
  const region = { kind: 'out_of_coverage', state: 'AM' } as const;
  assert.deepEqual(mainFitReason(fit({ reasons: [{ kind: 'value_not_published' }, match, region] })), match);
  assert.deepEqual(mainFitReason(fit({ level: 'low', reasons: [match, region] })), region);
  assert.deepEqual(mainFitReason(fit({ status: 'filtered', level: null, reasons: [region] })), region);
  assert.equal(mainFitReason(fit({ status: 'pending', level: null, reasons: [match] })), null);
  assert.equal(mainFitReason(fit({ reasons: [{ kind: 'offering_match', terms: [] }] })), null);
});

test('joins the fit reason and the requirements', () => {
  const match = { kind: 'offering_match', terms: ['limpeza'] } as const;
  assert.deepEqual(cardHighlights({ requirements: highlights.requirements.slice(0, 1) }, fit({ reasons: [match] })), {
    fitReason: match,
    requirements: ['Cota reservada para ME/EPP'],
  });
});
