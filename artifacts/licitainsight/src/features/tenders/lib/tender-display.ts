import type { TenderItem, TenderSummary } from '@/api/types';

/** "Campinas, SP" · "SP" · `null` when the source has no location at all. */
export function formatPlace(location: TenderSummary['location']): string | null {
  const parts = [location.city, location.state].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

/** First highlight fragment for a field, if the API sent one. */
export const highlightFor = (tender: TenderSummary, field: 'title' | 'objectSummary' | 'items') =>
  tender.relevance.highlights.find((h) => h.field === field)?.fragments[0];

// Per-character fold keeps indexes aligned with the original string (Latin accents fold to one char).
const fold = (text: string) =>
  Array.from(
    text,
    (c) =>
      c
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase() || c,
  ).join('');

/**
 * `tenderNumber` without the leading modality phrase: "Pregão - Eletrônico 26000415/2026" → "26000415/2026".
 * Accent-, case- and punctuation-insensitive; checks the source label and our normalized label. Returns the original when nothing matches.
 */
export function shortTenderNumber(tender: Pick<TenderSummary, 'tenderNumber' | 'tenderNumberShort' | 'modalityLabel'>, modalityLabel?: string): string | null {
  // Servers ≥ CLAUDE_HANDOFF-003 send it; the prefix-stripping below is the fallback for older ones.
  if (tender.tenderNumberShort) return tender.tenderNumberShort;
  const number = tender.tenderNumber;
  if (!number) return null;
  const folded = fold(number);
  for (const label of [tender.modalityLabel, modalityLabel]) {
    const words = label ? fold(label).match(/[a-z0-9]+/g) : null;
    if (!words) continue;
    const match = new RegExp(`^[^a-z0-9]*${words.join('[^a-z0-9]+')}[^a-z0-9]*`).exec(folded);
    if (match && match[0].length < number.length) return number.slice(match[0].length);
  }
  return number;
}

/** True when the text is mostly capitals (common in PNCP objetos). Used to step the type size down — the text itself is never altered. */
export function isMostlyUppercase(text: string): boolean {
  const letters: string[] = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 20) return false;
  return letters.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / letters.length > 0.6;
}

/** Relevance is only informative when it differs across the visible results (real data often returns 1.0 for everything). */
export function relevanceVaries(tenders: TenderSummary[]): boolean {
  const scores = new Set(tenders.map((t) => t.relevance.score).filter((s): s is number => s !== null));
  return scores.size > 1;
}

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
