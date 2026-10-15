import { GLOSSARY, type GlossaryEntry } from '../glossary';

/** Lowercase without accents, one output unit per input unit where possible, plus the map back to the original indices. */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let index = 0;
  for (const char of text) {
    const base = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let unit = 0; unit < base.length; unit++) map.push(index);
    folded += base;
    index += char.length;
  }
  map.push(text.length);
  return { folded, map };
}

export const fold = (text: string) => foldWithMap(text).folded;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Folded alias → entry id. Built once from the glossary; entries with `detect: false` are left out. */
export function buildMatcher(entries: GlossaryEntry[]) {
  const aliasToId = new Map<string, string>();
  for (const entry of entries) {
    if (entry.detect === false) continue;
    for (const alias of [entry.term, ...entry.aliases]) {
      const key = fold(alias.trim());
      if (key && !aliasToId.has(key)) aliasToId.set(key, entry.id);
    }
  }
  // Longest first, so "pregão eletrônico" wins over "pregão" and "garantia de proposta" over "proposta" at the same position.
  const alternatives = [...aliasToId.keys()].sort((a, b) => b.length - a.length).map(escape);
  // Whole words only: "dispensa" must not match inside "dispensada".
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return { aliasToId, pattern };
}

const defaultMatcher = buildMatcher(GLOSSARY);

export type GlossarySegment = string | { termId: string; text: string };

/**
 * Splits plain text into text and glossary terms. Only the first occurrence of each term is marked; `claim` lets a
 * surrounding scope refuse a term already marked elsewhere on the page (later occurrences in this text stay plain too).
 */
export function segmentGlossary(text: string, claim: (termId: string) => boolean = () => true, matcher = defaultMatcher): GlossarySegment[] {
  const { folded, map } = foldWithMap(text);
  const segments: GlossarySegment[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const match of folded.matchAll(matcher.pattern)) {
    const termId = matcher.aliasToId.get(match[0]);
    if (!termId || seen.has(termId)) continue;
    seen.add(termId);
    if (!claim(termId)) continue;
    const start = map[match.index];
    const end = map[match.index + match[0].length];
    if (start > last) segments.push(text.slice(last, start));
    segments.push({ termId, text: text.slice(start, end) });
    last = end;
  }
  if (last < text.length) segments.push(text.slice(last));
  return segments;
}

/** The entry whose term or alias is exactly this label (filter options, fixed labels); undefined when none. */
export function entryForLabel(label: string, matcher = defaultMatcher) {
  return matcher.aliasToId.get(fold(label.trim()));
}
