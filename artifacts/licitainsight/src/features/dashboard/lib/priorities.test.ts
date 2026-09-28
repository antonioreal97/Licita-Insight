import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SavedTender, TenderFit, TenderSummary } from '@/api/types';
import { matchingCandidates, nearestSavedDeadlines } from './priorities';

test('combina as etapas por prazo global, sem incluir concluídos, vencidos ou sem data', () => {
  const row = (id: string, day: string | null, stage = 'analyzing') => ({ tender: { id, proposalDeadline: day }, stage }) as SavedTender;
  const first = [row('b', '2099-01-02'), row('d', '2099-01-04'), row('z', null), row('expired', '2000-01-01')];
  const second = [row('a', '2099-01-02', 'participating'), row('c', '2099-01-03', 'participating'), row('e', '2099-01-05', 'participating'), row('done', '2099-01-01', 'completed')];
  assert.deepEqual(nearestSavedDeadlines(first, second, Date.parse('2026-09-28')).map(item => item.tender.id), ['a', 'b', 'c', 'd']);
  assert.equal(first.length, 4, 'não modifica o cache da query');
});

test('seleção só usa aderência pronta alta/média; ausência e pending não são compatibilidade', () => {
  const tenders = ['high', 'medium', 'low', 'pending', 'missing'].map(id => ({ id }) as TenderSummary);
  const fits = Object.fromEntries(['high', 'medium', 'low', 'pending'].map(id => [id, { status: id === 'pending' ? 'pending' : 'ready', level: id === 'pending' ? 'high' : id }])) as Record<string, TenderFit>;
  assert.deepEqual(matchingCandidates(tenders, fits).map(item => item.id), ['high', 'medium']);
});
