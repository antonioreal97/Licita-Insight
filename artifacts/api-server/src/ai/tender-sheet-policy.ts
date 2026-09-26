import type {
  TenderSheetDiagnostic,
  TenderSheetEvidence,
  TenderSheetField,
  TenderSheetFieldId,
} from "@workspace/db";

export type SheetChoice = { answer: string; confidence: number };
export type SheetScoredCandidate = {
  evidence: TenderSheetEvidence;
  noul: number;
};

type FieldSpec = {
  id: TenderSheetFieldId;
  terms: readonly string[];
  question: string;
  choices?: Readonly<Record<string, string>>;
};

export const SHEET_PROMPT_VERSION = 2;

export const SHEET_FIELDS: readonly FieldSpec[] = [
  {
    id: "consortium",
    terms: ["consórcio", "consorciada", "participação em consórcio"],
    question:
      "O trecho contém uma regra explícita sobre permitir ou vedar participação em consórcio?",
    choices: {
      allowed: "O trecho permite a participação em consórcio.",
      forbidden: "O trecho veda a participação em consórcio.",
      not_defined:
        "O trecho não define com clareza se consórcio é permitido ou vedado.",
    },
  },
  {
    id: "subcontracting",
    terms: ["subcontratação", "subcontratar", "subcontratada", "subcontratado"],
    question:
      "O trecho contém uma regra explícita sobre permitir, limitar ou vedar subcontratação?",
    choices: {
      allowed: "O trecho permite subcontratação sem indicar limite material.",
      limited:
        "O trecho permite subcontratação apenas parcial ou sob condições/limites.",
      forbidden: "O trecho veda subcontratação.",
      not_defined: "O trecho não define com clareza a regra de subcontratação.",
    },
  },
  {
    id: "me_epp",
    terms: [
      "ME EPP",
      "microempresa",
      "empresa de pequeno porte",
      "exclusiva ME EPP",
      "cota reservada",
      "Lei Complementar 123",
    ],
    question:
      "O trecho contém regra aplicável de participação ou benefício para ME/EPP?",
    choices: {
      exclusive: "O item, lote ou certame é exclusivo para ME/EPP.",
      quota: "Há cota reservada para ME/EPP, com parcela principal aberta.",
      benefits_only:
        "Há somente benefícios da LC 123, como preferência, empate ficto ou regularidade tardia.",
      not_defined:
        "O trecho apenas menciona ME/EPP ou não permite distinguir a regra.",
    },
  },
  {
    id: "site_visit",
    terms: [
      "visita técnica",
      "visita ao local",
      "vistoria",
      "declaração de visita",
      "atestado de visita",
    ],
    question:
      "O trecho contém regra explícita sobre visita técnica ou vistoria?",
    choices: {
      mandatory: "A visita/vistoria é obrigatória.",
      optional:
        "A visita/vistoria é facultativa ou pode ser substituída por declaração.",
      waived: "O trecho dispensa expressamente visita/vistoria.",
      not_defined:
        "O trecho não define com clareza se a visita/vistoria é exigida.",
    },
  },
  {
    id: "samples",
    terms: [
      "amostra",
      "amostras",
      "prova de conceito",
      "demonstração técnica",
      "protótipo",
    ],
    question:
      "O trecho contém regra explícita sobre exigir ou não amostra/prova de conceito?",
    choices: {
      required: "O trecho exige amostra ou prova de conceito.",
      not_required:
        "O trecho diz expressamente que amostra ou prova de conceito não é exigida.",
      not_defined: "O trecho não define com clareza a exigência.",
    },
  },
  {
    id: "bid_guarantee",
    terms: [
      "garantia de proposta",
      "garantia da proposta",
      "garantia de participação",
      "caução da proposta",
      "seguro garantia proposta",
    ],
    question:
      "O trecho contém regra explícita sobre exigir ou não garantia de proposta/participação?",
    choices: {
      required: "O trecho exige garantia de proposta ou participação.",
      not_required:
        "O trecho diz expressamente que garantia de proposta ou participação não será exigida.",
      not_defined:
        "O trecho não define com clareza se a garantia de proposta ou participação é exigida.",
    },
  },
  {
    id: "contract_guarantee",
    terms: [
      "garantia contratual",
      "garantia do contrato",
      "garantia de execução",
      "garantia da contratação",
      "seguro garantia",
      "caução",
    ],
    question:
      "O trecho contém regra explícita sobre exigir ou não garantia contratual/de execução?",
    choices: {
      required: "O trecho exige garantia contratual ou de execução.",
      not_required:
        "O trecho diz expressamente que garantia contratual ou de execução não será exigida.",
      not_defined:
        "O trecho não define com clareza se a garantia contratual ou de execução é exigida.",
    },
  },
  {
    id: "penalties",
    terms: [
      "multa",
      "multas",
      "penalidade",
      "sanção",
      "sanções administrativas",
    ],
    question:
      "O trecho contém regra, hipótese ou valor de multa aplicável à contratação?",
  },
  {
    id: "technical_qualification",
    terms: [
      "qualificação técnica",
      "capacidade técnica",
      "atestado de capacidade",
      "acervo técnico",
      "CREA",
      "CAU",
      "CRA",
      "conselho profissional",
    ],
    question:
      "O trecho contém exigência de qualificação técnica, atestado, acervo ou registro em conselho?",
  },
  {
    id: "financial_qualification",
    terms: [
      "qualificação econômico financeira",
      "índice de liquidez",
      "liquidez geral",
      "patrimônio líquido",
      "capital mínimo",
      "balanço patrimonial",
    ],
    question:
      "O trecho contém exigência de qualificação econômico-financeira, índice, patrimônio ou capital mínimo?",
  },
  {
    id: "contract_term",
    terms: [
      "vigência do contrato",
      "prazo de vigência",
      "vigência contratual",
      "contrato terá vigência",
      "duração do contrato",
    ],
    question: "O trecho contém o prazo de vigência ou duração do contrato?",
  },
  {
    id: "delivery_term",
    terms: [
      "prazo de entrega",
      "prazo para entrega",
      "prazo de execução",
      "início da execução",
      "cronograma de entrega",
      "execução dos serviços",
    ],
    question:
      "O trecho contém um prazo de entrega do objeto ou de execução dos serviços?",
  },
  {
    id: "price_adjustment",
    terms: [
      "reajuste",
      "reajustamento",
      "repactuação",
      "reequilíbrio econômico",
      "índice de preços",
      "data base",
    ],
    question:
      "O trecho contém regra, prazo ou índice de reajuste/repactuação de preços?",
  },
] as const;

export const sheetFieldSpec = (id: TenderSheetFieldId): FieldSpec => {
  const spec = SHEET_FIELDS.find((candidate) => candidate.id === id);
  if (!spec) throw new Error(`Unknown sheet field: ${id}`);
  return spec;
};

export const sheetSearchQuery = (id: TenderSheetFieldId): string =>
  sheetFieldSpec(id)
    .terms.map((term) => (term.includes(" ") ? `"${term}"` : term))
    .join(" OR ");

export function buildSheetFields(
  candidates: Partial<Record<TenderSheetFieldId, SheetScoredCandidate[]>>,
  choices: Partial<Record<TenderSheetFieldId, SheetChoice>>,
  evidenceThreshold: number,
  answerThreshold: number,
): { fields: TenderSheetField[]; diagnostics: TenderSheetDiagnostic[] } {
  const fields: TenderSheetField[] = [];
  const diagnostics: TenderSheetDiagnostic[] = [];
  for (const spec of SHEET_FIELDS) {
    const ranked = [...(candidates[spec.id] ?? [])].sort(
      (a, b) => b.noul - a.noul,
    );
    const best = ranked[0];
    diagnostics.push({
      id: spec.id,
      bestNoul: best?.noul ?? null,
      secondNoul: ranked[1]?.noul ?? null,
      bestEvidence: best?.evidence ?? null,
      secondEvidence: ranked[1]?.evidence ?? null,
    });
    if (!best || best.noul < evidenceThreshold) {
      fields.push({
        id: spec.id,
        status: "not_found",
        answer: null,
        confidence: null,
        evidence: null,
      });
      continue;
    }
    const classification = choices[spec.id];
    const answer =
      spec.choices &&
      classification &&
      classification.answer !== "not_defined" &&
      classification.confidence >= answerThreshold
        ? classification.answer
        : null;
    fields.push({
      id: spec.id,
      status: "found",
      answer,
      confidence: spec.choices
        ? (classification?.confidence ?? null)
        : best.noul,
      evidence: best.evidence,
    });
  }
  return { fields, diagnostics };
}

export const sheetCacheKey = (
  tenderId: string,
  indexVersion: number,
  model: string,
  promptVersion = SHEET_PROMPT_VERSION,
): string => `${tenderId}:${indexVersion}:${model}:${promptVersion}`;
