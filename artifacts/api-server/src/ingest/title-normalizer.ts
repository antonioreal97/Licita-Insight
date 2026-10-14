export const DISPLAY_TITLE_RULES_VERSION = 2;

export const KNOWN_TITLE_ACRONYMS = [
  "SUS", "UBS", "CRAS", "CREAS", "CAPS", "GLP", "EPI", "TI", "VoIP",
  "PPAIS", "MEI", "GCM", "SAMU", "ETA", "ETE", "LED", "PNCP", "ABNT",
  "NBR", "EJA", "APAE", "MPAL", "SIGA", "IPMU", "APEPREM", "JESC",
  "SMED", "EPP",
] as const;

export type NormalizedTenderTitle = {
  title: string;
  needsModel: boolean;
  reasons: string[];
};

const acronymByKey = new Map(
  KNOWN_TITLE_ACRONYMS.map((value) => [value.toLocaleUpperCase("pt-BR"), value]),
);

const collapse = (value: string): string =>
  value
    .normalize("NFC")
    .replace(/[“”„«»]/g, '"')
    .replace(/[‘’´`]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const trimPunctuation = (value: string): string =>
  value
    .replace(/^[\s,;:.\-–]+/, "")
    .replace(/[\s,;:\-–]+$/, "")
    .replace(/(?<!\.)\.$/u, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:]){2,}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const DANGLING_CONNECTOR = /(?:\s+(?:de|do|da|dos|das|para|com|em|no|na|e|a|o))+$/iu;

// Applied only after a removal or cut, so an object such as "Vitamina A" keeps its last word.
const trimDanglingConnectors = (value: string): string =>
  trimPunctuation(trimPunctuation(value).replace(DANGLING_CONNECTOR, ""));

const removeRepeatedPrefix = (value: string): string =>
  value.replace(/^(.{12,80}?)\s+\1(?=\s|$)/iu, "$1");

const removeOpening = (value: string): string => {
  let title = value.replace(/^\[[^\]]{2,60}\]\s*[-:]?\s*/iu, "");
  const openings: RegExp[] = [
    /^o objeto da presente licita(?:ç|c)[aã]o (?:é|e)(?: a escolha da proposta mais vantajosa para)?(?: a)?\s*/iu,
    /^o presente preg[aã]o tem por objeto\s*/iu,
    /^constitui objeto (?:do presente|deste)(?: [^,;:.]{0,40})?[,;:]?\s*/iu,
    /^justificativa de uso\s*:\s*/iu,
    /^solicito(?: a)?\s+/iu,
    /^despesa (?:com|referente a)\s+/iu,
    /^contrata(?:ç|c)[aã]o direta,?\s*por dispensa de licita(?:ç|c)[aã]o,?\s*(?:de\s+)?/iu,
  ];
  for (const opening of openings) title = title.replace(opening, "");

  // Some direct awards put the supplier before the actual object.
  if (/^pessoa jur[ií]dica\b/iu.test(title)) {
    const actualObject = title.search(/\bpara (?:contrata(?:ç|c)[aã]o|aquisi(?:ç|c)[aã]o)\b/iu);
    if (actualObject >= 0) title = title.slice(actualObject + 5);
  }
  return trimPunctuation(title);
};

const shortenFormulas = (value: string): string => {
  let title = value;
  title = title.replace(
    /^contrata(?:ç|c)[aã]o da empresa .{2,180}?,?\s*para presta(?:ç|c)[aã]o de servi(?:ç|c)os(?: especializados)? de\s+/iu,
    "Contratação de serviço de ",
  );
  title = title.replace(
    /^registro de pre(?:ç|c)os para (?:futura e eventual|eventual e futura) contrata(?:ç|c)[aã]o de (?:empresa(?:s)?\s+)?(?:especializada(?:s)?\s+)?(?:para|em) presta(?:ç|c)[aã]o de servi(?:ç|c)os de\s+/iu,
    "Registro de preços para serviço de ",
  );
  title = title.replace(
    /^registro de pre(?:ç|c)os para (?:futura e eventual|eventual e futura) contrata(?:ç|c)[aã]o de (?:empresa(?:s)?\s+)?(?:especializada(?:s)?\s+)?(?:para|em) (?:o )?fornecimento de\s+/iu,
    "Registro de preços para aquisição de ",
  );
  title = title.replace(
    /^registro de pre(?:ç|c)os para (?:futura e eventual|eventual e futura) aquisi(?:ç|c)[aã]o de\s+/iu,
    "Registro de preços para aquisição de ",
  );
  title = title.replace(
    /^contrata(?:ç|c)[aã]o de (?:pessoa jur[ií]dica|empresa(?:s)?)(?: especializada(?:s)?)? (?:para|em) presta(?:ç|c)[aã]o de servi(?:ç|c)os de\s+/iu,
    "Contratação de serviço de ",
  );
  title = title.replace(
    /^contrata(?:ç|c)[aã]o de (?:pessoa jur[ií]dica|empresa(?:s)?)(?: especializada(?:s)?)? (?:para|em) (?:o )?fornecimento de\s+/iu,
    "Aquisição de ",
  );
  title = title.replace(
    /^contrata(?:ç|c)[aã]o de empresa para servi(?:ç|c)os? de\s+/iu,
    "Contratação de serviço de ",
  );
  title = title.replace(
    /^contrata(?:ç|c)[aã]o de empresa(?: especializada)? em presta(?:ç|c)[aã]o de servi(?:ç|c)os de\s+/iu,
    "Contratação de serviço de ",
  );
  title = title.replace(
    /^contrata(?:ç|c)[aã]o de empresa(?: especializada)? em fornecimento de\s+/iu,
    "Aquisição de ",
  );
  return title;
};

const PERSON_AFTER_COLON = /:\s*(?:[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ]{2,}(?:\s+(?:DE|DA|DO|DAS|DOS|E))?\s*){2,8}[.,;]?\s*$/u;
const PROPER_PERSON_AFTER_COLON = /:\s*[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+(?:\s+(?:de|da|do|das|dos|e))?(?:\s+[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ][\p{L}'-]+){1,5}[.,;]?\s*$/u;

const SENSITIVE_IDENTIFIERS: RegExp[] = [
  /\b(?:CNPJ|CPF)\s*:?(?:\s*n[º°o.]?\s*)?\d{2,3}[.\s]?\d{3}[.\s]?\d{3}[\/.\s-]?\d{2,4}(?:[-\s]?\d{2})?\b/giu,
  /\b(?:placa|placas)\s*:?[\s,]*(?:[A-Z]{3}[-\s]?\d{4}|[A-Z]{3}[-\s]?\d[A-Z]\d{2})\b/giu,
  /\b[A-Z]{3}[-\s]?(?:\d{4}|\d[A-Z]\d{2})\b/gu,
  /\b(?:processo(?: administrativo)?|SEC)\s*(?:n[º°o.]?|n[uú]mero)?\s*[:.-]?\s*(?=[A-Z0-9./-]*\d)[A-Z0-9][A-Z0-9./-]*\b/giu,
];

const removeSensitiveIdentifiers = (value: string): { value: string; removed: boolean } => {
  let title = value;
  let removed = false;
  for (const pattern of [PERSON_AFTER_COLON, PROPER_PERSON_AFTER_COLON, ...SENSITIVE_IDENTIFIERS]) {
    const next = title.replace(pattern, "");
    if (next === title) continue;
    removed = true;
    title = trimDanglingConnectors(next.replace(/\s+,/g, ",").replace(/,\s*,/g, ", "));
  }
  return { value: trimPunctuation(title), removed };
};

// A removal can leave a glued abbreviation ("916.ORE") or empty parentheses behind.
const FRAGMENT_TOKEN = /[\p{L}\d]\.\p{L}/u;
const EMPTY_PARENTHESES = /\(\s*\)/u;

const cutTail = (value: string): { value: string; cut: boolean } => {
  const tails = [
    /,\s*visando\b/iu,
    /\s+visando atender\b/iu,
    /\s+para atender (?:à|a|às|as) necessidades\b/iu,
    /,\s*conforme\b/iu,
    /\s+conforme (?:termo|edital|art\.?|sec\b|especifica(?:ç|c)[oõ]es)\b/iu,
    /\s+em atendimento\b/iu,
    /\s+pertencente(?:s)? (?:à|a|ao)\b/iu,
    /\s+com recursos\b/iu,
    /\s+destinad(?:o|a|os|as) a atender\b/iu,
  ];
  let index = value.length;
  for (const tail of tails) {
    const match = tail.exec(value);
    if (match && match.index >= 12) index = Math.min(index, match.index);
  }
  return index < value.length
    ? { value: trimDanglingConnectors(value.slice(0, index)), cut: true }
    : { value, cut: false };
};

const upperLetterRatio = (value: string): number => {
  const letters: string[] = value.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const uppercase = letters.filter(
    (letter) => letter === letter.toLocaleUpperCase("pt-BR") && letter !== letter.toLocaleLowerCase("pt-BR"),
  );
  return uppercase.length / letters.length;
};

const sentenceCase = (value: string): string => {
  let firstWord = true;
  return value.replace(/[\p{L}\d]+(?:[./-][\p{L}\d]+)*/gu, (token) => {
    if (/\d/u.test(token)) {
      if (/\p{L}/u.test(token)) firstWord = false;
      return token;
    }
    const acronym = acronymByKey.get(token.toLocaleUpperCase("pt-BR"));
    if (acronym) {
      firstWord = false;
      return acronym;
    }
    const lower = token.toLocaleLowerCase("pt-BR");
    if (!firstWord) return lower;
    firstWord = false;
    return lower[0]?.toLocaleUpperCase("pt-BR") + lower.slice(1);
  });
};

const limitTitle = (value: string): string => {
  if (value.length <= 100) return value;
  const within = value.slice(0, 101);
  const naturalMatches = [...within.matchAll(/[.;!?](?=\s|$)/gu)];
  const natural = naturalMatches.at(-1);
  if (natural && natural.index >= 60) return trimPunctuation(value.slice(0, natural.index + 1));
  const candidate = value.slice(0, 97).trimEnd();
  const boundary = candidate.lastIndexOf(" ");
  return `${trimDanglingConnectors(boundary >= 60 ? candidate.slice(0, boundary) : candidate)}...`;
};

const GENERIC_TITLE = /^(?:objeto n[aã]o informado pelo pncp|solicita(?:ç|c)[aã]o gerada para cota(?:ç|c)[aã]o|servi(?:ç|c)os? de m[aã]o de obra especializada)\b/iu;
const PROCEDURAL_OPENING = /^(?:dispensa de licita(?:ç|c)[aã]o|ades[aã]o (?:à|a) ata|celebra(?:ç|c)[aã]o de ["']?contrato de programa|pagamento de franquia)\b/iu;

export const normalizeTenderTitle = (raw: string): NormalizedTenderTitle => {
  const source = collapse(raw);
  const hadPersonPattern = PERSON_AFTER_COLON.test(source) || PROPER_PERSON_AFTER_COLON.test(source);
  let title = removeRepeatedPrefix(removeOpening(source));
  title = shortenFormulas(title);
  const identifiers = removeSensitiveIdentifiers(title);
  title = identifiers.value;
  const emptyParentheses = identifiers.removed && EMPTY_PARENTHESES.test(title);
  if (emptyParentheses) title = trimDanglingConnectors(title.replace(/\(\s*\)/gu, " "));
  const fragment = emptyParentheses || (identifiers.removed && FRAGMENT_TOKEN.test(title));
  const tail = cutTail(title);
  title = tail.value;
  if (upperLetterRatio(title) >= 0.6) title = sentenceCase(title);
  title = limitTitle(trimPunctuation(title));
  if (title === "") title = limitTitle(trimPunctuation(sentenceCase(source || "Objeto não informado pelo PNCP")));

  const reasons: string[] = [];
  const words = title.match(/[\p{L}\d]+/gu) ?? [];
  if (title.length > 80) reasons.push("long_title");
  if (words.length < 3) reasons.push("too_short");
  if (GENERIC_TITLE.test(title)) reasons.push("generic_title");
  if (hadPersonPattern) reasons.push("person_name");
  if (fragment) reasons.push("removal_fragment");
  if (PROCEDURAL_OPENING.test(title) || (!tail.cut && /^(?:licita(?:ç|c)[aã]o|objeto|contrata(?:ç|c)[aã]o direta)\b/iu.test(title))) {
    reasons.push("unclear_object");
  }

  return { title, needsModel: reasons.length > 0, reasons };
};
