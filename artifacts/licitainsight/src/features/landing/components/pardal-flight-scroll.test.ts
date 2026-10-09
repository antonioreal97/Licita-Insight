import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPardalScrollMemory, resolvePardalScroll, selectPardalMomentBoundaries, type PardalScrollSection } from './pardal-flight-scroll';

const sections = (iaTop: number): PardalScrollSection[] => [
  { key: 'hero', top: -600, moment: false },
  { key: 'performance', top: -100, moment: false },
  { key: 'ia', top: iaTop, moment: true },
  { key: 'como-funciona', top: iaTop + 900, moment: false },
  { key: 'plano', top: iaTop + 1800, moment: true },
];

describe('Pardal scroll moments', () => {
  it('selects boundaries only before opted-in sections', () => {
    assert.deepEqual(
      selectPardalMomentBoundaries([
        { key: 'hero', top: 0, moment: true },
        { key: 'servicos', top: 500, moment: false },
        { key: 'ia', top: 1000, moment: true },
        { key: 'plano', top: 2000, moment: true },
      ]).map((section) => section.key),
      ['ia', 'plano'],
    );
  });

  it('consumes each moment once per page load, even when the visitor scrolls back', () => {
    const initial = createPardalScrollMemory(0);
    const first = resolvePardalScroll({ reducedMotion: false, scrollY: 200, sections: sections(800), viewportHeight: 1000 }, initial);

    assert.equal(first.activeKey, 'ia');
    assert.equal(first.restingSide, 0);
    assert.deepEqual(first.memory.visitedKeys, ['ia']);

    const peak = resolvePardalScroll({ reducedMotion: false, scrollY: 550, sections: sections(450), viewportHeight: 1000 }, first.memory);
    assert.equal(peak.restingSide, 1);

    const upward = resolvePardalScroll({ reducedMotion: false, scrollY: 100, sections: sections(900), viewportHeight: 1000 }, peak.memory);
    assert.equal(upward.activeKey, null);

    const secondDescent = resolvePardalScroll({ reducedMotion: false, scrollY: 200, sections: sections(800), viewportHeight: 1000 }, upward.memory);
    assert.equal(secondDescent.activeKey, null);
    assert.equal(secondDescent.restingSide, 1);
    assert.deepEqual(secondDescent.memory.visitedKeys, ['ia']);
  });

  it('never returns a flight or curtain with reduced motion', () => {
    const result = resolvePardalScroll({ reducedMotion: true, scrollY: 500, sections: sections(500), viewportHeight: 1000 }, createPardalScrollMemory(0));

    assert.equal(result.activeKey, null);
    assert.equal(result.curtainKey, null);
    assert.equal(result.localProgress, 0);
    assert.deepEqual(result.memory.visitedKeys, ['ia']);
  });
});
