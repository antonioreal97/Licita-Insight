import { openAiConfig } from "./config";

export class OpenAiUnavailableError extends Error {
  constructor(
    message = "OpenAI is unavailable",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OpenAiUnavailableError";
  }
}

export type OpenAiCompletion = {
  value: unknown | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type CompleteJsonOptions = {
  name: string;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  requestFetch?: typeof fetch;
};

const retryable = (status: number) => status === 429 || status >= 500;

const parseUsage = (value: unknown): { inputTokens: number; outputTokens: number } => {
  if (!value || typeof value !== "object") return { inputTokens: 0, outputTokens: 0 };
  const usage = value as Record<string, unknown>;
  const inputTokens = Number(usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? 0);
  return {
    inputTokens: Number.isSafeInteger(inputTokens) && inputTokens >= 0 ? inputTokens : 0,
    outputTokens: Number.isSafeInteger(outputTokens) && outputTokens >= 0 ? outputTokens : 0,
  };
};

export async function completeJson(options: CompleteJsonOptions): Promise<OpenAiCompletion> {
  const config = openAiConfig();
  if (!config.apiKey) throw new OpenAiUnavailableError("OPENAI_API_KEY is not configured");
  const requestFetch = options.requestFetch ?? fetch;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    timeout.unref?.();
    try {
      const response = await requestFetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: options.system },
            { role: "user", content: options.user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: options.name, strict: true, schema: options.schema },
          },
          temperature: 0.1,
          store: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        lastError = new Error(`OpenAI returned HTTP ${response.status}`);
        if (attempt === 0 && retryable(response.status)) continue;
        throw lastError;
      }
      const payload = await response.json() as {
        model?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: unknown;
      };
      const content = payload.choices?.[0]?.message?.content;
      const usage = parseUsage(payload.usage);
      let value: unknown | null = null;
      if (typeof content === "string") {
        try {
          value = JSON.parse(content);
        } catch {
          value = null;
        }
      }
      const model = typeof payload.model === "string" && payload.model.trim() ? payload.model : config.model;
      return {
        value,
        model,
        ...usage,
        costUsd:
          usage.inputTokens / 1_000_000 * config.inputUsdPerMtok +
          usage.outputTokens / 1_000_000 * config.outputUsdPerMtok,
      };
    } catch (error) {
      lastError = error;
      if (error instanceof OpenAiUnavailableError) throw error;
      throw new OpenAiUnavailableError(
        error instanceof DOMException && error.name === "AbortError"
          ? "OpenAI request timed out"
          : "OpenAI request failed",
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new OpenAiUnavailableError("OpenAI request failed", lastError);
}
