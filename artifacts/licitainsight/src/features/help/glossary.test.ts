import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORY_LABELS, CATEGORY_ORDER, FIRST_STEPS, GLOSSARY, GLOSSARY_DISCLAIMER } from './glossary';
import {
  GLOSSARY_ROUND_GOAL,
  GLOSSARY_LEARNING_NOTES,
  GLOSSARY_TOPICS,
  glossaryQuizFor,
  glossaryReward,
  learningNoteFor,
  simpleGlossaryDefinition,
} from './glossary-learning';
import { fold } from './lib/term-detection';

const OFFICIAL_HOSTS = /(^|\.)(gov\.br|jus\.br|finep\.gov\.br|worldbank\.org|iadb\.org|europa\.eu)$/;
const sentences = (text: string) => text.split(/[.!?](?=\s|$)/).filter((part) => part.trim()).length;

test('the glossary has 60 to 80 entries with unique ids, all categorized', () => {
  assert.ok(GLOSSARY.length >= 60 && GLOSSARY.length <= 80, `${GLOSSARY.length} entries`);
  assert.equal(new Set(GLOSSARY.map((entry) => entry.id)).size, GLOSSARY.length);
  assert.deepEqual(Object.keys(CATEGORY_LABELS).sort(), [...CATEGORY_ORDER].sort());
  for (const entry of GLOSSARY) assert.ok(CATEGORY_ORDER.includes(entry.category), entry.id);
});

test('covers the terms new suppliers ask about', () => {
  for (const id of ['sicaf', 'cnd', 'me-epp', 'cota-reservada', 'pregao', 'dispensa', 'registro-de-precos', 'impugnacao', 'recurso', 'habilitacao', 'proposta', 'lance', 'garantia-proposta', 'garantia-contratual', 'atestado-capacidade-tecnica', 'lei-14133', 'regularizacao-me-epp', 'agente-cultural', 'subvencao-economica', 'termo-fomento-colaboracao', 'captacao-rouanet', 'expressao-interesse', 'ifb-rfb-rfp-rfq', 'call-topic', 'consorcio-pic']) {
    assert.ok(GLOSSARY.some((entry) => entry.id === id), `missing ${id}`);
  }
});

test('each entry has a 2–3 sentence definition, what to do and only official https sources', () => {
  for (const entry of GLOSSARY) {
    const count = sentences(entry.definition);
    assert.ok(count >= 2 && count <= 3, `${entry.id}: ${count} sentences`);
    assert.ok(entry.whatToDo.trim().length > 20, `${entry.id}: what to do`);
    assert.ok(entry.sources.length > 0, `${entry.id}: no source`);
    for (const source of entry.sources) {
      const url = new URL(source.url);
      assert.equal(url.protocol, 'https:', source.url);
      assert.match(url.hostname, OFFICIAL_HOSTS, `${entry.id}: ${source.url}`);
      assert.ok(source.label.trim(), `${entry.id}: source label`);
    }
  }
});

test('no automatically detected alias points to two entries', () => {
  const owners = new Map<string, string>();
  for (const entry of GLOSSARY) {
    if (entry.detect === false) continue;
    for (const alias of [entry.term, ...entry.aliases]) {
      const key = fold(alias);
      const owner = owners.get(key);
      assert.ok(owner === undefined || owner === entry.id, `"${alias}" in ${owner} and ${entry.id}`);
      owners.set(key, entry.id);
    }
  }
});

test('the disclaimer says it is informative and not legal or tax advice', () => {
  assert.match(GLOSSARY_DISCLAIMER, /informativo/);
  assert.match(GLOSSARY_DISCLAIMER, /não é orientação jurídica/i);
  assert.match(GLOSSARY_DISCLAIMER, /fiscal/);
});

test('first steps have 5 to 7 items', () => {
  assert.ok(FIRST_STEPS.length >= 5 && FIRST_STEPS.length <= 7);
  for (const step of FIRST_STEPS) assert.ok(step.title && step.text);
});

test('every glossary term has a concrete learning example and a memorable idea', () => {
  assert.deepEqual(Object.keys(GLOSSARY_TOPICS).sort(), [...CATEGORY_ORDER].sort());
  assert.deepEqual(Object.keys(GLOSSARY_LEARNING_NOTES).sort(), GLOSSARY.map((entry) => entry.id).sort());
  for (const entry of GLOSSARY) {
    const note = learningNoteFor(entry);
    assert.ok(simpleGlossaryDefinition(entry).length >= 25, `${entry.id}: simple definition`);
    assert.ok(note.example.length >= 45, `${entry.id}: example`);
    assert.ok(note.remember.length >= 25, `${entry.id}: remember`);
    assert.doesNotMatch(`${note.example} ${note.remember}`, /[—–]/, `${entry.id}: dash`);
  }
});

test('every learning challenge has three stable and unique answers with one correct option', () => {
  assert.equal(new Set(CATEGORY_ORDER.map((category) => GLOSSARY_TOPICS[category].badge)).size, CATEGORY_ORDER.length);
  for (const entry of GLOSSARY) {
    const topicEntries = GLOSSARY.filter((candidate) => candidate.category === entry.category);
    const challenge = glossaryQuizFor(entry, topicEntries);
    assert.equal(challenge.options.length, 3, entry.id);
    assert.equal(new Set(challenge.options).size, 3, entry.id);
    assert.equal(challenge.options.filter((option) => option === challenge.correctAnswer).length, 1, entry.id);
    assert.deepEqual(challenge, glossaryQuizFor(entry, topicEntries), `${entry.id}: unstable challenge`);
    assert.match(challenge.prompt, new RegExp(entry.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('the quick round rewards consecutive first-try answers without unbounded bonuses', () => {
  assert.equal(GLOSSARY_ROUND_GOAL, 5);
  assert.deepEqual(glossaryReward(0, true), { points: 10, nextStreak: 1, streakBonus: 0 });
  assert.deepEqual(glossaryReward(1, true), { points: 12, nextStreak: 2, streakBonus: 2 });
  assert.deepEqual(glossaryReward(10, true), { points: 20, nextStreak: 11, streakBonus: 10 });
  assert.deepEqual(glossaryReward(4, false), { points: 10, nextStreak: 0, streakBonus: 0 });
});
