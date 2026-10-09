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
  switchedKeys: readonly string[];
  visitedKeys: readonly string[];
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
  return { activeKey: null, lastScrollY: scrollY, restingSide: 0, switchedKeys: [], visitedKeys: [] };
}

/**
 * Pure scroll state machine. A moment is consumed as soon as its trigger line is crossed while scrolling down;
 * cancelling it by scrolling up therefore cannot replay it during the same page load.
 */
export function resolvePardalScroll(input: ResolvePardalScrollInput, memory: PardalScrollMemory): PardalScrollResult {
  const { reducedMotion, scrollY, sections, viewportHeight } = input;
  const moments = selectPardalMomentBoundaries(sections);
  const movingDown = scrollY > memory.lastScrollY;
  const movingUp = scrollY < memory.lastScrollY;
  const triggerTop = viewportHeight * (0.5 + APPROACH);
  const visited = new Set(memory.visitedKeys);
  const switched = new Set(memory.switchedKeys);
  let restingSide = memory.restingSide;
  let activeKey = reducedMotion || movingUp ? null : memory.activeKey;

  if (movingDown) {
    const scrollDelta = scrollY - memory.lastScrollY;
    for (const moment of moments) {
      if (visited.has(moment.key)) continue;
      const previousTop = moment.top + scrollDelta;
      if (previousTop > triggerTop && moment.top <= triggerTop) {
        visited.add(moment.key);
        if (!reducedMotion && activeKey === null && moment.top > 0) activeKey = moment.key;
      }
    }
  }

  const active = moments.find((moment) => moment.key === activeKey);
  if (!active || active.top <= 0) activeKey = null;

  let localProgress = 0;
  let curtainKey: string | null = null;
  if (activeKey && active) {
    const distance = (viewportHeight / 2 - active.top) / viewportHeight;
    localProgress = distance < 0 ? clamp01((distance + APPROACH) / APPROACH) : 1 + clamp01(distance / FADE);
    if (localProgress >= 1 && active.top > 0) curtainKey = activeKey;
    if (localProgress >= 1 && !switched.has(activeKey)) {
      switched.add(activeKey);
      restingSide = (restingSide + 1) % 2;
    }
  }

  return {
    activeKey,
    curtainKey,
    localProgress,
    memory: {
      activeKey,
      lastScrollY: scrollY,
      restingSide,
      switchedKeys: [...switched],
      visitedKeys: [...visited],
    },
    restingSide,
  };
}
