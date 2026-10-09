import { registrationLabel } from "../catalog/tender-platforms";
import { businessDaysBefore } from "../lib/business-days";

export type RegistrationRequirementPage = {
  documentTitle: string;
  documentUrl: string;
  page: number;
  text: string;
};

export type RegistrationRequirement = {
  /** Systems named in the clause (registration slugs). Empty when the edital only says "plataforma". */
  systems: { slug: string; label: string }[];
  businessDaysBefore: number | null;
  /** São Paulo date the count starts from (proposal deadline), YYYY-MM-DD. */
  referenceDate: string | null;
  /** Last day to be registered, counting national holidays only, YYYY-MM-DD. */
  deadline: string | null;
  evidence: { documentTitle: string; documentUrl: string; page: number; text: string };
};

const SYSTEM_MENTIONS: readonly [string, RegExp][] = [
  ["sicaf", /\bsicaf\b/],
  ["comprasgov", /\bcompras\.gov\.br\b|\bcomprasnet\b|\bcomprasgov\b/],
  ["licitanet", /\blicitanet\b/],
  ["bll", /\bbll\b/],
  ["bnc", /\bbnc\b|bolsa nacional de compras/],
  ["portal-compras-publicas", /portal de compras publicas\b(?! do estado)/],
  ["licitacoes-e", /\blicitacoes-e\b/],
  ["licitar-digital", /\blicitar digital\b/],
  ["bbmnet", /\bbbmnet\b/],
  ["licita-mais-brasil", /\blicita\s*(?:\+|mais)\s*brasil\b/],
  ["comprasbr", /\bcomprasbr\b/],
  ["contrata-mais-brasil", /\bcontrata\s*(?:\+|mais)\s*brasil\b/],
];

const GENERIC_SYSTEM = /\b(?:plataforma|provedor do sistema|sistema eletronico|portal eletronico)\b/;
const REGISTRATION_VERB = /\b(?:credenciad|credenciament|cadastrad|cadastrament)[a-z]*/g;
/** Challenges and clarification requests carry their own business-day deadlines right next to this clause. */
const OTHER_DEADLINE_CLAUSE = /impugna|esclareciment|recurso/;

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, primeiro: 1,
  dois: 2, duas: 2, segundo: 2,
  tres: 3, terceiro: 3,
  quatro: 4, quarto: 4,
  cinco: 5, quinto: 5,
};
const NUMBER = String.raw`(\d{1,2}|${Object.keys(NUMBER_WORDS).join("|")})\s*[ºo°ª]?\s*(?:\([^)]{1,20}\)\s*)?`;
const BUSINESS_DAY = String.raw`dias?\s+(?:util|uteis)`;
const DEADLINE_PATTERNS = [
  new RegExp(String.raw`\b${NUMBER}${BUSINESS_DAY}\s+(?:anterior|antes|que antecede|de antecedencia)`),
  new RegExp(String.raw`antecedencia\s+(?:minima\s+)?de\s+(?:ate\s+)?${NUMBER}${BUSINESS_DAY}`),
];

/** Diacritics removed and lowercased while keeping one character per character, so indexes map back to the quote. */
const fold = (value: string): string =>
  value.replace(/[\s\S]/g, (char) =>
    char.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().charAt(0) || char,
  );

const numberValue = (token: string): number | null => {
  const value = /^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token];
  return value !== undefined && value >= 1 && value <= 30 ? value : null;
};

const businessDaysIn = (window: string): number | null => {
  for (const pattern of DEADLINE_PATTERNS) {
    const match = pattern.exec(window);
    const value = match?.[1] ? numberValue(match[1]) : null;
    if (value !== null) return value;
  }
  return null;
};

const QUOTE_BEFORE = 200;
const QUOTE_AFTER = 350;

/**
 * Finds the "be registered on the platform/SICAF before the session" clause in text already
 * extracted from the edital. Rules only; prefers a clause that states the business-day deadline.
 */
export function detectRegistrationRequirement(
  pages: RegistrationRequirementPage[],
  referenceDate: string | null,
): RegistrationRequirement | null {
  let fallback: RegistrationRequirement | null = null;
  for (const page of pages) {
    const text = page.text.normalize("NFC");
    const folded = fold(text);
    for (const verb of folded.matchAll(REGISTRATION_VERB)) {
      const start = Math.max(0, verb.index - QUOTE_BEFORE);
      const end = Math.min(folded.length, verb.index + QUOTE_AFTER);
      const window = folded.slice(start, end);
      const systems = SYSTEM_MENTIONS
        .filter(([, pattern]) => pattern.test(window))
        .map(([slug]) => ({ slug, label: registrationLabel(slug) }));
      const tail = folded.slice(verb.index, end);
      const nextClause = tail.search(OTHER_DEADLINE_CLAUSE);
      const days = businessDaysIn(nextClause > 0 ? tail.slice(0, nextClause) : tail);
      if (systems.length === 0 && (days === null || !GENERIC_SYSTEM.test(window))) continue;
      const requirement: RegistrationRequirement = {
        systems,
        businessDaysBefore: days,
        referenceDate,
        deadline: days !== null && referenceDate ? businessDaysBefore(referenceDate, days) : null,
        evidence: {
          documentTitle: page.documentTitle,
          documentUrl: page.documentUrl,
          page: page.page,
          text: text.slice(start, end).replace(/\s+/g, " ").trim(),
        },
      };
      if (days !== null) return requirement;
      fallback ??= requirement;
    }
  }
  return fallback;
}
