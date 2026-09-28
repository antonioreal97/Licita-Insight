import type { SavedTender, TenderFit, TenderSummary } from '@/api/types';

/** Each input is already sorted/limited by the server; four from each stage suffice for the global top four. */
export function nearestSavedDeadlines(analyzing: SavedTender[], preparing: SavedTender[], now = Date.now()): SavedTender[] {
  return [...analyzing, ...preparing]
    .filter(({ tender, stage }) => ['analyzing', 'participating'].includes(stage) && tender.proposalDeadline && Date.parse(tender.proposalDeadline) > now)
    .sort((a, b) => Date.parse(a.tender.proposalDeadline!) - Date.parse(b.tender.proposalDeadline!) || a.tender.id.localeCompare(b.tender.id))
    .slice(0, 4);
}

/** This is a shortlist, not a claim that the entire catalog was matched against the profile. */
export function matchingCandidates(tenders: TenderSummary[], fits: Record<string, TenderFit>): TenderSummary[] {
  return tenders.filter(tender => fits[tender.id]?.status === 'ready' && ['high', 'medium'].includes(fits[tender.id]?.level ?? ''));
}
