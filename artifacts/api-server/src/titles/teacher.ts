import { TENDER_CATEGORIES, type TenderCategorySlug } from "../catalog/tender-categories";
import type { OllamaClient } from "../ai/ollama-client";
import { openAiConfig } from "../ai/config";
import { completeJson } from "../ai/openai-client";
import { comparableWords } from "./text";

/** Bump whenever the prompt text, schema or validation changes the teacher's output. */
export const TITLE_TEACHER_PROMPT_VERSION = 1;
export const TEACHER_BATCH_SIZE = 10;
const MAX_SOURCE_CHARS = 600;
const MAX_TITLE_WORDS = 12;
const MAX_TITLE_CHARS = 100;
const UNSPECIFIED_OBJECT = "Objeto não especificado";

const SLUG_BY_LABEL = new Map<string, TenderCategorySlug>(
  TENDER_CATEGORIES.map(({ slug, label }) => [label, slug]),
);
const LABELS = TENDER_CATEGORIES.map(({ label }) => label);

const BRIDGE_WORDS = new Set(comparableWords(
  "Aquisição Contratação serviço serviços Locação Obra Credenciamento Registro preços para de do da dos das e em com a o",
));
const UNSPECIFIED_WORDS = comparableWords(UNSPECIFIED_OBJECT).join(" ");

export const TEACHER_INSTRUCTIONS = [
  "Você padroniza títulos de licitações públicas brasileiras.",
  "Para cada item, escreva um título curto em português do Brasil, com no máximo 10 palavras, em caixa normal (só a primeira letra e siglas em maiúscula).",
  "Comece pelo tipo de compra: 'Aquisição de', 'Contratação de serviço de', 'Locação de', 'Obra de' ou 'Credenciamento para'.",
  "Diga o que é comprado.",
  "Remova nomes de pessoas e empresas, placas, números de processo, plataformas, órgão, município, prazos e justificativas.",
  "Use só palavras que estejam no texto ou sinônimos diretos; nunca troque o objeto (medicamento não vira médico).",
  `Se o texto não disser o que é comprado, use '${UNSPECIFIED_OBJECT}'.`,
  `Escolha 1 categoria principal e, se precisar, 1 secundária, copiando o nome exato desta lista: ${LABELS.join("; ")}.`,
].join(" ");

export const TEACHER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          titulo: { type: "string" },
          categorias: { type: "array", items: { type: "string", enum: LABELS }, maxItems: 2 },
        },
        required: ["id", "titulo", "categorias"],
      },
    },
  },
  required: ["itens"],
} as const;

/** OpenAI strict structured output: every object closed and every property required. */
export const OPENAI_TEACHER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "integer" },
          titulo: { type: "string" },
          categorias: { type: "array", items: { type: "string", enum: LABELS } },
        },
        required: ["id", "titulo", "categorias"],
      },
    },
  },
  required: ["itens"],
} as const;

const RESPONSE_FORMAT_LINE =
  'Responda só em JSON no formato {"itens":[{"id":n,"titulo":"...","categorias":["..."]}]}, com um item para cada id recebido.';

const sourceForPrompt = (text: string): string => {
  const collapsed = text.normalize("NFC").replace(/\s+/gu, " ").trim();
  return collapsed.length <= MAX_SOURCE_CHARS ? collapsed : collapsed.slice(0, MAX_SOURCE_CHARS);
};

const teacherItems = (texts: readonly string[]): string =>
  JSON.stringify({ itens: texts.map((text, index) => ({ id: index + 1, texto: sourceForPrompt(text) })) });

export const buildTeacherPrompt = (texts: readonly string[]): string =>
  [TEACHER_INSTRUCTIONS, RESPONSE_FORMAT_LINE, "", teacherItems(texts)].join("\n");

export type TeacherRejection = "missing" | "empty" | "too_long" | "invented_word";

export type TeacherItemResult = {
  /** Validated title, or null when the teacher's title was missing or rejected. */
  title: string | null;
  categories: TenderCategorySlug[];
  rejection: TeacherRejection | null;
};

export const categoriesFromLabels = (labels: unknown): TenderCategorySlug[] => {
  if (!Array.isArray(labels)) return [];
  const slugs: TenderCategorySlug[] = [];
  for (const label of labels) {
    const slug = typeof label === "string" ? SLUG_BY_LABEL.get(label.trim()) : undefined;
    if (!slug || slugs.includes(slug)) continue;
    slugs.push(slug);
    if (slugs.length === 2) break;
  }
  return slugs;
};

const cleanTitle = (value: string): string =>
  value
    .normalize("NFC")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^["'“”]+|["'“”]+$/gu, "")
    .replace(/(?<!\.)\.$/u, "")
    .trim();

/** Every content word of the title must appear in the source, ignoring case and accents. */
export const inventedWords = (sourceText: string, title: string): string[] => {
  const available = new Set(comparableWords(sourceText));
  const withoutUnspecified = ` ${comparableWords(title).join(" ")} `.replaceAll(` ${UNSPECIFIED_WORDS} `, " ");
  return withoutUnspecified
    .split(" ")
    .filter((word) => word !== "" && !available.has(word) && !BRIDGE_WORDS.has(word));
};

export const validateTeacherItem = (sourceText: string, raw: unknown): TeacherItemResult => {
  if (!raw || typeof raw !== "object") return { title: null, categories: [], rejection: "missing" };
  const item = raw as { titulo?: unknown; categorias?: unknown };
  const categories = categoriesFromLabels(item.categorias);
  const title = typeof item.titulo === "string" ? cleanTitle(item.titulo) : "";
  if (title === "") return { title: null, categories, rejection: "empty" };
  if (title.length > MAX_TITLE_CHARS || title.split(" ").length > MAX_TITLE_WORDS) {
    return { title: null, categories, rejection: "too_long" };
  }
  if (inventedWords(sourceText, title).length > 0) return { title: null, categories, rejection: "invented_word" };
  return { title, categories, rejection: null };
};

export const parseTeacherResponse = (texts: readonly string[], value: unknown): TeacherItemResult[] => {
  const items = value && typeof value === "object" && Array.isArray((value as { itens?: unknown }).itens)
    ? (value as { itens: unknown[] }).itens
    : [];
  const byId = new Map<number, unknown>();
  for (const item of items) {
    const id = item && typeof item === "object" ? Number((item as { id?: unknown }).id) : Number.NaN;
    if (Number.isSafeInteger(id) && !byId.has(id)) byId.set(id, item);
  }
  return texts.map((text, index) => validateTeacherItem(text, byId.get(index + 1)));
};

export type TeacherProvider = "ollama" | "openai";
export type TeacherUsage = { inputTokens: number; outputTokens: number; costUsd: number };
export type TeacherCall = { value: unknown; model: string; durationMs: number; usage: TeacherUsage | null };

/** One model call for up to ten texts, with the same prompt meaning on both providers. */
export type TeacherBackend = {
  provider: TeacherProvider;
  model: string;
  complete(texts: readonly string[]): Promise<TeacherCall>;
};

export const ollamaTeacher = (client: OllamaClient): TeacherBackend => ({
  provider: "ollama",
  model: client.config.teacherModel,
  async complete(texts) {
    const response = await client.generateJson({
      prompt: buildTeacherPrompt(texts),
      schema: TEACHER_RESPONSE_SCHEMA,
      temperature: 0.1,
    });
    return { ...response, usage: null };
  },
});

export const openAiTeacher = (options: { requestFetch?: typeof fetch } = {}): TeacherBackend => ({
  provider: "openai",
  model: openAiConfig().model,
  async complete(texts) {
    const startedAt = performance.now();
    const response = await completeJson({
      name: `title_teacher_v${TITLE_TEACHER_PROMPT_VERSION}`,
      schema: OPENAI_TEACHER_SCHEMA,
      system: `${TEACHER_INSTRUCTIONS}\n${RESPONSE_FORMAT_LINE}`,
      user: teacherItems(texts),
      requestFetch: options.requestFetch,
    });
    return {
      value: response.value,
      model: response.model,
      durationMs: performance.now() - startedAt,
      usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, costUsd: response.costUsd },
    };
  },
});

/** Splits a batch's usage across its items so each tender carries its share. */
export const splitUsage = (usage: TeacherUsage, items: number): TeacherUsage[] => {
  if (items < 1) return [];
  const share = (total: number, index: number) =>
    Math.floor(total / items) + (index < total % items ? 1 : 0);
  return Array.from({ length: items }, (_, index) => ({
    inputTokens: share(usage.inputTokens, index),
    outputTokens: share(usage.outputTokens, index),
    costUsd: usage.costUsd / items,
  }));
};

export type TeacherRun = {
  results: TeacherItemResult[];
  /** Per-item share of the paid usage; null for the local model. */
  usage: (TeacherUsage | null)[];
  model: string;
  durationMs: number;
};

/** Labels the texts in batches of ten, sequentially. A failed call rejects the whole run. */
export async function runTeacher(
  texts: readonly string[],
  teacher: TeacherBackend | OllamaClient,
): Promise<TeacherRun> {
  const backend = "complete" in teacher ? teacher : ollamaTeacher(teacher);
  const run: TeacherRun = { results: [], usage: [], model: backend.model, durationMs: 0 };
  for (let start = 0; start < texts.length; start += TEACHER_BATCH_SIZE) {
    const batch = texts.slice(start, start + TEACHER_BATCH_SIZE);
    const response = await backend.complete(batch);
    run.model = response.model;
    run.durationMs += response.durationMs;
    run.results.push(...parseTeacherResponse(batch, response.value));
    run.usage.push(...(response.usage ? splitUsage(response.usage, batch.length) : batch.map(() => null)));
  }
  return run;
}
