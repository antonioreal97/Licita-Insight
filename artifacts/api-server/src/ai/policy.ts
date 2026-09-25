import type { AiPassageRecord } from "@workspace/db/schema";
import type { EntitlementSource } from "../billing/billing-access";
import { dateInSaoPaulo } from "../lib/sao-paulo-date";
import { aiConfig } from "./config";
import type { JevScore } from "./jev-client";

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

export const selectEvidencePassages = (
  candidates: PassageCandidate[],
  scores: JevScore[],
  threshold: number,
): AiPassageRecord[] =>
  candidates
    .map((candidate, position) => ({ ...candidate, relevance: scores[position]!.relevance }))
    .filter(({ relevance }) => relevance >= threshold)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

export const lexicalSearchQuery = (question: string): string => {
  const terms = question
    .normalize("NFKC")
    .toLocaleLowerCase("pt-BR")
    .match(/[\p{L}\p{N}]{3,}/gu);
  return [...new Set(terms ?? [])].join(" OR ");
};
