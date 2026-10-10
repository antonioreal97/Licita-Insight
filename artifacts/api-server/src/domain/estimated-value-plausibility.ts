import type { Modality } from "@workspace/api-zod";
import type { EstimatedValueFlag } from "@workspace/db/schema";

/**
 * Plausibility of the estimated value published by the source. The source sometimes carries typing errors of
 * several orders of magnitude (a R$ 938 billion "dispensa" for ballistic vests), and a single one of them
 * dominates every sum and ranking. The official value is never corrected or hidden: a flagged value is only kept
 * out of sums, rankings and value filters, and shown with a warning.
 *
 * Three rules, from the strongest claim to the weakest. A missed error is preferred to a wrong accusation, so
 * every limit sits far above anything a real tender is known to reach:
 *
 * 1. `absolute_ceiling`: no single public tender in Brazil comes near R$ 100 billion; the largest concessions
 *    are in the tens of billions.
 * 2. `dispensa_legal_limit`: a "dispensa" by value (Lei 14.133/2021, art. 75, I and II) has a legal limit.
 *    Bodies do exceed it (consortia have twice the limit, multi-year contracts, a wrong legal basis picked in
 *    the form), so only a value a thousand times above it is flagged. Emergency and the other grounds of
 *    art. 75 have no legal limit and are left to rule 3.
 * 3. `modality_outlier`: a value more than a thousand times the 99th percentile of its modality. Typing errors
 *    multiply by thousands or millions; real tenders do not. Modalities used for concessions and for mixed
 *    procedures have no meaningful percentile and are left to rule 1.
 *
 * Known misses, accepted: an error of a few orders of magnitude inside a modality with a long legitimate tail
 * (a R$ 5 billion "pregão" for weeding is indistinguishable, by modality alone, from a national price
 * registration of that size).
 */
export const ABSOLUTE_CEILING = 100_000_000_000;

/**
 * Art. 75, I (engineering works and services), the higher of the two limits by value, as updated for 2025 by
 * Decreto 12.343/2024. The yearly update moves it by a few percent; the factor below is three orders of magnitude.
 */
export const DISPENSA_LEGAL_LIMIT = 125_451.15;
export const DISPENSA_LEGAL_LIMIT_FACTOR = 1_000;

/**
 * 99th percentile of the estimated value per modality, rounded, measured on the synthetic sample of
 * `estimated-value-sample.ts` (shaped after the quantiles of the open tenders in production). To recalibrate
 * with real data: `select modality, percentile_cont(0.99) within group (order by estimated_value) from tenders
 * where estimated_value > 0 group by modality`.
 */
export const MODALITY_P99: Partial<Record<Modality, number>> = {
  dispensa: 1_300_000,
  inexigibilidade: 6_000_000,
  pregao_presencial: 15_000_000,
  pregao_eletronico: 80_000_000,
  credenciamento: 30_000_000,
};
export const MODALITY_OUTLIER_FACTOR = 1_000;

const BY_VALUE_GROUND = /\bart\.?\s*75\s*,?\s*(?:inciso\s+)?i{1,2}(?![ivx\p{L}])/iu;

/** True for the legal basis text of a "dispensa" by value, e.g. "Lei 14.133/2021, Art. 75, II". */
export const isDispensaByValue = (legalBasis: string | null | undefined): boolean =>
  typeof legalBasis === "string" && /14\.?133/.test(legalBasis) && BY_VALUE_GROUND.test(legalBasis);

export type EstimatedValueInput = {
  value: number | string | null;
  modality: string;
  /** Legal basis as published by the source; only read for "dispensa". */
  legalBasis?: string | null;
};

export type EstimatedValueLimit = { flag: EstimatedValueFlag; limit: number };

/** Every limit that applies to a tender, strongest claim first. */
export const estimatedValueLimits = (
  modality: string,
  legalBasis?: string | null,
): EstimatedValueLimit[] => {
  const limits: EstimatedValueLimit[] = [{ flag: "absolute_ceiling", limit: ABSOLUTE_CEILING }];
  if (modality === "dispensa" && isDispensaByValue(legalBasis)) {
    limits.push({
      flag: "dispensa_legal_limit",
      limit: DISPENSA_LEGAL_LIMIT * DISPENSA_LEGAL_LIMIT_FACTOR,
    });
  }
  const p99 = MODALITY_P99[modality as Modality];
  if (p99 !== undefined) {
    limits.push({ flag: "modality_outlier", limit: p99 * MODALITY_OUTLIER_FACTOR });
  }
  return limits;
};

/** Lowest value any rule can flag; the review job and its index rely on it never going below the review floor. */
export const lowestEstimatedValueLimit = (): number =>
  Math.min(
    ABSOLUTE_CEILING,
    DISPENSA_LEGAL_LIMIT * DISPENSA_LEGAL_LIMIT_FACTOR,
    ...Object.values(MODALITY_P99).map((p99) => p99 * MODALITY_OUTLIER_FACTOR),
  );

/** The reason the value is implausible, or `null`. Absent, zero, negative and non-numeric values are never flagged. */
export const assessEstimatedValue = (input: EstimatedValueInput): EstimatedValueFlag | null => {
  if (input.value === null || input.value === "") return null;
  const value = typeof input.value === "number" ? input.value : Number(input.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return (
    estimatedValueLimits(input.modality, input.legalBasis).find(({ limit }) => value > limit)?.flag ?? null
  );
};
