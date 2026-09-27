import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import { aiConfig } from "./config";
import { sheetFieldSpec } from "./tender-sheet-policy";
import type { TenderSheetFieldId } from "@workspace/db";
import { jevScheduler, retryAfterMs, type JevLane } from "./jev-scheduler";

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
  exclusions: Array<{ term: string; probability: number }>;
  model: string;
  inputTokens: number;
};

export type JevSizeRestriction = {
  restriction: "exclusive" | "quota" | "none";
  confidence: number;
  model: string;
  inputTokens: number;
};

export type JevSheetScores = {
  scores: Partial<Record<TenderSheetFieldId, number>>;
  model: string;
  inputTokens: number;
};

export type JevSheetChoice = {
  answer: string;
  confidence: number;
  model: string;
  inputTokens: number;
};

const clientFor = (lane: JevLane, requestFetch?: typeof fetch) => {
  const config = aiConfig();
  if (!config.apiKey)
    throw new JevUnavailableError("JEV_API_KEY is not configured");
  const baseFetch = requestFetch ?? fetch;
  const observedFetch: typeof fetch = async (input, init) => {
    const response = await baseFetch(input, init);
    if (response.status === 429 || response.status === 529) {
      jevScheduler.recordRateLimit(lane, retryAfterMs(response));
    }
    return response;
  };
  return new TypeSafeClient({
    apiKey: config.apiKey,
    defaultModel: config.model,
    timeout: config.timeoutMs,
    logLevel: "off",
    fetch: observedFetch,
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
  const exclusionQuestions = Object.fromEntries(
    input.exclusions.map((term, index) => [
      `exclusao_${index}`,
      noul(
        `O objeto principal de \`licitacao\` é a compra ou a prestação de "${term}", termo listado em \`perfil_da_empresa.exclusoes\`? Julgue o que o órgão está contratando como um todo, não os insumos de um serviço.`,
        {
          true: "O que se contrata é, em si, esse item de `perfil_da_empresa.exclusoes` (por exemplo, a licitação é para comprar esse produto).",
          false:
            "O objeto é outro, só menciona o tema, ou o item excluído aparece apenas como insumo, material ou parte de um serviço que a empresa presta.",
        },
      ),
    ]),
  );
  const questions = {
    aderencia: score(
      "Quanto do que `licitacao` contrata é o que `perfil_da_empresa` fornece?",
      [
        "O objeto e os itens em `licitacao` não têm relação com o que `perfil_da_empresa` fornece.",
        "Relação indireta: tema vizinho, ou a empresa forneceria só um item acessório.",
        "A empresa fornece parte relevante dos itens, mas não o objeto principal.",
        "A empresa fornece o objeto principal da licitação.",
      ] as const,
    ),
    ...exclusionQuestions,
  };
  try {
    const result = await jevScheduler.schedule("batch", () => clientFor("batch", requestFetch).systemOne({
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
    }));
    const answers = result.answers as Record<
      string,
      { type: string; noul?: number }
    >;
    return {
      fitScore: result.answers.aderencia.score,
      exclusions: input.exclusions.map((term, index) => ({
        term,
        probability: answers[`exclusao_${index}`]?.noul ?? 0,
      })),
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
): Promise<JevSizeRestriction> {
  const config = aiConfig();
  try {
    const result = await jevScheduler.schedule("batch", () => clientFor("batch", requestFetch).systemOne({
      model: config.model,
      state: { trecho_do_edital: passage },
      questions: {
        restricao: choice(
          "Como este trecho trata a participação de ME/EPP, microempresa ou empresa de pequeno porte? Classifique a regra aplicável ao item, lote ou certame descrito no trecho.",
          {
            exclusive:
              "A participação no item, lote ou certame é exclusiva de ME/EPP; empresas de outros portes não podem disputar essa contratação.",
            quota:
              "Somente uma parte ou percentual do objeto é uma cota reservada para ME/EPP, permanecendo uma cota principal aberta a outros portes.",
            none: "Não há exclusividade nem cota reservada; o trecho só traz benefícios como empate ficto, preferência pós-lances, subcontratação ou regularidade fiscal tardia, ou apenas menciona ME/EPP.",
          },
        ),
      },
    }));
    return {
      restriction: result.answers.restricao.choice,
      confidence: result.answers.restricao.confidence,
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
  try {
    const result = await jevScheduler.schedule("interactive", () => clientFor("interactive", requestFetch).systemOne({
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
    }));
    return {
      relevance: result.answers.responde.noul,
      model: result.model,
      inputTokens: result.usage.input_tokens,
    };
  } catch (error) {
    throw new JevUnavailableError("Jev request failed", error);
  }
}

export async function scoreSheetPassage(
  passage: string,
  fieldIds: TenderSheetFieldId[],
  requestFetch?: typeof fetch,
): Promise<JevSheetScores> {
  const config = aiConfig();
  const questions = Object.fromEntries(
    fieldIds.map((id) => {
      const spec = sheetFieldSpec(id);
      return [
        id,
        noul(spec.question, {
          true: "O trecho contém a regra ou o valor pedido de forma explícita.",
          false:
            "O trecho só menciona o tema, remete a outro documento ou item, ou trata de outro assunto.",
        }),
      ];
    }),
  );
  try {
    const result = await jevScheduler.schedule("interactive", () => clientFor("interactive", requestFetch).systemOne({
      model: config.model,
      state: { trecho_do_edital: passage },
      questions,
    }));
    const answers = result.answers as Record<
      string,
      { type: string; noul?: number }
    >;
    return {
      scores: Object.fromEntries(
        fieldIds.map((id) => [id, answers[id]?.noul ?? 0]),
      ),
      model: result.model,
      inputTokens: result.usage.input_tokens,
    };
  } catch (error) {
    throw new JevUnavailableError(
      "Jev tender-sheet scoring request failed",
      error,
    );
  }
}

export async function classifySheetField(
  fieldId: TenderSheetFieldId,
  passage: string,
  requestFetch?: typeof fetch,
): Promise<JevSheetChoice> {
  const config = aiConfig();
  const spec = sheetFieldSpec(fieldId);
  if (!spec.choices)
    throw new Error(`Sheet field ${fieldId} is not categorical`);
  const choices = spec.choices;
  try {
    const result = await jevScheduler.schedule("interactive", () => clientFor("interactive", requestFetch).systemOne({
      model: config.model,
      state: { trecho_do_edital: passage },
      questions: {
        answer: choice(
          `Classifique somente a regra explícita deste trecho para o campo ${fieldId}.`,
          choices,
        ),
      },
    }));
    return {
      answer: result.answers.answer.choice,
      confidence: result.answers.answer.confidence,
      model: result.model,
      inputTokens: result.usage.input_tokens,
    };
  } catch (error) {
    throw new JevUnavailableError(
      "Jev tender-sheet choice request failed",
      error,
    );
  }
}
