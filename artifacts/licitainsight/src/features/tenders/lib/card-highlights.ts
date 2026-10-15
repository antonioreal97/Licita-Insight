import type { FitReason, TenderFit, TenderHighlights } from '@/api';

/** The card shows at most this many requirements (the API already sends them most decisive first). */
export const CARD_REQUIREMENT_LIMIT = 3;

export type CardHighlights = {
  /** The one reason that explains the fit badge; rendered with the badge's own sentence. */
  fitReason: FitReason | null;
  requirements: string[];
};

const POSITIVE: ReadonlySet<FitReason['kind']> = new Set(['offering_match', 'service_region']);
const NEGATIVE: ReadonlySet<FitReason['kind']> = new Set(['exclusion', 'out_of_coverage', 'out_of_value_range', 'size_restricted']);

/** A good fit is explained by what matched; a weak or filtered one by what ruled it out. */
export function mainFitReason(fit: TenderFit | undefined): FitReason | null {
  if (!fit) return null;
  const good = fit.status === 'ready' && (fit.level === 'high' || fit.level === 'medium');
  const weak = fit.status === 'filtered' || (fit.status === 'ready' && fit.level === 'low');
  if (!good && !weak) return null;
  const kinds = good ? POSITIVE : NEGATIVE;
  return fit.reasons.find((reason) => kinds.has(reason.kind) && (reason.kind !== 'offering_match' || reason.terms.length > 0)) ?? null;
}

/**
 * "Destaques" of a result card, from data already loaded for the page (fits and requirement highlights). Nothing
 * to say → null, and the card renders exactly as before.
 */
export function cardHighlights(highlights: TenderHighlights | undefined, fit: TenderFit | undefined): CardHighlights | null {
  const requirements = (highlights?.requirements ?? []).slice(0, CARD_REQUIREMENT_LIMIT).map(({ label }) => label);
  const fitReason = mainFitReason(fit);
  return requirements.length === 0 && !fitReason ? null : { fitReason, requirements };
}
