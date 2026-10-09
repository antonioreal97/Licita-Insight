export const PARDAL_MOMENT_ATTRIBUTE = 'data-pardal-momento';

export type PardalScrollSection = {
  key: string;
  top: number;
  moment: boolean;
};

export type PardalScrollMemory = {
  activeKey: string | null;
  lastScrollY: number;
  restingSide: number;
};

export type PardalScrollResult = {
  activeKey: string | null;
  curtainKey: string | null;
  localProgress: number;
  memory: PardalScrollMemory;
  restingSide: number;
};

type ResolvePardalScrollInput = {
  reducedMotion: boolean;
  scrollY: number;
  sections: readonly PardalScrollSection[];
  viewportHeight: number;
};

const APPROACH = 0.35;
const FADE = 0.08;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Only opted-in sections after the first section have a boundary that can become a Pardal moment. */
export function selectPardalMomentBoundaries(sections: readonly PardalScrollSection[]) {
  return sections.filter((section, index) => index > 0 && section.moment);
}

export function createPardalScrollMemory(scrollY: number): PardalScrollMemory {
  return { activeKey: null, lastScrollY: scrollY, restingSide: 0 };
}

/**
 * Pure, position-driven scroll state. Keeping progress tied to a boundary's viewport position makes every moment
 * scrub identically in both directions and guarantees that returning to the same scroll position restores the same
 * visual state.
 */
export function resolvePardalScroll(input: ResolvePardalScrollInput, memory: PardalScrollMemory): PardalScrollResult {
  const { reducedMotion, scrollY, sections, viewportHeight } = input;
  const moments = selectPardalMomentBoundaries(sections);
  const triggerTop = viewportHeight * (0.5 + APPROACH);
  const active = reducedMotion ? undefined : moments.findLast((moment) => moment.top >= 0 && moment.top <= triggerTop);
  const activeKey = active?.key ?? null;
  // The side changes while the bird covers the viewport, then changes back at the same boundary when scrolling up.
  const restingSide = reducedMotion ? 0 : moments.filter((moment) => moment.top <= viewportHeight / 2).length % 2;

  let localProgress = 0;
  let curtainKey: string | null = null;
  if (active) {
    const distance = (viewportHeight / 2 - active.top) / viewportHeight;
    localProgress = distance < 0 ? clamp01((distance + APPROACH) / APPROACH) : 1 + clamp01(distance / FADE);
    if (localProgress >= 1) curtainKey = activeKey;
  }

  return {
    activeKey,
    curtainKey,
    localProgress,
    memory: {
      activeKey,
      lastScrollY: scrollY,
      restingSide,
    },
    restingSide,
  };
}
