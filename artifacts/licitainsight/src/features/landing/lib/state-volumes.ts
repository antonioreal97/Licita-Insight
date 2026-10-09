import type { OpenTendersByState } from '@/api';
import { formatCurrencyCompact, formatNumber } from '@/lib/format';
import { UF_NAMES, UFS, type Uf } from '@/lib/ufs';
import { buildVolumeScale, volumeLevel, type VolumeBand } from './volume-scale';

export type StateVolume = {
  uf: Uf;
  name: string;
  openTenders: number;
  estimatedValueTotal: number | null;
  /** Position on the volume scale: 0 without open tenders, up to `VOLUME_LEVELS`. */
  level: number;
  /** Search already filtered by this state; it opens on open tenders by default. */
  href: string;
  /** "1.234 editais abertos" */
  countText: string;
  /** "R$ 2,3 bi em valor estimado", or why there is no value. */
  valueText: string;
};

export const openTendersText = (count: number) =>
  count === 0 ? 'nenhum edital aberto' : `${formatNumber(count)} ${count === 1 ? 'edital aberto' : 'editais abertos'}`;

const valueText = (count: number, total: number | null) => {
  if (count === 0) return '';
  return total === null ? 'valor estimado não informado' : `${formatCurrencyCompact(total)} em valor estimado`;
};

/** The 27 states in code order, each with its level on a scale built from the same numbers. */
export function toStateVolumes(data: readonly OpenTendersByState[]): { states: StateVolume[]; scale: VolumeBand[] } {
  const byCode = new Map(data.map((entry) => [entry.state, entry]));
  const scale = buildVolumeScale(UFS.map((uf) => byCode.get(uf)?.openTenders ?? 0));
  const states = UFS.map((uf) => {
    const openTenders = byCode.get(uf)?.openTenders ?? 0;
    const estimatedValueTotal = byCode.get(uf)?.estimatedValueTotal ?? null;
    return {
      uf,
      name: UF_NAMES[uf],
      openTenders,
      estimatedValueTotal,
      level: volumeLevel(openTenders, scale),
      href: `/search?state=${uf}`,
      countText: openTendersText(openTenders),
      valueText: valueText(openTenders, estimatedValueTotal),
    };
  });
  return { states, scale };
}

/** States with open tenders, most first; ties in code order. */
export const rankStates = (states: readonly StateVolume[]) =>
  states.filter((state) => state.openTenders > 0).sort((a, b) => b.openTenders - a.openTenders || a.uf.localeCompare(b.uf));

/** Accessible name of a state on the map and in the ranking. */
export const stateLabel = (state: StateVolume) => [`${state.name}: ${state.countText}`, state.valueText].filter(Boolean).join(', ');
