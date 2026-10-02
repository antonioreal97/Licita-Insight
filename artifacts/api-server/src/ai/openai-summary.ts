import type {
  AiPassageRecord,
  QualificationItem,
  TenderSheetField,
} from "@workspace/db";
import { isAiBatchBudgetPaused } from "./ai-budget";
import { openAiConfig } from "./config";
import { completeJson, type OpenAiCompletion } from "./openai-client";

export const ASK_SUMMARY_PROMPT_VERSION = 1;
export const SHEET_SUMMARY_PROMPT_VERSION = 1;

export type GeneratedSummary = {
  text: string;
  citations: number[];
  model: string;
};

export type SummaryAttempt = {
  summary: GeneratedSummary | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type SummaryOptions = {
  requestFetch?: typeof fetch;
  budgetPaused?: () => Promise<boolean>;
};

const EMPTY_ATTEMPT: SummaryAttempt = {
  summary: null,
  model: null,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
};

const summarySchema = (property: "answer" | "summary") => ({
  type: "object",
  additionalProperties: false,
  properties: {
    [property]: { anyOf: [{ type: "string" }, { type: "null" }] },
    citations: {
      type: "array",
      items: { type: "integer", minimum: 1 },
      uniqueItems: true,
    },
  },
  required: [property, "citations"],
});

const usageOnly = (completion: OpenAiCompletion): SummaryAttempt => ({
  summary: null,
  model: completion.model,
  inputTokens: completion.inputTokens,
  outputTokens: completion.outputTokens,
  costUsd: completion.costUsd,
});

const validCitations = (value: unknown, sourceCount: number): value is number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  new Set(value).size === value.length &&
  value.every((citation) => Number.isSafeInteger(citation) && citation >= 1 && citation <= sourceCount);

const normalizeText = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const text = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  return text || null;
};

const citationsMatchText = (text: string, citations: number[]): boolean => {
  const inText = [...text.matchAll(/\[(\d+)\]/gu)].map((match) => Number(match[1]));
  return inText.length > 0 &&
    inText.every((citation) => citations.includes(citation)) &&
    citations.every((citation) => inText.includes(citation));
};

const sentenceCount = (text: string): number => {
  const ends = text.match(/[.!?](?=(?:\s|\[\d+\]|$))/gu)?.length ?? 0;
  return Math.max(1, ends);
};

const permitted = async (options: SummaryOptions): Promise<boolean> => {
  if (!openAiConfig().apiKey) return false;
  return !(await (options.budgetPaused ?? isAiBatchBudgetPaused)());
};

export async function generateAskSummary(
  question: string,
  passages: AiPassageRecord[],
  options: SummaryOptions = {},
): Promise<SummaryAttempt> {
  if (passages.length === 0 || !(await permitted(options))) return EMPTY_ATTEMPT;
  const sources = passages.slice(0, 3).map((passage, index) =>
    `[${index + 1}] Documento: ${passage.documentTitle}\nPágina: ${passage.page}\nTrecho: ${passage.text}`,
  ).join("\n\n");
  const completion = await completeJson({
    name: `ask_summary_v${ASK_SUMMARY_PROMPT_VERSION}`,
    schema: summarySchema("answer"),
    system: [
      "Redija uma resposta em português do Brasil usando somente os trechos numerados fornecidos.",
      "Use no máximo 3 frases e cite cada afirmação factual com [n].",
      "Se os trechos não responderem, devolva answer null e citations [].",
      "Nunca conclua que algo não existe, não é exigido ou não é permitido apenas porque não aparece nos trechos.",
      "Não dê conselho jurídico.",
    ].join(" "),
    user: `Pergunta: ${question}\n\n${sources}`,
    requestFetch: options.requestFetch,
  });
  const attempted = usageOnly(completion);
  if (!completion.value || typeof completion.value !== "object") return attempted;
  const value = completion.value as Record<string, unknown>;
  if (value.answer === null) return attempted;
  const text = normalizeText(value.answer);
  if (
    !text ||
    text.length > 600 ||
    sentenceCount(text) > 3 ||
    !validCitations(value.citations, passages.length) ||
    !citationsMatchText(text, value.citations)
  ) return attempted;
  return {
    ...attempted,
    summary: { text, citations: value.citations, model: completion.model },
  };
}

export type SheetSummarySource = {
  kind: "field" | "qualification";
  id: string;
  label: string;
  text: string;
  documentTitle: string;
  page: number;
};

export const sheetSummarySources = (
  fields: TenderSheetField[],
  qualificationChecklist: QualificationItem[],
): SheetSummarySource[] => [
  ...fields.flatMap((field) => field.status === "found" && field.evidence ? [{
    kind: "field" as const,
    id: field.id,
    label: field.id,
    text: field.evidence.text,
    documentTitle: field.evidence.documentTitle,
    page: field.evidence.page,
  }] : []),
  ...qualificationChecklist.map((item) => ({
    kind: "qualification" as const,
    id: item.type,
    label: item.type,
    text: item.evidence.text,
    documentTitle: item.evidence.documentTitle,
    page: item.evidence.page,
  })),
];

export async function generateSheetSummary(
  fields: TenderSheetField[],
  qualificationChecklist: QualificationItem[],
  options: SummaryOptions = {},
): Promise<SummaryAttempt> {
  const sources = sheetSummarySources(fields, qualificationChecklist);
  if (sources.length === 0 || !(await permitted(options))) return EMPTY_ATTEMPT;
  const numbered = sources.map((source, index) =>
    `[${index + 1}] Tipo: ${source.kind}; campo: ${source.label}; documento: ${source.documentTitle}; página: ${source.page}; trecho: ${source.text}`,
  ).join("\n\n");
  const completion = await completeJson({
    name: `sheet_summary_v${SHEET_SUMMARY_PROMPT_VERSION}`,
    schema: summarySchema("summary"),
    system: [
      "Redija em português do Brasil um resumo de 2 a 4 frases usando somente os itens numerados.",
      "Cite cada afirmação factual com [n].",
      "Nunca transforme ausência de informação em inexistência, dispensa ou proibição.",
      "Quando precisar mencionar uma lacuna, escreva exatamente 'não encontrado nos documentos lidos'.",
      "Não dê conselho jurídico.",
    ].join(" "),
    user: numbered,
    requestFetch: options.requestFetch,
  });
  const attempted = usageOnly(completion);
  if (!completion.value || typeof completion.value !== "object") return attempted;
  const value = completion.value as Record<string, unknown>;
  if (value.summary === null) return attempted;
  const text = normalizeText(value.summary);
  const sentences = text ? sentenceCount(text) : 0;
  if (
    !text ||
    text.length > 1_200 ||
    sentences < 2 ||
    sentences > 4 ||
    !validCitations(value.citations, sources.length) ||
    !citationsMatchText(text, value.citations)
  ) return attempted;
  return {
    ...attempted,
    summary: { text, citations: value.citations, model: completion.model },
  };
}
