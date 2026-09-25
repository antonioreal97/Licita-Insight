/** Question words too common in a tender to be worth marking. */
const STOPWORDS = new Set(
  'para pela pelo pelos pelas como qual quais quando onde qual quem esta este isso essa esse existe exige exigida exigido pode podem deve devem ser sera tem temos algum alguma sobre edital licitacao'.split(
    ' ',
  ),
);

/** Accent- and case-insensitive; the first 6 letters stand in for a stem ("consórcio" ~ "consórcios"). */
const stem = (word: string) =>
  word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 6);

export function questionStems(question: string): Set<string> {
  const words = question.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4);
  return new Set(words.map((word) => word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')).filter((word) => !STOPWORDS.has(word)).map(stem));
}

/** Splits `text` into plain and matching runs, keeping every character (the passage is the official text). */
export function markQuestionTerms(text: string, stems: Set<string>): { text: string; match: boolean }[] {
  if (stems.size === 0) return [{ text, match: false }];
  return text.split(/([\p{L}\p{N}]+)/u).map((part) => ({ text: part, match: part.length >= 4 && stems.has(stem(part)) }));
}
