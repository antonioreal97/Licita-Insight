import { timeoutMsFromEnv } from "../lib/http-timeout";

/**
 * Portuguese titles for international calls, from a local model. Never OpenAI. Off by default: without a
 * translator the hub shows the original title and the summary the collector writes by rules in Portuguese.
 *
 * `INTERNATIONAL_TITLE_TRANSLATION` picks the provider:
 * - `off` (default): no translation.
 * - `ollama`: a local model served by Ollama (`INTERNATIONAL_TITLE_TRANSLATION_MODEL`, `OLLAMA_BASE_URL`).
 * - `libretranslate`: any service that speaks the LibreTranslate HTTP API
 *   (`INTERNATIONAL_TITLE_TRANSLATION_URL`), which is how Marian/OPUS-MT and NLLB models are usually served on
 *   a small machine.
 *
 * No model is chosen yet: speed and quality still have to be measured on the server, so `ollama` has no
 * default model and must be given one.
 */
export type TitleTranslator = {
  /** Recorded with the run: `ollama:<model>`, `libretranslate`. */
  name: string;
  /** The title in Brazilian Portuguese, or `null` when the answer cannot be trusted. Throws when unreachable. */
  translate(text: string, language: string): Promise<string | null>;
};

export type TranslationProvider = "off" | "ollama" | "libretranslate";

export type TranslationConfig = {
  provider: TranslationProvider;
  /** Languages worth translating. Spanish is left as published: a Portuguese reader follows it. */
  languages: string[];
  /** Titles translated per collection, so one run never holds the model for long. */
  batchSize: number;
  timeoutMs: number;
  ollamaBaseUrl: string;
  ollamaModel: string | null;
  libreTranslateUrl: string | null;
};

export const translationConfig = (
  env: NodeJS.ProcessEnv = process.env,
): TranslationConfig => {
  const provider = (env.INTERNATIONAL_TITLE_TRANSLATION?.trim() || "off") as string;
  if (!["off", "ollama", "libretranslate"].includes(provider))
    throw new Error(
      `INTERNATIONAL_TITLE_TRANSLATION must be off, ollama or libretranslate; received "${provider}"`,
    );
  const batch = env.INTERNATIONAL_TITLE_TRANSLATION_BATCH?.trim();
  const batchSize = batch ? Number(batch) : 100;
  if (!Number.isSafeInteger(batchSize) || batchSize < 0 || batchSize > 2_000)
    throw new Error(
      "INTERNATIONAL_TITLE_TRANSLATION_BATCH must be an integer from 0 to 2000",
    );
  const languages = (env.INTERNATIONAL_TITLE_TRANSLATION_LANGUAGES?.trim() || "en,fr")
    .split(",")
    .map((code) => code.trim().toLowerCase())
    .filter((code) => /^[a-z]{2}$/.test(code) && code !== "pt");
  const libreTranslateUrl =
    env.INTERNATIONAL_TITLE_TRANSLATION_URL?.trim().replace(/\/+$/u, "") || null;
  if (provider === "libretranslate" && !libreTranslateUrl)
    throw new Error(
      "INTERNATIONAL_TITLE_TRANSLATION=libretranslate requires INTERNATIONAL_TITLE_TRANSLATION_URL",
    );
  const ollamaModel = env.INTERNATIONAL_TITLE_TRANSLATION_MODEL?.trim() || null;
  if (provider === "ollama" && !ollamaModel)
    throw new Error(
      "INTERNATIONAL_TITLE_TRANSLATION=ollama requires INTERNATIONAL_TITLE_TRANSLATION_MODEL",
    );
  return {
    provider: provider as TranslationProvider,
    languages,
    batchSize,
    timeoutMs: timeoutMsFromEnv("INTERNATIONAL_TITLE_TRANSLATION_TIMEOUT_MS", 30_000),
    ollamaBaseUrl: (
      env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434"
    ).replace(/\/+$/u, ""),
    ollamaModel,
    libreTranslateUrl,
  };
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: "inglês",
  fr: "francês",
  es: "espanhol",
  ru: "russo",
  ar: "árabe",
  zh: "chinês",
};

export const translationPrompt = (text: string, language: string): string =>
  [
    "Traduza para o português do Brasil o título abaixo, de um aviso de licitação ou chamada de financiamento internacional.",
    "Responda só com a tradução, em uma linha, sem aspas e sem comentários.",
    "Mantenha siglas, códigos, números e nomes próprios como estão.",
    "",
    `Título em ${LANGUAGE_NAMES[language] ?? language}: ${text}`,
    "Tradução:",
  ].join("\n");

/**
 * Keeps a model answer only when it looks like a title: one line, not empty, not a copy of the input and
 * not many times longer than it (a small model sometimes explains instead of translating).
 */
export const acceptTranslation = (
  original: string,
  answer: unknown,
): string | null => {
  if (typeof answer !== "string") return null;
  const line = answer
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part !== "");
  if (!line) return null;
  const cleaned = line
    .replace(/^(tradução|traducao|translation)\s*:\s*/i, "")
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned === "" || cleaned.length > 500) return null;
  if (cleaned.length > original.length * 3 + 40) return null;
  if (cleaned.toLowerCase() === original.replace(/\s+/g, " ").trim().toLowerCase())
    return null;
  return cleaned;
};

const postJson = async (
  requestFetch: typeof fetch,
  url: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> => {
  const response = await requestFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${new URL(url).host} respondeu HTTP ${response.status}`);
  }
  return await response.json();
};

export const ollamaTranslator = (
  config: { ollamaBaseUrl: string; ollamaModel: string; timeoutMs: number },
  requestFetch: typeof fetch = fetch,
): TitleTranslator => ({
  name: `ollama:${config.ollamaModel}`,
  async translate(text, language) {
    const payload = (await postJson(
      requestFetch,
      `${config.ollamaBaseUrl}/api/generate`,
      {
        model: config.ollamaModel,
        prompt: translationPrompt(text, language),
        stream: false,
        think: false,
        keep_alive: "5m",
        options: { temperature: 0, num_predict: 160 },
      },
      config.timeoutMs,
    )) as { response?: unknown };
    return acceptTranslation(text, payload?.response);
  },
});

export const libreTranslateTranslator = (
  config: Pick<TranslationConfig, "libreTranslateUrl" | "timeoutMs">,
  requestFetch: typeof fetch = fetch,
): TitleTranslator => ({
  name: "libretranslate",
  async translate(text, language) {
    const payload = (await postJson(
      requestFetch,
      `${config.libreTranslateUrl}/translate`,
      { q: text, source: language, target: "pt", format: "text" },
      config.timeoutMs,
    )) as { translatedText?: unknown };
    return acceptTranslation(text, payload?.translatedText);
  },
});

/** `null` when translation is off. */
export const translatorFromConfig = (
  config: TranslationConfig,
  requestFetch: typeof fetch = fetch,
): TitleTranslator | null =>
  config.provider === "ollama" && config.ollamaModel
    ? ollamaTranslator(
        { ...config, ollamaModel: config.ollamaModel },
        requestFetch,
      )
    : config.provider === "libretranslate"
      ? libreTranslateTranslator(config, requestFetch)
      : null;

export type TranslationOutcome = {
  translator: string | null;
  attempted: number;
  translated: number;
  rejected: number;
  failed: number;
  /** Set when the batch stopped early because the service stopped answering. */
  stopped: string | null;
};

/** Three failures in a row mean the service is down: the rest of the batch waits for the next collection. */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Translates a batch of titles. Never throws: a translator that is slow, wrong or down leaves the titles in
 * the original language and the collection that called it is unaffected.
 */
export const translateTitles = async (
  pending: Array<{ id: string; text: string; language: string }>,
  translator: TitleTranslator,
  save: (id: string, titlePt: string) => Promise<void>,
  /** Called for a title the translator answered but could not translate, so it is not asked forever. */
  recordAttempt: (id: string) => Promise<void> = async () => undefined,
): Promise<TranslationOutcome> => {
  const outcome: TranslationOutcome = {
    translator: translator.name,
    attempted: 0,
    translated: 0,
    rejected: 0,
    failed: 0,
    stopped: null,
  };
  let consecutiveFailures = 0;
  for (const item of pending) {
    outcome.attempted += 1;
    try {
      const titlePt = await translator.translate(item.text, item.language);
      consecutiveFailures = 0;
      if (titlePt === null) {
        outcome.rejected += 1;
        await recordAttempt(item.id);
        continue;
      }
      await save(item.id, titlePt);
      outcome.translated += 1;
    } catch (error) {
      outcome.failed += 1;
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        outcome.stopped = error instanceof Error ? error.message : String(error);
        break;
      }
    }
  }
  return outcome;
};
