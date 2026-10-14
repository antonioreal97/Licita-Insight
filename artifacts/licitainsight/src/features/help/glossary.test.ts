import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORY_LABELS, CATEGORY_ORDER, FIRST_STEPS, GLOSSARY, GLOSSARY_DISCLAIMER } from './glossary';
import { fold } from './lib/term-detection';

const OFFICIAL_HOSTS = /(^|\.)(gov\.br|jus\.br)$/;
const sentences = (text: string) => text.split(/[.!?](?=\s|$)/).filter((part) => part.trim()).length;

test('the glossary has 30 to 50 entries with unique ids, all categorized', () => {
  assert.ok(GLOSSARY.length >= 30 && GLOSSARY.length <= 50, `${GLOSSARY.length} entries`);
  assert.equal(new Set(GLOSSARY.map((entry) => entry.id)).size, GLOSSARY.length);
  assert.deepEqual(Object.keys(CATEGORY_LABELS).sort(), [...CATEGORY_ORDER].sort());
  for (const entry of GLOSSARY) assert.ok(CATEGORY_ORDER.includes(entry.category), entry.id);
});

test('covers the terms new suppliers ask about', () => {
  for (const id of ['sicaf', 'cnd', 'me-epp', 'cota-reservada', 'pregao', 'dispensa', 'registro-de-precos', 'impugnacao', 'recurso', 'habilitacao', 'proposta', 'lance', 'garantia-proposta', 'garantia-contratual', 'atestado-capacidade-tecnica', 'lei-14133', 'regularizacao-me-epp']) {
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

test('no alias points to two entries', () => {
  const owners = new Map<string, string>();
  for (const entry of GLOSSARY) {
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
