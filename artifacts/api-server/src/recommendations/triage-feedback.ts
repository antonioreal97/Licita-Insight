/** Versioned marker kept in the existing JSONB terms array; never treated as a search term. */
const PREFIX = "@triage:v1:";
export const DISMISS_REASONS = [
  "not_offering",
  "region",
  "value",
  "deadline",
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];

type TenderSignal = {
  state: string | null;
  municipalityIbge?: string | null;
  estimatedValue: string | null;
  estimatedValueFlag?: string | null;
};

export function isDismissReason(value: unknown): value is DismissReason {
  return DISMISS_REASONS.includes(value as DismissReason);
}

export function dismissalTerms(
  reason: DismissReason | undefined,
  terms: string[],
  tender: TenderSignal,
): string[] {
  if (!reason) return terms;
  const marker =
    PREFIX +
    JSON.stringify({
      reason,
      state: tender.state,
      municipalityIbge: tender.municipalityIbge ?? null,
      value: tender.estimatedValueFlag
        ? null
        : Number(tender.estimatedValue) || null,
    });
  return reason === "not_offering" ? [...terms, marker] : [marker];
}

/** null means topic feedback (legacy or "not_offering"): keep the term/category penalty. */
export function contextualDismissalPenalty(
  terms: string[],
  candidate: TenderSignal & { proposalDeadline: Date | null },
  now: Date,
): number | null {
  const marker = terms.find((term) => term.startsWith(PREFIX));
  if (!marker) return null;
  // Only the server writes this marker (JSON.stringify above); a parse error is a real bug.
  const feedback = JSON.parse(marker.slice(PREFIX.length)) as {
    reason: DismissReason;
    state: string | null;
    municipalityIbge?: string | null;
    value: number | null;
  };
  if (feedback.reason === "region") {
    // 10 (was 4): one "Fora da minha região" must dent the +32 location boost enough
    // to demote that UF/município in the next rebuild; still under MAX_DISMISSAL_PENALTY (12).
    if (
      feedback.municipalityIbge &&
      candidate.municipalityIbge &&
      feedback.municipalityIbge === candidate.municipalityIbge
    )
      return 10;
    return feedback.state && feedback.state === candidate.state ? 10 : 0;
  }
  if (feedback.reason === "value") {
    const value = candidate.estimatedValueFlag
      ? 0
      : Number(candidate.estimatedValue);
    return value > 0 &&
      feedback.value &&
      feedback.value > 0 &&
      Math.abs(value / feedback.value - 1) <= 0.25
      ? 4
      : 0;
  }
  if (feedback.reason === "deadline") {
    const days = candidate.proposalDeadline
      ? (candidate.proposalDeadline.getTime() - now.getTime()) / 86_400_000
      : Infinity;
    return days >= 0 && days <= 3 ? 4 : 0;
  }
  return null;
}
