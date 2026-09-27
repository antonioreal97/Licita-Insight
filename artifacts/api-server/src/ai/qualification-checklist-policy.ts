export const QUALIFICATION_SEARCH_TERMS = [
  "habilitação",
  "qualificação técnica",
  "qualificação econômico",
  "regularidade fiscal",
  "regularidade trabalhista",
  "certidão negativa",
  "atestado de capacidade",
  "balanço patrimonial",
  "patrimônio líquido",
  "índice de liquidez",
  "capital social",
  "ato constitutivo",
  "contrato social",
  "registro no conselho",
  "CREA",
  "CRA",
  "CAU",
  "alvará",
  "garantia de participação",
] as const;

export const qualificationSearchQuery = (): string =>
  QUALIFICATION_SEARCH_TERMS.map((term) =>
    term.includes(" ") ? `"${term}"` : term,
  ).join(" OR ");

export type IndexedPagePassage = {
  order: number;
  text: string;
};

const words = (value: string): string[] => value.split(/\s+/u).filter(Boolean);

/**
 * Reconstitutes the page text stored as overlapping index passages. The
 * document index repeats the last 20 words when it starts a new passage; the
 * checklist must remove that overlap before looking for edital item markers.
 */
export function stitchIndexedPage(passages: IndexedPagePassage[]): string {
  const ordered = [...passages].sort((left, right) => left.order - right.order);
  const stitched: string[] = [];
  for (const passage of ordered) {
    const incoming = words(passage.text);
    if (incoming.length === 0) continue;
    if (stitched.length === 0) {
      stitched.push(...incoming);
      continue;
    }
    let overlap = 0;
    const maximum = Math.min(40, stitched.length, incoming.length);
    for (let size = maximum; size > 0; size -= 1) {
      const previous = stitched.slice(-size).join(" ");
      const next = incoming.slice(0, size).join(" ");
      if (previous === next) {
        overlap = size;
        break;
      }
    }
    stitched.push(...incoming.slice(overlap));
  }
  return stitched.join(" ").trim();
}

const ITEM_MARKER =
  /(?:^|\n|(?<=[.!?;:])\s+)(?=(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?\s+|[a-z]\)\s+))|\s+(?=\d{1,2}(?:\.\d{1,2}){1,3}\.?\s+)/gimu;

/**
 * Splits one extracted PDF page on numbered or lettered edital items. The
 * hierarchical-number fallback intentionally supports historical passages,
 * which were persisted without the original line breaks.
 */
export function segmentQualificationPage(pageText: string): string[] {
  const normalized = pageText
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t ]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();
  if (!normalized) return [];

  const starts = new Set<number>([0]);
  for (const match of normalized.matchAll(ITEM_MARKER)) {
    const boundary = match.index ?? 0;
    const leading = match[0] ?? "";
    starts.add(boundary + leading.length);
  }
  const offsets = [...starts].sort((left, right) => left - right);
  return offsets
    .map((start, index) =>
      normalized.slice(start, offsets[index + 1] ?? normalized.length).trim(),
    )
    .filter(Boolean);
}
