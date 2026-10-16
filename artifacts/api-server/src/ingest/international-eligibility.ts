import type { BrazilEligibility } from "@workspace/db";
import { normalizeText } from "../domain/normalize";

/** What a rule decided, the rule that decided it and a sentence a person can read on the card. */
export type EligibilityDecision = {
  status: BrazilEligibility;
  rule: string;
  reason: string;
};

const decision = (
  status: BrazilEligibility,
  rule: string,
  reason: string,
): EligibilityDecision => ({ status, rule, reason });

/** Lower case, no accents, punctuation as spaces: `appel d'offres` and `Appel d’Offres` compare equal. */
const plain = (text: string): string =>
  ` ${normalizeText(text)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

/**
 * Each text is searched on its own: joined, the end of one and the start of the next would form phrases
 * nobody wrote ("…Coordonnateur National" + "Individual Consultant Selection").
 */
const plainTexts = (texts: Array<string | null | undefined>): string[] =>
  texts.flatMap((text) => (text ? [plain(text)] : []));

const mentions = (texts: string[], patterns: RegExp[]): boolean =>
  texts.some((text) => patterns.some((pattern) => pattern.test(text)));

/* ----------------------------------------------------------------------------------------------------------
 * Banco Mundial
 *
 * The API has no "open to country X" field. The market approach is written in the notice: "international
 * competitive procurement", "National Competitive Bidding (NCB)", "appel d'offres national"… The default is
 * `conditional`: being financed by the Bank is not, by itself, a statement that a firm from Brazil may bid
 * (national processes and some trust funds restrict it).
 * -------------------------------------------------------------------------------------------------------- */

const WB_INTERNATIONAL = [
  / international (open )?competitive (procurement|bidding|tender|tendering) /,
  / open international /,
  / international open /,
  / icb /,
  / international market approach /,
  / market approach (is )?(open )?international /,
  / appels? d offres (ouvert )?(a l )?internationa(l|ux) /,
  / aoi /,
  / concurrence internationale /,
  / licitacion (publica )?internacional /,
  / lpi /,
  / concurso (publico )?internacional /,
  / licitacao (publica )?internacional /,
  / concorrencia (publica )?internacional /,
  / competencia internacional /,
  / approche (du marche )?internationale /,
];

const WB_NATIONAL = [
  / national (open )?competitive (procurement|bidding|tender|tendering) /,
  / open national /,
  / national open /,
  / ncb /,
  / national market approach /,
  / market approach (is )?(open )?national /,
  / appels? d offres (ouvert )?(a l )?nationa(l|ux) /,
  / aon /,
  / concurrence nationale /,
  / licitacion (publica )?nacional /,
  / lpn /,
  / concurso (publico )?nacional /,
  / licitacao (publica )?nacional /,
  / concorrencia (publica )?nacional /,
  / competencia nacional /,
  / approche (du marche )?nationale /,
  / (national|local) shopping /,
  / (national|local) (individual )?consultants? /,
  / consultants? (individuels? )?nationa(l|ux) /,
  / consultor(es|a)? (individual(es)? )?(nacional(es)?|local(es)?) /,
  / (national|local|domestic) (bidders|firms|suppliers|contractors) only /,
  / limited to (national|local|domestic) /,
];

const WB_DIRECT = [/ direct (selection|contracting) /, / single source /];

/** Selection methods for consulting firms, by the code the API returns. */
const WB_CONSULTING_FIRM_METHODS = new Set([
  "QCBS",
  "QBS",
  "FBS",
  "LCS",
  "CQS",
  "SSS",
]);

export type WorldBankEligibilityInput = {
  methodCode: string | null;
  methodName: string | null;
  /** ISO code of the project country; `null` for a regional project or an unknown name. */
  country: string | null;
  countryName: string | null;
  /** Title, reference and the plain text of the notice. Read here, never stored. */
  texts: Array<string | null | undefined>;
};

export const worldBankEligibility = (
  input: WorldBankEligibilityInput,
): EligibilityDecision => {
  const texts = plainTexts([...input.texts, input.methodName]);
  const international = mentions(texts, WB_INTERNATIONAL);
  const national = mentions(texts, WB_NATIONAL);
  const method = (input.methodCode ?? "").trim().toUpperCase();
  const inBrazil = input.country === "BR";
  const where = input.countryName ?? "outro país";

  if (
    method === "DIR" ||
    method === "DS" ||
    mentions(plainTexts([input.methodName]), WB_DIRECT)
  )
    return decision(
      "no",
      "wb-direct-selection",
      "Contratação direta: não há concorrência aberta neste aviso.",
    );

  if (international && national)
    return decision(
      "conditional",
      "wb-ambiguous-market",
      "O aviso cita concorrência nacional e internacional. Confira no edital qual delas vale para este lote.",
    );

  if (international)
    return decision(
      "yes",
      "wb-international-open",
      method === "INDV"
        ? "Seleção internacional de consultor individual: aberta a profissionais elegíveis de qualquer país, salvo sanções e exigências do aviso."
        : "Concorrência internacional aberta a empresas elegíveis de qualquer país pelo Regulamento de Aquisições do Banco Mundial, salvo sanções e restrições do edital.",
    );

  if (national)
    return inBrazil
      ? decision(
          "conditional",
          "wb-national-brazil",
          "Processo nacional de projeto no Brasil: voltado a fornecedores estabelecidos no país. Confira a habilitação exigida no edital.",
        )
      : decision(
          "no",
          "wb-national-other-country",
          `Processo nacional ou local (${where}): voltado a fornecedores e consultores estabelecidos no país do projeto.`,
        );

  if (method === "RFQ")
    return decision(
      "conditional",
      "wb-quotations",
      "Pedido de cotações: costuma ser disputado por fornecedores do país do projeto. Empresa de fora só entra se o aviso admitir.",
    );

  if (method === "INDV")
    return decision(
      "conditional",
      "wb-individual-consultant",
      "Seleção de consultor individual: o aviso pode exigir nacionalidade, residência ou idioma do país do projeto.",
    );

  if (WB_CONSULTING_FIRM_METHODS.has(method))
    return decision(
      "conditional",
      "wb-consulting-firms",
      "Seleção de consultoria: firmas de fora em geral podem manifestar interesse, mas o aviso não declara concorrência internacional. Confira os critérios da lista curta.",
    );

  return decision(
    "conditional",
    "wb-default",
    "Financiado pelo Banco Mundial: a regra geral admite empresas elegíveis de qualquer país, mas este aviso não declara concorrência internacional. Confira o edital.",
  );
};

/* ----------------------------------------------------------------------------------------------------------
 * BID (Banco Interamericano de Desenvolvimento)
 *
 * The IDB procurement policies admit firms and individuals of its 48 member countries, and Brazil is one of
 * them. The dataset has no restriction field: only the method ("National Competitive Bidding") or the title can
 * say the process is limited to the project country. The notice document itself is not read.
 * -------------------------------------------------------------------------------------------------------- */

export type IdbEligibilityInput = {
  methodName: string | null;
  country: string | null;
  countryName: string | null;
  texts: Array<string | null | undefined>;
};

export const idbEligibility = (
  input: IdbEligibilityInput,
): EligibilityDecision => {
  const national = mentions(
    plainTexts([...input.texts, input.methodName]),
    WB_NATIONAL,
  );
  if (national && input.country === "BR")
    return decision(
      "yes",
      "idb-national-brazil",
      "Processo nacional de projeto no Brasil, financiado pelo BID: aberto a fornecedores estabelecidos no país. Confira a habilitação exigida no aviso.",
    );
  if (national)
    return decision(
      "unknown",
      "idb-national-restriction",
      `O aviso indica processo nacional ou local (${input.countryName ?? "país do projeto"}). O BID admite firmas dos 48 países-membros, mas este processo pode se limitar a quem está estabelecido no país do projeto. Confira o aviso.`,
    );
  return decision(
    "yes",
    "idb-member-country",
    "Financiado pelo BID: firmas e pessoas dos 48 países-membros podem participar, e o Brasil é membro. Confira no aviso se há restrição específica.",
  );
};

/* ----------------------------------------------------------------------------------------------------------
 * Funding & Tenders da União Europeia
 *
 * Two separate answers: may an entity or person from Brazil take part, and does the EU pay for it. Brazil
 * is not associated to any EU programme: in Horizon Europe it joins a consortium without EU money, except
 * where the call says otherwise (Annex B of the General Annexes) and in the individual MSCA and ERC grants.
 * -------------------------------------------------------------------------------------------------------- */

export type EuCallType = "topic" | "cascade" | "external";

export type EuEligibilityInput = {
  type: EuCallType;
  identifier: string;
  /** Programme label ("Horizon Europe (HORIZON)") or `null` when the source gives none. */
  programme: string | null;
  typesOfAction: string[];
  /** "Twinning", "Grants"… External action calls only. */
  contractType?: string | null;
  /** Topic conditions and description. Read here, never stored. */
  texts: Array<string | null | undefined>;
};

export type EuEligibility = {
  participation: EligibilityDecision;
  funding: EligibilityDecision;
};

const EU_RESTRICTED = [
  / participation (in this (topic|action|call) )?is (therefore )?limited to (legal )?entities established in /,
  / limited to legal entities established in (the )?(eu )?member states /,
  / only (legal )?entities established in (the )?(eu )?member states /,
  / must be established in (an? )?(eu )?member states? or (an? )?(horizon europe )?associated countr(y|ies) /,
  / established in (an? )?(eu )?member states? or (an? )?(horizon europe )?associated countr(y|ies) (are|is) eligible /,
];

const EU_MENTIONS_BRAZIL = [
  / bra[sz]il(ian)? /,
  / celac /,
  / latin america /,
  / mercosur /,
];

const NOT_FUNDED =
  "Em regra a UE não financia entidade do Brasil em projetos colaborativos (Anexo B do programa): ela participa com recursos próprios ou do mecanismo CNPq/FINEP/CONFAP, salvo exceção prevista na chamada.";

const isHorizon = (input: EuEligibilityInput): boolean =>
  /^HORIZON-/i.test(input.identifier) ||
  /horizon europe/i.test(input.programme ?? "");

const programmeName = (programme: string | null): string =>
  programme?.replace(/\s*\([^)]*\)\s*$/, "").trim() || "Programa da UE";

export const euEligibility = (input: EuEligibilityInput): EuEligibility => {
  const texts = plainTexts(input.texts);
  const actions = plainTexts([...input.typesOfAction, input.identifier]);
  const restricted = mentions(texts, EU_RESTRICTED);
  const mentionsBrazil = mentions(texts, EU_MENTIONS_BRAZIL);
  const action = (pattern: RegExp): boolean => mentions(actions, [pattern]);

  if (
    /^EDF-/i.test(input.identifier) ||
    /european defence fund/i.test(input.programme ?? "")
  ) {
    const reason =
      "Fundo Europeu de Defesa: só entidades estabelecidas na UE ou na Noruega, sem controle de país de fora.";
    return {
      participation: decision("no", "eu-defence-fund", reason),
      funding: decision("no", "eu-defence-fund", reason),
    };
  }

  if (input.type === "external") {
    if (/twinning/i.test(input.contractType ?? "")) {
      const reason =
        "Twinning: cooperação entre administrações públicas de Estados-Membros da UE e o país beneficiário.";
      return {
        participation: decision("no", "eu-twinning", reason),
        funding: decision("no", "eu-twinning", reason),
      };
    }
    return {
      participation: decision(
        "unknown",
        "eu-external-action",
        "Ação externa da UE: a regra de nacionalidade vem do instrumento (NDICI, IPA) e das diretrizes da chamada. Confira as “Guidelines for applicants”.",
      ),
      funding: decision(
        "unknown",
        "eu-external-action",
        "O financiamento segue a mesma regra de nacionalidade das diretrizes da chamada.",
      ),
    };
  }

  if (input.type === "cascade") {
    if (restricted) {
      const reason =
        "Chamada em cascata restrita a entidades estabelecidas na UE ou em países associados.";
      return {
        participation: decision("no", "eu-cascade-restricted", reason),
        funding: decision("no", "eu-cascade-restricted", reason),
      };
    }
    if (mentionsBrazil)
      return {
        participation: decision(
          "conditional",
          "eu-mentions-brazil",
          "A chamada em cascata cita o Brasil ou a América Latina. Confira quem pode se candidatar.",
        ),
        funding: decision(
          "conditional",
          "eu-mentions-brazil",
          "Pode haver apoio a participante do Brasil. Confira as condições da chamada.",
        ),
      };
    return {
      participation: decision(
        "unknown",
        "eu-cascade",
        "Chamada em cascata de um projeto financiado pela UE: os países aceitos são definidos pelo projeto e, em geral, exigem sede na UE ou em país associado.",
      ),
      funding: decision(
        "unknown",
        "eu-cascade",
        "O apoio é pago pelo projeto que abriu a chamada, conforme os países que ele aceita.",
      ),
    };
  }

  if (restricted) {
    const reason =
      "A chamada limita a participação a entidades estabelecidas em Estados-Membros da UE e países associados.";
    return {
      participation: decision("no", "eu-restricted", reason),
      funding: decision("no", "eu-restricted", reason),
    };
  }

  const individualGrant =
    action(/ msca postdoctoral /) || action(/ msca pf /) || action(/ erc /);
  if (individualGrant)
    return {
      participation: decision(
        "yes",
        "eu-individual-researcher",
        "Bolsa individual: pesquisador de qualquer nacionalidade pode se candidatar com uma instituição anfitriã na UE ou em país associado.",
      ),
      funding: decision(
        "yes",
        "eu-individual-researcher",
        "A bolsa é paga por meio da instituição anfitriã europeia; a nacionalidade do pesquisador não a limita.",
      ),
    };

  if (action(/ msca /))
    return {
      participation: decision(
        "conditional",
        "eu-msca-partner",
        "Organização do Brasil entra como parceira associada da rede (recebe e envia pesquisadores), com proponentes da UE ou de países associados.",
      ),
      funding: mentionsBrazil
        ? decision(
            "conditional",
            "eu-mentions-brazil",
            "A chamada cita o Brasil ou a América Latina: pode haver exceção de financiamento. Confira as condições.",
          )
        : decision("no", "eu-third-country-not-funded", NOT_FUNDED),
    };

  if (isHorizon(input))
    return {
      participation: decision(
        "conditional",
        "eu-horizon-consortium",
        "Entidade do Brasil pode participar como parceira de um consórcio com entidades da UE ou de países associados; não pode ser a única proponente.",
      ),
      funding: mentionsBrazil
        ? decision(
            "conditional",
            "eu-mentions-brazil",
            "A chamada cita o Brasil ou a América Latina: pode haver exceção de financiamento. Confira as condições.",
          )
        : decision("no", "eu-third-country-not-funded", NOT_FUNDED),
    };

  const programme = programmeName(input.programme);
  return {
    participation: mentionsBrazil
      ? decision(
          "conditional",
          "eu-mentions-brazil",
          `${programme}: a chamada cita o Brasil ou a América Latina. Confira quem pode se candidatar.`,
        )
      : decision(
          "unknown",
          "eu-programme-countries",
          `${programme}: os países elegíveis são os Estados-Membros e os associados ao programa. O Brasil não é associado; a participação depende de previsão na chamada.`,
        ),
    funding: mentionsBrazil
      ? decision(
          "conditional",
          "eu-mentions-brazil",
          "Pode haver financiamento a participante do Brasil. Confira as condições da chamada.",
        )
      : decision(
          "no",
          "eu-programme-countries",
          "O programa financia entidades dos países elegíveis; o Brasil não está entre os associados.",
        ),
  };
};
