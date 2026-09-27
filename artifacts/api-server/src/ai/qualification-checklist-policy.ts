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

export const QUALIFICATION_TYPES = [
  "ato_societario",
  "regularidade_fiscal",
  "regularidade_trabalhista",
  "qualificacao_tecnica",
  "qualificacao_economica",
] as const;

export type QualificationType = (typeof QUALIFICATION_TYPES)[number];
export type QualificationClassification =
  | QualificationType
  | "nao_e_requisito";

export const QUALIFICATION_TYPE_CRITERIA: Readonly<
  Record<QualificationClassification, string>
> = {
  ato_societario:
    "Exige ato constitutivo, estatuto, contrato social, registro empresarial ou documento societário equivalente.",
  regularidade_fiscal:
    "Exige prova de regularidade fiscal, tributária, previdenciária ou perante o FGTS.",
  regularidade_trabalhista:
    "Exige prova de regularidade trabalhista, inclusive CNDT.",
  qualificacao_tecnica:
    "Exige atestado, registro em conselho, licença ou outro documento de qualificação técnica.",
  qualificacao_economica:
    "Exige balanço, índice, patrimônio, capital, certidão de falência ou outro documento econômico-financeiro.",
  nao_e_requisito:
    "Não exige documento de habilitação; é item do objeto, cláusula geral, título, remissão ou menção fora de contexto.",
};

export const QUALIFICATION_TYPE_CONFIDENCE_THRESHOLD = 0.7;

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

const QUALIFICATION_TERM_PATTERN =
  /habilit|qualificacao tecnic|qualificacao economic|regularidade fisca|regularidade trabalh|certid|atestado de capacidade|balanco patrimonial|patrimonio liquido|indice de liquidez|capital social|ato constitutivo|contrato social|registro no conselho|\bcrea\b|\bcra\b|\bcau\b|alvara|garantia de participacao/iu;

const searchableText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

export const isQualificationCandidateText = (value: string): boolean =>
  QUALIFICATION_TERM_PATTERN.test(searchableText(value));

type QualificationEvidence = {
  documentTitle: string;
  documentUrl: string;
  page: number;
  text: string;
};

export type QualificationScoredCandidate = {
  evidence: QualificationEvidence;
  isRequirement: number;
  type: QualificationClassification;
  typeConfidence: number;
  mentionsLaborInAdditionToFiscal: number | null;
};

export type QualificationChecklistItem = {
  type: QualificationType;
  evidence: QualificationEvidence;
  confidence: number;
};

export type QualificationChecklistDiagnostic = {
  id: QualificationType;
  bestNoul: number | null;
  secondNoul: number | null;
  bestEvidence: QualificationEvidence | null;
  secondEvidence: QualificationEvidence | null;
};

const CHECKLIST_ORDER = new Map(
  QUALIFICATION_TYPES.map((type, index) => [type, index]),
);

const emittedTypes = (
  candidate: QualificationScoredCandidate,
): QualificationType[] => {
  if (
    candidate.type === "nao_e_requisito" ||
    candidate.isRequirement < 0.5
  ) {
    return [];
  }
  if (
    candidate.typeConfidence < QUALIFICATION_TYPE_CONFIDENCE_THRESHOLD &&
    candidate.mentionsLaborInAdditionToFiscal !== null &&
    candidate.mentionsLaborInAdditionToFiscal >= 0.5 &&
    (candidate.type === "regularidade_fiscal" ||
      candidate.type === "regularidade_trabalhista")
  ) {
    return ["regularidade_fiscal", "regularidade_trabalhista"];
  }
  return [candidate.type];
};

const RELEVANT_STOP_WORDS = new Set([
  "com",
  "das",
  "de",
  "dos",
  "para",
  "por",
  "que",
]);

const relevantTokens = (value: string): Set<string> =>
  new Set(
    searchableText(value)
      .replace(/[^a-z0-9]+/gu, " ")
      .split(/\s+/u)
      .filter(
        (token) =>
          token.length >= 3 &&
          !/^\d+$/u.test(token) &&
          !RELEVANT_STOP_WORDS.has(token),
      ),
  );

const hasRelevantOverlap = (left: string, right: string): boolean => {
  const leftTokens = relevantTokens(left);
  const rightTokens = relevantTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  let shared = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) shared += 1;
  return shared >= 4 && shared / Math.min(leftTokens.size, rightTokens.size) >= 0.8;
};

export function buildQualificationChecklist(
  candidates: QualificationScoredCandidate[],
): {
  items: QualificationChecklistItem[];
  diagnostics: QualificationChecklistDiagnostic[];
} {
  const expanded = candidates.flatMap((candidate) =>
    emittedTypes(candidate).map((type) => ({
      type,
      evidence: candidate.evidence,
      confidence: candidate.isRequirement,
    })),
  );
  const byTypeAndPage = new Map<string, QualificationChecklistItem>();
  for (const item of expanded) {
    const key = `${item.type}:${item.evidence.page}`;
    const current = byTypeAndPage.get(key);
    if (!current || item.confidence > current.confidence) {
      byTypeAndPage.set(key, item);
    }
  }

  const deduplicated: QualificationChecklistItem[] = [];
  for (const item of [...byTypeAndPage.values()].sort(
    (left, right) => right.confidence - left.confidence,
  )) {
    const duplicate = deduplicated.some(
      (current) =>
        current.type === item.type &&
        hasRelevantOverlap(current.evidence.text, item.evidence.text),
    );
    if (!duplicate) deduplicated.push(item);
  }
  deduplicated.sort(
    (left, right) =>
      (CHECKLIST_ORDER.get(left.type) ?? 0) -
        (CHECKLIST_ORDER.get(right.type) ?? 0) ||
      left.evidence.page - right.evidence.page,
  );

  const diagnostics = QUALIFICATION_TYPES.map((type) => {
    const ranked = candidates
      .filter((candidate) => emittedTypes(candidate).includes(type))
      .sort((left, right) => right.isRequirement - left.isRequirement);
    return {
      id: type,
      bestNoul: ranked[0]?.isRequirement ?? null,
      secondNoul: ranked[1]?.isRequirement ?? null,
      bestEvidence: ranked[0]?.evidence ?? null,
      secondEvidence: ranked[1]?.evidence ?? null,
    };
  });
  return { items: deduplicated, diagnostics };
}
