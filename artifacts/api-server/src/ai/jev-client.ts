import { TypeSafeClient, noul } from "@typesafe-ai/sdk";
import { aiConfig } from "./config";

export class JevUnavailableError extends Error {
  constructor(message = "Jev is unavailable", readonly cause?: unknown) {
    super(message);
    this.name = "JevUnavailableError";
  }
}

export type JevScore = { relevance: number; model: string; inputTokens: number };

export async function scoreTenderPassage(
  question: string,
  passage: string,
  requestFetch?: typeof fetch,
): Promise<JevScore> {
  const config = aiConfig();
  if (!config.apiKey) throw new JevUnavailableError("JEV_API_KEY is not configured");
  const client = new TypeSafeClient({
    apiKey: config.apiKey,
    defaultModel: config.model,
    timeout: config.timeoutMs,
    logLevel: "off",
    ...(requestFetch ? { fetch: requestFetch } : {}),
  });
  try {
    const result = await client.systemOne({
      model: config.model,
      state: { pergunta_do_usuario: question, trecho_do_edital: passage },
      questions: {
        responde: noul(
          "O trecho do edital responde diretamente à pergunta do usuário? Considere somente evidência explícita no trecho.",
          {
            true: "O trecho contém informação que responde diretamente à pergunta.",
            false: "O trecho só trata do mesmo assunto, sem responder à pergunta, ou não contém a informação pedida.",
          },
        ),
      },
    });
    return {
      relevance: result.answers.responde.noul,
      model: result.model,
      inputTokens: result.usage.input_tokens,
    };
  } catch (error) {
    throw new JevUnavailableError("Jev request failed", error);
  }
}
