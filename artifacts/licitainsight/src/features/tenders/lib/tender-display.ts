import type { TenderItem, TenderSummary } from '@/api/types';

/** "Campinas, SP" · "SP" · `null` when the source has no location at all. */
export function formatPlace(location: TenderSummary['location']): string | null {
  const parts = [location.city, location.state].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** First highlight fragment for a field, if the API sent one. */
export const highlightFor = (tender: TenderSummary, field: 'title' | 'objectSummary' | 'items') =>
  tender.relevance.highlights.find((h) => h.field === field)?.fragments[0];

export type ItemsTotal = {
  /** Sum of the items that have `estimatedTotalValue`; `null` when none do. */
  total: number | null;
  /** How many items have no total value (sigiloso / not published). */
  missing: number;
};

export function sumItems(items: TenderItem[]): ItemsTotal {
  let total: number | null = null;
  let missing = 0;
  for (const item of items) {
    if (item.estimatedTotalValue === null) missing += 1;
    else total = (total ?? 0) + item.estimatedTotalValue;
  }
  return { total: total === null ? null : Math.round(total * 100) / 100, missing };
}
