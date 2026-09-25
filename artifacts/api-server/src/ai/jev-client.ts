import { TypeSafeClient, noul, score } from "@typesafe-ai/sdk";
import { aiConfig } from "./config";

export class JevUnavailableError extends Error {
  constructor(
    message = "Jev is unavailable",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "JevUnavailableError";
  }
}

export type JevScore = {
  relevance: number;
  model: string;
  inputTokens: number;
};

export type JevCompanyFit = {
  fitScore: number;
  excludedProbability: number | null;
  model: string;
  inputTokens: number;
};

const clientFor = (requestFetch?: typeof fetch) => {
  const config = aiConfig();
  if (!config.apiKey)
    throw new JevUnavailableError("JEV_API_KEY is not configured");
  return new TypeSafeClient({
    apiKey: config.apiKey,
    defaultModel: config.model,
    timeout: config.timeoutMs,
    logLevel: "off",
    ...(requestFetch ? { fetch: requestFetch } : {}),
  });
};

export async function scoreCompanyFit(
  input: {
    description: string;
    offerings: string[];
    exclusions: string[];
    tenderText: string;
  },
  requestFetch?: typeof fetch,
): Promise<JevCompanyFit> {
  const config = aiConfig();
  const questions = {
    aderencia: score(
      "Qual é a aderência entre o que a empresa fornece e o objeto desta licitação? Use somente o texto apresentado.",
      [
        "Sem relação comercial relevante.",
        "Relação fraca ou apenas indireta.",
        "Boa relação, embora parcial.",
        "Relação direta e forte com o fornecimento descrito.",
      ] as const,
    ),
    ...(input.exclusions.length > 0
      ? {
          excluido: noul(
            "A licitação exige principalmente algo que a empresa declarou explicitamente não fornecer?",
            {
              true: "O objeto principal está coberto por uma exclusão explícita.",
              false: "Não há conflito explícito com as exclusões.",
            },
          ),
        }
      : {}),
  };
  try {
    const result = await clientFor(requestFetch).systemOne({
      model: config.model,
      state: {
        perfil_da_empresa: {
          descricao: input.description,
          ofertas: input.offerings,
          exclusoes: input.exclusions,
        },
        licitacao: input.tenderText,
      },
      questions,
    });
    return {
      fitScore: result.answers.aderencia.score,
      excludedProbability:
        "excluido" in result.answers && result.answers.excluido
          ? result.answers.excluido.noul
          : null,
      model: result.model,
      inputTokens: result.usage.input_tokens,
    };
  } catch (error) {
    throw new JevUnavailableError("Jev company-fit request failed", error);
  }
}

export async function scoreSizeRestriction(
  passage: string,
  requestFetch?: typeof fetch,
): Promise<JevScore> {
  const config = aiConfig();
  try {
    const result = await clientFor(requestFetch).systemOne({
      model: config.model,
      state: { trecho_do_edital: passage },
      questions: {
        restricao: noul(
          "O trecho reserva participação ou cota exclusivamente para ME/EPP, microempresa ou empresa de pequeno porte?",
          {
            true: "Há reserva, exclusividade ou cota explícita para ME/EPP.",
            false: "Não há restrição explícita desse tipo.",
          },
        ),
      },
    });
    return {
      relevance: result.answers.restricao.noul,
      model: result.model,
      inputTokens: result.usage.input_tokens,
    };
  } catch (error) {
    throw new JevUnavailableError("Jev size-restriction request failed", error);
  }
}

export async function scoreTenderPassage(
  question: string,
  passage: string,
  requestFetch?: typeof fetch,
): Promise<JevScore> {
  const config = aiConfig();
  const client = clientFor(requestFetch);
  try {
    const result = await client.systemOne({
      model: config.model,
      state: { pergunta_do_usuario: question, trecho_do_edital: passage },
      questions: {
        responde: noul(
          "O trecho do edital responde diretamente à pergunta do usuário? Considere somente evidência explícita no trecho.",
          {
            true: "O trecho contém informação que responde diretamente à pergunta.",
            false:
              "O trecho só trata do mesmo assunto, sem responder à pergunta, ou não contém a informação pedida.",
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
