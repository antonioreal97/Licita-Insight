import type { Modality } from "@workspace/api-zod";

/**
 * Synthetic open tenders used to choose and to check the plausibility limits. Nothing here is real data:
 * values are drawn from one log-normal curve per modality, with shares and medians chosen so that the whole
 * sample reproduces the quantiles measured on the open tenders in production (median ~R$ 11 thousand,
 * p99 ~R$ 42 million, p99.9 ~R$ 406 million, p99.99 ~R$ 2.2 billion). The draw is seeded, so every run and
 * every test sees the same sample.
 */
export type SampleTender = {
  modality: Modality;
  value: number;
  legalBasis: string | null;
};

type Curve = {
  modality: Modality;
  share: number;
  median: number;
  sigma: number;
  /** Largest value the curve may produce: a log-normal tail is heavier than the measured one. */
  cap: number;
  legalBasis: string | null;
};

const DISPENSA_BY_VALUE = "Lei 14.133/2021, Art. 75, II";
const DISPENSA_EMERGENCY = "Lei 14.133/2021, Art. 75, VIII";

const CURVES: readonly Curve[] = [
  { modality: "dispensa", share: 0.5, median: 4_800, sigma: 1.2, cap: 2_000_000, legalBasis: DISPENSA_BY_VALUE },
  { modality: "dispensa", share: 0.03, median: 200_000, sigma: 2.0, cap: 900_000_000, legalBasis: DISPENSA_EMERGENCY },
  { modality: "pregao_eletronico", share: 0.28, median: 105_000, sigma: 2.85, cap: 9_000_000_000, legalBasis: null },
  { modality: "pregao_presencial", share: 0.03, median: 70_000, sigma: 2.3, cap: 2_000_000_000, legalBasis: null },
  { modality: "inexigibilidade", share: 0.08, median: 22_000, sigma: 2.4, cap: 3_000_000_000, legalBasis: null },
  { modality: "concorrencia_eletronica", share: 0.04, median: 1_000_000, sigma: 2.5, cap: 30_000_000_000, legalBasis: null },
  { modality: "concorrencia", share: 0.01, median: 1_200_000, sigma: 2.6, cap: 30_000_000_000, legalBasis: null },
  { modality: "credenciamento", share: 0.015, median: 130_000, sigma: 2.3, cap: 5_000_000_000, legalBasis: null },
  { modality: "leilao", share: 0.01, median: 40_000, sigma: 2.1, cap: 2_000_000_000, legalBasis: null },
  { modality: "other", share: 0.005, median: 60_000, sigma: 2.2, cap: 5_000_000_000, legalBasis: null },
];

/** mulberry32: small, fast and deterministic, which is all a calibration sample needs. */
const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
};

export const syntheticOpenTenders = (size = 200_000, seed = 20261009): SampleTender[] => {
  const random = seededRandom(seed);
  const normal = (): number => {
    const u = Math.max(random(), Number.MIN_VALUE);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  };
  const tenders: SampleTender[] = [];
  for (const curve of CURVES) {
    const count = Math.round(size * curve.share);
    for (let index = 0; index < count; index += 1) {
      const value = Math.min(curve.cap, curve.median * Math.exp(curve.sigma * normal()));
      tenders.push({
        modality: curve.modality,
        value: Math.max(0.01, Number(value.toFixed(2))),
        legalBasis: curve.legalBasis,
      });
    }
  }
  return tenders;
};

/** Nearest-rank quantile of an unsorted list; `null` for an empty one. */
export const quantile = (values: readonly number[], q: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? null;
};
