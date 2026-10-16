import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contextualDismissalPenalty, dismissalTerms, isDismissReason } from './triage-feedback';
const now = new Date('2026-10-15T12:00:00Z');
const tender = { state: 'RJ', estimatedValue: '100000', proposalDeadline: new Date('2026-10-17T12:00:00Z') };
test('legacy and topic feedback retain topic signals; reasons are bounded', () => {
  assert.deepEqual(dismissalTerms(undefined, ['filmagem'], tender), ['filmagem']);
  assert.equal(contextualDismissalPenalty(['filmagem'], tender, now), null);
  assert.equal(contextualDismissalPenalty(dismissalTerms('not_offering', ['filmagem'], tender), tender, now), null);
  for (const value of [null, '', 'custom', {}, 1]) assert.equal(isDismissReason(value), false);
  for (const value of ['region', 'value', 'deadline', 'not_offering']) assert.equal(isDismissReason(value), true);
});
test('region feedback lowers the rejected state, without penalizing the service elsewhere', () => {
  const terms = dismissalTerms('region', ['filmagem'], tender);
  assert.equal(terms.includes('filmagem'), false);
  assert.equal(contextualDismissalPenalty(terms, tender, now), 4);
  assert.equal(contextualDismissalPenalty(terms, { ...tender, state: 'SP' }, now), 0);
  assert.equal(contextualDismissalPenalty(dismissalTerms('region', [], { ...tender, state: null }), tender, now), 0);
});
test('value feedback compares approximate bands and ignores unknown or flagged values', () => {
  const terms = dismissalTerms('value', [], tender);
  assert.equal(contextualDismissalPenalty(terms, { ...tender, estimatedValue: '125000' }, now), 4);
  for (const estimatedValue of [null, '0', '200000']) assert.equal(contextualDismissalPenalty(terms, { ...tender, estimatedValue }, now), 0);
  assert.equal(contextualDismissalPenalty(terms, { ...tender, estimatedValueFlag: 'suspect' }, now), 0);
  assert.equal(contextualDismissalPenalty(dismissalTerms('value', [], { ...tender, estimatedValueFlag: 'suspect' }), tender, now), 0);
});
test('short deadline feedback affects only the next three days; a malformed marker fails loudly', () => {
  const terms = dismissalTerms('deadline', [], tender);
  assert.equal(contextualDismissalPenalty(terms, tender, now), 4);
  assert.equal(contextualDismissalPenalty(terms, { ...tender, proposalDeadline: null }, now), 0);
  assert.equal(contextualDismissalPenalty(terms, { ...tender, proposalDeadline: new Date('2026-11-01') }, now), 0);
  assert.throws(() => contextualDismissalPenalty(['@triage:v1:{bad'], tender, now), SyntaxError);
});
