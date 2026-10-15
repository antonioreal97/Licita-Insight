import { PROFILE_LIMITS } from '@/services/ai-service';

/**
 * "O que sua empresa vende ou faz" is one list on screen, stored in the two profile fields the API already has:
 * a term picked from the edital vocabulary goes to `selectedKeywords`, a typed one to `offerings`. A typed term
 * equal to a vocabulary suggestion on screen counts as picked. The API requires at least one `offerings` entry,
 * so when every term came from the vocabulary the first one is saved as an offering (see `listsForSave`).
 * The combined, de-duplicated list holds at most `PROFILE_LIMITS.terms` terms.
 */
export type OfferingLists = { selectedKeywords: string[]; offerings: string[] };

export const OFFERING_TERMS_LIMIT = PROFILE_LIMITS.terms;

export const foldTerm = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/g, ' ');

/** Picked terms first, then typed ones, without repeating a term present in both lists (older profiles). */
export function combinedOfferingTerms(lists: OfferingLists): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const term of [...lists.selectedKeywords, ...lists.offerings]) {
    const key = foldTerm(term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result;
}

const has = (lists: OfferingLists, term: string) => combinedOfferingTerms(lists).some((item) => foldTerm(item) === foldTerm(term));

export function addSuggestedTerm(lists: OfferingLists, displayTerm: string): OfferingLists {
  if (has(lists, displayTerm) || combinedOfferingTerms(lists).length >= OFFERING_TERMS_LIMIT) return lists;
  return { ...lists, selectedKeywords: [...lists.selectedKeywords, displayTerm] };
}

/**
 * Splits on comma, semicolon or line break. `vocabulary` maps folded suggestion terms to their display form, so a
 * typed "Iluminacao cenica" is stored as the picked "iluminação cênica".
 */
export function addTypedTerms(
  lists: OfferingLists,
  text: string,
  vocabulary: ReadonlyMap<string, string> = new Map(),
): { lists: OfferingLists; added: number; skipped: number } {
  const parts = text
    .split(/[,;\n]/)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  let next = lists;
  let skipped = 0;
  for (const part of parts) {
    const valid = part.length >= PROFILE_LIMITS.termMin && part.length <= PROFILE_LIMITS.termMax;
    if (!valid || has(next, part) || combinedOfferingTerms(next).length >= OFFERING_TERMS_LIMIT) {
      skipped += 1;
      continue;
    }
    const picked = vocabulary.get(foldTerm(part));
    next = picked ? { ...next, selectedKeywords: [...next.selectedKeywords, picked] } : { ...next, offerings: [...next.offerings, part] };
  }
  return { lists: next, added: parts.length - skipped, skipped };
}

/** Removes the term from both lists. */
export function removeOfferingTerm(lists: OfferingLists, term: string): OfferingLists {
  const key = foldTerm(term);
  return {
    selectedKeywords: lists.selectedKeywords.filter((item) => foldTerm(item) !== key),
    offerings: lists.offerings.filter((item) => foldTerm(item) !== key),
  };
}

/** What the PUT sends: no term in both lists, and at least one offering whenever there is any term. */
export function listsForSave(lists: OfferingLists): OfferingLists {
  const selected = new Set(lists.selectedKeywords.map(foldTerm));
  const offerings = lists.offerings.filter((term) => !selected.has(foldTerm(term)));
  const selectedKeywords = combinedOfferingTerms({ selectedKeywords: lists.selectedKeywords, offerings: [] });
  if (offerings.length > 0 || selectedKeywords.length === 0) return { selectedKeywords, offerings };
  return { selectedKeywords: selectedKeywords.slice(1), offerings: selectedKeywords.slice(0, 1) };
}
