import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseParticipationPatch, participationUpdate } from './participation';

const now = new Date('2026-09-28T12:00:00Z');
test('partial updates preserve notes and other keys; repeated stage is idempotent', () => {
  const initial = participationUpdate(undefined, parseParticipationPatch({ stage: 'participating', checklist: [{ key: 'site_visit', state: 'missing', note: 'Agendar' }] }), now);
  assert.equal(initial.monitored, true);
  const updated = participationUpdate(initial, parseParticipationPatch({ checklist: [{ key: 'samples', state: 'have' }] }), new Date(now.getTime() + 1000));
  assert.equal(updated.checklist.length, 2);
  assert.equal(updated.checklist[0].note, 'Agendar');
  assert.deepEqual(updated.history, initial.history);
  const corrected = participationUpdate(updated, parseParticipationPatch({ checklist: [{ key: 'site_visit', state: 'have' }] }), now);
  assert.equal(corrected.checklist[0].note, 'Agendar');
  const stopped = participationUpdate(corrected, { monitored: false, stage: 'participating' }, now);
  assert.equal(stopped.monitored, false);
  assert.equal(stopped.history.length, 1);
});
test('all stages remain user declarations and corrections append history', () => {
  let current = participationUpdate(undefined, {}, now);
  for (const stage of ['participating', 'submitted', 'awaiting_result', 'completed', 'dismissed', 'analyzing'] as const) {
    const previous = current;
    current = participationUpdate(previous, { stage }, now);
    assert.equal(current.history.at(-1)?.from, previous.stage);
    assert.equal(current.history.at(-1)?.source, 'user');
  }
  assert.equal(current.history.length, 7);
  assert.equal(current.monitored, false);
});
test('reject forged provenance, invalid states, duplicate keys, oversized notes and invalid dates', () => {
  for (const body of [
    { stage: 'officially_confirmed' }, { history: [] }, { participationSource: 'official' },
    { checklist: [{ key: 'arbitrary', state: 'have' }] },
    { checklist: [{ key: 'samples', state: 'approved' }] },
    { checklist: [{ key: 'samples', state: 'have' }, { key: 'samples', state: 'missing' }] },
    { checklist: [{ key: 'samples', state: 'have', note: 'x'.repeat(1001) }] },
    { nextActionDeadline: 'not a date' }, { protocol: 123 },
    { nextActionDeadline: '2026-02-30T10:00:00Z' },
    { nextActionDeadline: '2026-09-28T24:00:00Z' },
  ]) assert.throws(() => parseParticipationPatch(body));
  assert.deepEqual(parseParticipationPatch({ protocol: null, nextAction: null, nextActionDeadline: null }), { protocol: null, nextAction: null, nextActionDeadline: null });
  assert.equal(parseParticipationPatch({ nextActionDeadline: '2028-02-29T10:30:00-03:00' }).nextActionDeadline?.toISOString(), '2028-02-29T13:30:00.000Z');
});
