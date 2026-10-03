import type { AiPassageRecord } from "@workspace/db/schema";
import type { EntitlementSource } from "../billing/billing-access";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { aiConfig } from "./config";
import type { JevScore } from "./jev-client";
import { qualificationSearchQuery } from "./qualification-checklist-policy";
import { SHEET_FIELDS, sheetSearchQuery } from "./tender-sheet-policy";

export type PassageCandidate = {
  documentId: string;
  documentTitle: string;
  documentUrl: string;
  page: number;
  text: string;
};

export const aiQuotaResetsAt = (now: Date): string => {
  const [year, month, day] = dateInSaoPaulo(now).split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1, 3)).toISOString();
};

export const aiDailyLimit = (source: EntitlementSource): number => {
  const config = aiConfig();
  return source === "trial" || source === null ? config.trialDailyLimit : config.paidDailyLimit;
};

export const completedIndexStatus = (
  readyDocuments: number,
  unsupportedDocuments: number,
  failedDocuments: number,
): "ready" | "unsupported" | "failed" => {
  if (readyDocuments > 0) return "ready";
  if (failedDocuments > 0) return "failed";
  if (unsupportedDocuments > 0) return "unsupported";
  return "failed";
};

export const selectEvidencePassages = (
  candidates: PassageCandidate[],
  scores: JevScore[],
  threshold: number,
  relativeDelta = 1,
): AiPassageRecord[] =>
  candidates
    .map((candidate, position) => ({ ...candidate, relevance: scores[position]!.relevance }))
    .filter(({ relevance }) => relevance >= threshold)
    .sort((a, b) => b.relevance - a.relevance)
    .filter((passage, _position, sorted) => passage.relevance >= sorted[0]!.relevance - relativeDelta)
    .slice(0, 3);

const normalizeSearchText = (value: string): string => value
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .toLocaleLowerCase("pt-BR")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

const QUESTION_WORDS = new Set([
  "a", "as", "ao", "aos", "com", "como", "da", "das", "de", "do", "dos",
  "e", "em", "esta", "estao", "existe", "ha", "na", "nas", "no", "nos",
  "o", "os", "para", "pode", "podem", "por", "qual", "quais", "quando",
  "que", "se", "ser", "sera", "sao", "um", "uma", "edital", "licitacao",
]);

/** Search several indexed routes; Jev still decides which retrieved passage answers the question. */
export const askSearchQueries = (question: string): string[] => {
  const normalized = normalizeSearchText(question);
  const terms = [...new Set(normalized.split(" ").filter((word) => word.length >= 3 && !QUESTION_WORDS.has(word)))].slice(0, 8);
  if (terms.length === 0) return [];

  const padded = ` ${normalized} `;
  const matchedFields = SHEET_FIELDS.filter((field) => field.terms.some((term) =>
    padded.includes(` ${normalizeSearchText(term)} `),
  ));
  // "garantia" alone is ambiguous: search both proposal and contract rules.
  if (padded.includes(" garantia ") && matchedFields.every((field) => field.id !== "bid_guarantee" && field.id !== "contract_guarantee")) {
    matchedFields.push(...SHEET_FIELDS.filter((field) => field.id === "bid_guarantee" || field.id === "contract_guarantee"));
  }

  const expanded = matchedFields.slice(0, 2).map((field) => sheetSearchQuery(field.id));
  if (/\b(habilitacao|certidoes|documentos exigidos)\b/u.test(normalized)) {
    expanded.push(qualificationSearchQuery());
  }
  return [...new Set([
    terms.slice(0, 5).join(" "),
    ...expanded,
    terms.join(" OR "),
  ].filter(Boolean))];
};

/** Interleave precise and expanded hits and avoid spending the Jev budget on overlapping chunks. */
export const mergeAskShortlists = (
  groups: readonly (readonly PassageCandidate[])[],
  limit: number,
): PassageCandidate[] => {
  const selected: PassageCandidate[] = [];
  const seen = new Set<string>();
  const perPage = new Map<string, number>();
  const take = (candidate: PassageCandidate, maxPerPage: number): void => {
    const key = `${candidate.documentId}:${candidate.page}:${candidate.text}`;
    const pageKey = `${candidate.documentId}:${candidate.page}`;
    if (seen.has(key) || (perPage.get(pageKey) ?? 0) >= maxPerPage) return;
    seen.add(key);
    perPage.set(pageKey, (perPage.get(pageKey) ?? 0) + 1);
    selected.push(candidate);
  };
  const depth = Math.max(0, ...groups.map((group) => group.length));
  for (let rank = 0; rank < depth && selected.length < limit; rank += 1) {
    for (const group of groups) {
      const candidate = group[rank];
      if (candidate && selected.length < limit) take(candidate, 2);
    }
  }
  if (selected.length < limit) {
    for (const group of groups) {
      for (const candidate of group) {
        if (selected.length >= limit) break;
        take(candidate, Number.MAX_SAFE_INTEGER);
      }
    }
  }
  return selected;
};
