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

  it('scrubs both opted-in moments while scrolling down', () => {
    const initial = createPardalScrollMemory(0);
    const iaApproach = resolvePardalScroll({ reducedMotion: false, scrollY: 200, sections: sections(800), viewportHeight: 1000 }, initial);

    assert.equal(iaApproach.activeKey, 'ia');
    assert.equal(iaApproach.curtainKey, null);
    assert.equal(iaApproach.restingSide, 0);
    assert.ok(Math.abs(iaApproach.localProgress - 1 / 7) < 1e-10);

    const iaPeak = resolvePardalScroll({ reducedMotion: false, scrollY: 500, sections: sections(500), viewportHeight: 1000 }, iaApproach.memory);
    assert.equal(iaPeak.activeKey, 'ia');
    assert.equal(iaPeak.curtainKey, 'ia');
    assert.equal(iaPeak.localProgress, 1);
    assert.equal(iaPeak.restingSide, 1);

    const between = resolvePardalScroll({ reducedMotion: false, scrollY: 1200, sections: sections(-200), viewportHeight: 1000 }, iaPeak.memory);
    assert.equal(between.activeKey, null);
    assert.equal(between.restingSide, 1);

    const planApproach = resolvePardalScroll({ reducedMotion: false, scrollY: 2000, sections: sections(-1000), viewportHeight: 1000 }, between.memory);
    assert.equal(planApproach.activeKey, 'plano');
    assert.ok(Math.abs(planApproach.localProgress - 1 / 7) < 1e-10);

    const planPeak = resolvePardalScroll({ reducedMotion: false, scrollY: 2300, sections: sections(-1300), viewportHeight: 1000 }, planApproach.memory);
    assert.equal(planPeak.activeKey, 'plano');
    assert.equal(planPeak.curtainKey, 'plano');
    assert.equal(planPeak.localProgress, 1);
    assert.equal(planPeak.restingSide, 0);
  });

  it('scrubs both opted-in moments in reverse while scrolling up', () => {
    const bottom = resolvePardalScroll(
      { reducedMotion: false, scrollY: 3000, sections: sections(-2000), viewportHeight: 1000 },
      createPardalScrollMemory(3000),
    );
    assert.equal(bottom.activeKey, null);

    const planCurtain = resolvePardalScroll({ reducedMotion: false, scrollY: 2750, sections: sections(-1750), viewportHeight: 1000 }, bottom.memory);
    assert.equal(planCurtain.activeKey, 'plano');
    assert.equal(planCurtain.curtainKey, 'plano');
    assert.equal(planCurtain.localProgress, 2);

    const planPeak = resolvePardalScroll({ reducedMotion: false, scrollY: 2300, sections: sections(-1300), viewportHeight: 1000 }, planCurtain.memory);
    assert.equal(planPeak.localProgress, 1);
    assert.equal(planPeak.restingSide, 0);

    const planApproach = resolvePardalScroll({ reducedMotion: false, scrollY: 2050, sections: sections(-1050), viewportHeight: 1000 }, planPeak.memory);
    assert.equal(planApproach.curtainKey, null);
    assert.ok(Math.abs(planApproach.localProgress - 2 / 7) < 1e-10);
    assert.equal(planApproach.restingSide, 1);

    const iaCurtain = resolvePardalScroll({ reducedMotion: false, scrollY: 950, sections: sections(50), viewportHeight: 1000 }, planApproach.memory);
    assert.equal(iaCurtain.activeKey, 'ia');
    assert.equal(iaCurtain.curtainKey, 'ia');
    assert.equal(iaCurtain.localProgress, 2);

    const iaPeak = resolvePardalScroll({ reducedMotion: false, scrollY: 500, sections: sections(500), viewportHeight: 1000 }, iaCurtain.memory);
    assert.equal(iaPeak.localProgress, 1);
    assert.equal(iaPeak.restingSide, 1);

    const iaApproach = resolvePardalScroll({ reducedMotion: false, scrollY: 250, sections: sections(750), viewportHeight: 1000 }, iaPeak.memory);
    assert.equal(iaApproach.curtainKey, null);
    assert.ok(Math.abs(iaApproach.localProgress - 2 / 7) < 1e-10);
    assert.equal(iaApproach.restingSide, 0);
  });

  it('restores the exact initial state after returning to the top and can play again', () => {
    const initialInput = { reducedMotion: false, scrollY: 0, sections: sections(1000), viewportHeight: 1000 } as const;
    const initial = resolvePardalScroll(initialInput, createPardalScrollMemory(0));
    const bottom = resolvePardalScroll({ reducedMotion: false, scrollY: 3000, sections: sections(-2000), viewportHeight: 1000 }, initial.memory);
    const returned = resolvePardalScroll(initialInput, bottom.memory);

    assert.deepEqual(returned, initial);

    const replay = resolvePardalScroll({ reducedMotion: false, scrollY: 200, sections: sections(800), viewportHeight: 1000 }, returned.memory);
    assert.equal(replay.activeKey, 'ia');
    assert.ok(replay.localProgress > 0);
  });

  it('never returns a flight or curtain with reduced motion', () => {
    const result = resolvePardalScroll({ reducedMotion: true, scrollY: 500, sections: sections(500), viewportHeight: 1000 }, createPardalScrollMemory(0));

    assert.equal(result.activeKey, null);
    assert.equal(result.curtainKey, null);
    assert.equal(result.localProgress, 0);
    assert.equal(result.restingSide, 0);
  });
});
