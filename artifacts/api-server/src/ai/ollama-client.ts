import { timeoutMsFromEnv } from "../lib/http-timeout";

export type OllamaConfig = {
  baseUrl: string;
  teacherModel: string;
  embedModel: string;
  teacherTimeoutMs: number;
  embedTimeoutMs: number;
  keepAlive: string;
};

export const ollamaConfig = (): OllamaConfig => ({
  baseUrl: (process.env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434").replace(/\/+$/u, ""),
  teacherModel: process.env.OLLAMA_TEACHER_MODEL?.trim() || "gemma4:12b",
  embedModel: process.env.OLLAMA_EMBED_MODEL?.trim() || "bge-m3",
  teacherTimeoutMs: timeoutMsFromEnv("OLLAMA_TEACHER_TIMEOUT_MS", 300_000),
  embedTimeoutMs: timeoutMsFromEnv("OLLAMA_EMBED_TIMEOUT_MS", 60_000),
  keepAlive: process.env.OLLAMA_KEEP_ALIVE?.trim() || "10m",
});

export const titleTeacherEnabled = (): boolean => process.env.TITLE_TEACHER_ENABLED === "true";
export const categoryStudentEnabled = (): boolean => process.env.CATEGORY_STUDENT_ENABLED === "true";

export type OllamaErrorKind = "unavailable" | "timeout" | "http" | "invalid_response";

/** Never carries the prompt or the model output, only the failure class. */
export class OllamaError extends Error {
  constructor(
    readonly kind: OllamaErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OllamaError";
  }
}

export type GenerateJsonInput = {
  prompt: string;
  schema: Record<string, unknown>;
  temperature?: number;
};

export type GenerateJsonResult = { value: unknown; model: string; durationMs: number };
export type EmbedResult = { embeddings: number[][]; model: string; durationMs: number };

export type OllamaClient = {
  readonly config: OllamaConfig;
  generateJson(input: GenerateJsonInput): Promise<GenerateJsonResult>;
  embed(texts: string[]): Promise<EmbedResult>;
};

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");

export function createOllamaClient(options: {
  fetch?: typeof fetch;
  config?: Partial<OllamaConfig>;
} = {}): OllamaClient {
  const config = { ...ollamaConfig(), ...options.config };
  const requestFetch = options.fetch ?? fetch;

  const post = async (path: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> => {
    let lastError: OllamaError | undefined;
    // At most one retry, and only for connection failures or 5xx; a timeout is not retried.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      try {
        response = await requestFetch(`${config.baseUrl}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        if (isTimeout(error)) throw new OllamaError("timeout", `Ollama ${path} timed out after ${timeoutMs} ms`);
        lastError = new OllamaError("unavailable", `Ollama ${path} is unreachable`);
        continue;
      }
      if (response.status >= 500) {
        await response.body?.cancel().catch(() => undefined);
        lastError = new OllamaError("http", `Ollama ${path} returned HTTP ${response.status}`, response.status);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new OllamaError("http", `Ollama ${path} returned HTTP ${response.status}`, response.status);
      }
      try {
        return await response.json();
      } catch (error) {
        if (isTimeout(error)) throw new OllamaError("timeout", `Ollama ${path} timed out after ${timeoutMs} ms`);
        throw new OllamaError("invalid_response", `Ollama ${path} returned invalid JSON`);
      }
    }
    throw lastError ?? new OllamaError("unavailable", `Ollama ${path} is unreachable`);
  };

  return {
    config,
    async generateJson(input) {
      const startedAt = performance.now();
      const payload = await post("/api/generate", {
        model: config.teacherModel,
        prompt: input.prompt,
        format: input.schema,
        stream: false,
        think: false,
        keep_alive: config.keepAlive,
        options: { temperature: input.temperature ?? 0.1 },
      }, config.teacherTimeoutMs) as { response?: unknown; model?: unknown };
      if (typeof payload?.response !== "string") {
        throw new OllamaError("invalid_response", "Ollama /api/generate response has no text");
      }
      let value: unknown;
      try {
        value = JSON.parse(payload.response);
      } catch {
        throw new OllamaError("invalid_response", "Ollama /api/generate response is not JSON");
      }
      return {
        value,
        model: typeof payload.model === "string" ? payload.model : config.teacherModel,
        durationMs: performance.now() - startedAt,
      };
    },
    async embed(texts) {
      if (texts.length === 0) return { embeddings: [], model: config.embedModel, durationMs: 0 };
      const startedAt = performance.now();
      const payload = await post("/api/embed", {
        model: config.embedModel,
        input: texts,
        keep_alive: config.keepAlive,
      }, config.embedTimeoutMs) as { embeddings?: unknown };
      const embeddings = payload?.embeddings;
      if (
        !Array.isArray(embeddings) ||
        embeddings.length !== texts.length ||
        !embeddings.every((vector) => Array.isArray(vector) && vector.length > 0 && vector.every(Number.isFinite))
      ) {
        throw new OllamaError("invalid_response", "Ollama /api/embed returned unexpected embeddings");
      }
      return { embeddings: embeddings as number[][], model: config.embedModel, durationMs: performance.now() - startedAt };
    },
  };
}
