import { GLOSSARY, type GlossaryEntry } from '../glossary';
import { fold } from './term-detection';

/**
 * Glossary search for /ajuda: every word of the query must appear (accent- and case-insensitive) in the term, an alias,
 * the definition or "o que fazer". Matches in the term or an alias come first; otherwise the glossary order is kept.
 */
export function searchGlossary(query: string, entries: GlossaryEntry[] = GLOSSARY): GlossaryEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return entries;
  const scored: { entry: GlossaryEntry; score: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const names = fold([entry.term, ...entry.aliases].join(' \n '));
    const body = fold(`${entry.definition} ${entry.whatToDo}`);
    if (!words.every((word) => names.includes(word) || body.includes(word))) return;
    const score = words.filter((word) => names.includes(word)).length;
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(({ entry }) => entry);
}
