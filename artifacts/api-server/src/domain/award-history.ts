import { categoryLabel } from "../catalog/tender-categories";
import { normalizeText } from "./normalize";

/**
 * Who sees the winners' names in the award history of a tender.
 * - "entitled": the aggregate numbers are public; names (top winners and per-purchase winners) need active access.
 * - "public": everyone sees the names.
 * Change here only; the API reports the current value in `meta.access.winnerNames`.
 */
export const AWARD_HISTORY_WINNER_NAMES: "entitled" | "public" = "entitled";

export const AWARD_HISTORY_WINDOW_MONTHS = 24;
export const AWARD_HISTORY_MAX_KEYWORDS = 8;
export const AWARD_HISTORY_TOP_WINNERS = 5;
export const AWARD_HISTORY_RECENT = 6;
/** With at least this many similar purchases in the tender's own buying unit, the history narrows to that unit. */
export const AWARD_HISTORY_UNIT_SCOPE_MIN = 3;

export const AWARD_HISTORY_CRITERIA =
  "Compras do mesmo órgão (CNPJ) nos últimos 24 meses cujo objeto do contrato tem pelo menos duas palavras-chave deste edital, " +
  "ou uma palavra-chave e a mesma categoria. Quando a mesma unidade compradora tem 3 ou mais compras parecidas, o histórico fica só nessa unidade.";

/** Articles, prepositions and words every tender has; none of them says what is being bought. */
const IGNORED = new Set([
  "para", "pela", "pelas", "pelo", "pelos", "sobre", "umas", "entre", "aquisicao", "aquisicoe", "contratacao",
  "contratacoe", "contratada", "contratado", "contrato", "empresa", "especializada", "especializado", "fornecimento",
  "eventual", "eventuai", "futura", "futuro", "registro", "preco", "servico", "prestacao", "objeto", "item", "iten",
  "lote", "tipo", "conforme", "edital", "termo", "referencia", "anexo", "municipio", "municipal", "estadual",
  "federal", "secretaria", "prefeitura", "camara", "atender", "atendimento", "demanda", "necessidade", "diverso",
  "diversa", "materiai", "material", "unidade", "quantidade", "especificacoe", "especificacao", "menor", "global",
  "pregao", "eletronico", "eletronica", "licitacao", "processo", "publico", "publica", "destinado", "destinada",
  "visando", "regime", "execucao", "geral", "outro", "outra", "exercicio", "periodo", "mese", "orgao", "suprir",
  "acordo", "durante", "valor", "estimado", "total", "parcelado", "parcelada", "integral", "dispensa",
  "inexigibilidade", "compra", "sistema", "tais", "como", "este", "esta", "estes", "estas", "seus", "suas",
]);

/** Lowercase, no accents, words of 4+ letters, simple plural folding (`medicamentos` → `medicamento`). */
export const objectTokens = (text: string | null | undefined): string[] => {
  if (!text) return [];
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 4 && !/^\d+$/.test(word))
    .map((word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word))
    .filter((word) => !IGNORED.has(word));
};

export type AwardHistoryTender = {
  id: string;
  title: string;
  objectSummary: string | null;
  itemDescriptions: string[];
  categorySlugs: string[];
  purchasingUnit: string | null;
};

/** Title and object words weigh three times an item description; ties keep the first occurrence. */
export function tenderKeywords(tender: Pick<AwardHistoryTender, "title" | "objectSummary" | "itemDescriptions">): string[] {
  const weights = new Map<string, number>();
  const add = (text: string | null, weight: number) => {
    for (const token of new Set(objectTokens(text))) weights.set(token, (weights.get(token) ?? 0) + weight);
  };
  add(tender.title, 3);
  add(tender.objectSummary, 3);
  for (const description of tender.itemDescriptions.slice(0, 60)) add(description, 1);
  return [...weights.entries()]
    .map(([token, weight], order) => ({ token, weight, order }))
    .sort((left, right) => right.weight - left.weight || left.order - right.order)
    .slice(0, AWARD_HISTORY_MAX_KEYWORDS)
    .map(({ token }) => token);
}

export type SupplierKind = "company" | "individual" | "foreign" | "unidentified";

export type HistorySupplierInput = {
  type: string | null;
  identifier: string | null;
  name: string | null;
};

type ClassifiedSupplier = {
  /** Internal grouping key; individuals are grouped by CPF here and never leave this module. */
  key: string;
  kind: SupplierKind;
  name: string | null;
  cnpj: string | null;
};

/**
 * Only companies keep a name and a CNPJ. A natural person (CPF), a foreign supplier and a supplier without a
 * usable identity are reported only as a group.
 */
export function classifySupplier(supplier: HistorySupplierInput): ClassifiedSupplier | null {
  const digits = supplier.identifier?.replace(/\D/g, "") ?? "";
  const name = supplier.name?.trim() || null;
  if (!supplier.type && !digits && !name) return null;
  const isCompany = supplier.type === "PJ" || (!supplier.type && digits.length === 14);
  if (isCompany && (digits.length === 14 || name)) {
    const cnpj = digits.length === 14 ? digits : null;
    return { key: cnpj ? `pj:${cnpj}` : `pj-name:${normalizeText(name!)}`, kind: "company", name, cnpj };
  }
  if (supplier.type === "PF" || (!supplier.type && digits.length === 11)) {
    return { key: `pf:${digits || normalizeText(name ?? "")}`, kind: "individual", name: null, cnpj: null };
  }
  if (supplier.type === "PE") {
    return { key: `pe:${digits || normalizeText(name ?? "")}`, kind: "foreign", name: null, cnpj: null };
  }
  return { key: `unknown:${digits || normalizeText(name ?? "")}`, kind: "unidentified", name: null, cnpj: null };
}

export type HistoryContract = {
  purchaseKey: string;
  purchaseControlNumber: string;
  object: string | null;
  purchasingUnit: string | null;
  supplier: HistorySupplierInput;
  value: number | null;
  /** YYYY-MM-DD: signature date, else publication date. */
  date: string | null;
};

export type HistoryLinkedTender = {
  id: string;
  title: string;
  objectSummary: string | null;
  itemDescriptions: string[];
  categorySlugs: string[];
};

export type HistoryResult = {
  purchaseKey: string;
  supplier: HistorySupplierInput;
  totalValue: number | null;
  unitValue: number | null;
  quantity: number | null;
  discountPercent: number | null;
  resultDate: string | null;
};

export type HistoryPurchase = {
  key: string;
  controlNumber: string;
  contracts: HistoryContract[];
  linkedTender: HistoryLinkedTender | null;
};

export type SimilarityCheck = { similar: boolean; sharedKeywords: string[]; sameCategory: boolean };

export function purchaseCategorySlugs(
  purchase: HistoryPurchase,
  classify: (text: string) => readonly string[],
): string[] {
  if (purchase.linkedTender && purchase.linkedTender.categorySlugs.length > 0) return purchase.linkedTender.categorySlugs;
  const text = purchase.contracts.map(({ object }) => object ?? "").join(" ").trim();
  return text ? [...classify(text)] : [];
}

export function purchaseSimilarity(
  keywords: readonly string[],
  tenderCategories: readonly string[],
  purchase: HistoryPurchase,
  classify: (text: string) => readonly string[],
): SimilarityCheck {
  const words = new Set<string>();
  for (const contract of purchase.contracts) for (const token of objectTokens(contract.object)) words.add(token);
  if (purchase.linkedTender) {
    for (const token of objectTokens(purchase.linkedTender.title)) words.add(token);
    for (const token of objectTokens(purchase.linkedTender.objectSummary)) words.add(token);
  }
  const sharedKeywords = keywords.filter((keyword) => words.has(keyword));
  const relevant = tenderCategories.filter((slug) => slug !== "outros");
  const sameCategory = relevant.length > 0 &&
    purchaseCategorySlugs(purchase, classify).some((slug) => relevant.includes(slug));
  const needed = Math.min(2, keywords.length);
  const similar = needed > 0 && (sharedKeywords.length >= needed || (sharedKeywords.length >= 1 && sameCategory));
  return { similar, sharedKeywords, sameCategory };
}

export type AwardHistoryWinner = {
  /** Null for groups (natural persons, foreign or unidentified suppliers) and when names are locked. */
  name: string | null;
  cnpj: string | null;
  kind: SupplierKind;
  /** Similar purchases in which this supplier (or group) won at least one item or signed a contract. */
  wins: number;
};

export type AwardHistoryRecentPurchase = {
  purchasePncpControlNumber: string;
  tenderId: string | null;
  date: string | null;
  object: string | null;
  value: number | null;
  valueSource: "results" | "contracts" | null;
  winners: AwardHistoryWinner[];
  officialUrl: string | null;
};

export type AwardHistoryRange = { min: number; median: number; max: number; count: number };
export type AwardHistorySpread = { p25: number; median: number; p75: number; count: number };

export type AwardHistory = {
  tenderId: string;
  scope: "unit" | "organization";
  organizationName: string;
  purchasingUnit: string | null;
  windowMonths: number;
  since: string;
  criteria: {
    keywords: string[];
    categories: { slug: string; label: string }[];
    rule: string;
  };
  purchases: { total: number; last12Months: number; withResults: number };
  winners: { distinct: number; top: AwardHistoryWinner[] };
  prices: { purchaseValue: AwardHistoryRange | null; discountPercent: AwardHistorySpread | null };
  recent: AwardHistoryRecentPurchase[];
};

export type AwardHistoryInput = {
  tender: AwardHistoryTender;
  organizationName: string;
  keywords: string[];
  since: string;
  last12MonthsSince: string;
  purchases: HistoryPurchase[];
  results: HistoryResult[];
  classify: (text: string) => readonly string[];
  officialUrl: (controlNumber: string) => string | null;
};

const quantile = (sorted: readonly number[], q: number): number => {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const value = sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
  return Math.round(value * 100) / 100;
};

const sameUnit = (left: string | null, right: string | null) =>
  Boolean(left && right && normalizeText(left) === normalizeText(right));

const earliest = (dates: (string | null)[]): string | null =>
  dates.filter((date): date is string => Boolean(date)).sort()[0] ?? null;

const resultValue = (result: HistoryResult): number | null =>
  result.totalValue ?? (result.unitValue !== null && result.quantity !== null ? result.unitValue * result.quantity : null);

const sum = (values: (number | null)[]): number | null => {
  const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return present.length > 0 ? Math.round(present.reduce((total, value) => total + value, 0) * 100) / 100 : null;
};

const publicWinner = (supplier: ClassifiedSupplier, wins: number): AwardHistoryWinner => ({
  name: supplier.kind === "company" ? supplier.name : null,
  cnpj: supplier.kind === "company" ? supplier.cnpj : null,
  kind: supplier.kind,
  wins,
});

/** Groups natural persons, foreign and unidentified suppliers so no individual is singled out. */
const displayKey = (supplier: ClassifiedSupplier) => supplier.kind === "company" ? supplier.key : supplier.kind;

export function aggregateAwardHistory(input: AwardHistoryInput): AwardHistory {
  const { tender } = input;
  const relevantCategories = tender.categorySlugs.filter((slug) => slug !== "outros");
  const similar = input.purchases.filter((purchase) =>
    purchase.key !== tender.id &&
    purchaseSimilarity(input.keywords, relevantCategories, purchase, input.classify).similar);

  const resultsByPurchase = new Map<string, HistoryResult[]>();
  for (const result of input.results) {
    const list = resultsByPurchase.get(result.purchaseKey) ?? [];
    list.push(result);
    resultsByPurchase.set(result.purchaseKey, list);
  }

  type Built = {
    purchase: HistoryPurchase;
    date: string | null;
    results: HistoryResult[];
    winners: ClassifiedSupplier[];
    value: number | null;
    valueSource: "results" | "contracts" | null;
    unit: boolean;
  };
  const built = similar.map((purchase): Built => {
    const results = resultsByPurchase.get(purchase.key) ?? [];
    const suppliers = (results.length > 0 ? results.map(({ supplier }) => supplier) : purchase.contracts.map(({ supplier }) => supplier))
      .map(classifySupplier)
      .filter((supplier): supplier is ClassifiedSupplier => supplier !== null);
    const winners = [...new Map(suppliers.map((supplier) => [supplier.key, supplier])).values()];
    const resultsTotal = sum(results.map(resultValue));
    const contractsTotal = sum(purchase.contracts.map(({ value }) => value));
    return {
      purchase,
      date: earliest([...results.map(({ resultDate }) => resultDate), ...purchase.contracts.map(({ date }) => date)]),
      results,
      winners,
      value: resultsTotal ?? contractsTotal,
      valueSource: resultsTotal !== null ? "results" : contractsTotal !== null ? "contracts" : null,
      unit: purchase.contracts.some((contract) => sameUnit(contract.purchasingUnit, tender.purchasingUnit)),
    };
  }).filter(({ date }) => date === null || date >= input.since);

  const unitOnly = built.filter(({ unit }) => unit);
  const scope: AwardHistory["scope"] = unitOnly.length >= AWARD_HISTORY_UNIT_SCOPE_MIN ? "unit" : "organization";
  const scoped = (scope === "unit" ? unitOnly : built)
    .sort((left, right) => (right.date ?? "").localeCompare(left.date ?? "") || left.purchase.key.localeCompare(right.purchase.key));

  const wins = new Map<string, { supplier: ClassifiedSupplier; wins: number }>();
  const distinct = new Set<string>();
  for (const purchase of scoped) {
    const counted = new Set<string>();
    for (const supplier of purchase.winners) {
      distinct.add(supplier.key);
      const key = displayKey(supplier);
      if (counted.has(key)) continue;
      counted.add(key);
      const entry = wins.get(key) ?? { supplier, wins: 0 };
      entry.wins += 1;
      wins.set(key, entry);
    }
  }
  const top = [...wins.values()]
    .sort((left, right) => right.wins - left.wins ||
      (left.supplier.kind === "company" ? 0 : 1) - (right.supplier.kind === "company" ? 0 : 1) ||
      (left.supplier.name ?? "").localeCompare(right.supplier.name ?? "", "pt-BR"))
    .slice(0, AWARD_HISTORY_TOP_WINNERS)
    .map(({ supplier, wins: count }) => publicWinner(supplier, count));

  const values = scoped.map(({ value }) => value).filter((value): value is number => value !== null && value > 0).sort((a, b) => a - b);
  const discounts = scoped
    .flatMap(({ results }) => results.map(({ discountPercent }) => discountPercent))
    .filter((value): value is number => value !== null && Number.isFinite(value) && value > 0 && value <= 100)
    .sort((a, b) => a - b);

  const recent: AwardHistoryRecentPurchase[] = scoped.slice(0, AWARD_HISTORY_RECENT).map((purchase) => {
    const groups = new Map<string, ClassifiedSupplier>();
    for (const supplier of purchase.winners) if (!groups.has(displayKey(supplier))) groups.set(displayKey(supplier), supplier);
    return {
      purchasePncpControlNumber: purchase.purchase.controlNumber,
      tenderId: purchase.purchase.linkedTender?.id ?? null,
      date: purchase.date,
      object: purchase.purchase.contracts.find(({ object }) => object)?.object ?? purchase.purchase.linkedTender?.title ?? null,
      value: purchase.value,
      valueSource: purchase.valueSource,
      winners: [...groups.values()].map((supplier) => publicWinner(supplier, 1)),
      officialUrl: input.officialUrl(purchase.purchase.controlNumber),
    };
  });

  return {
    tenderId: tender.id,
    scope,
    organizationName: input.organizationName,
    purchasingUnit: scope === "unit" ? tender.purchasingUnit : null,
    windowMonths: AWARD_HISTORY_WINDOW_MONTHS,
    since: input.since,
    criteria: {
      keywords: input.keywords,
      categories: relevantCategories.map((slug) => ({ slug, label: categoryLabel(slug) ?? slug })),
      rule: AWARD_HISTORY_CRITERIA,
    },
    purchases: {
      total: scoped.length,
      last12Months: scoped.filter(({ date }) => date !== null && date >= input.last12MonthsSince).length,
      withResults: scoped.filter(({ results }) => results.length > 0).length,
    },
    winners: { distinct: distinct.size, top },
    prices: {
      purchaseValue: values.length > 0
        ? { min: values[0]!, median: quantile(values, 0.5), max: values[values.length - 1]!, count: values.length }
        : null,
      discountPercent: discounts.length > 0
        ? { p25: quantile(discounts, 0.25), median: quantile(discounts, 0.5), p75: quantile(discounts, 0.75), count: discounts.length }
        : null,
    },
    recent,
  };
}

/** Removes every company name and CNPJ; counts stay. */
export function lockWinnerNames(history: AwardHistory): AwardHistory {
  const lock = (winner: AwardHistoryWinner): AwardHistoryWinner => ({ ...winner, name: null, cnpj: null });
  return {
    ...history,
    winners: { ...history.winners, top: history.winners.top.map(lock) },
    recent: history.recent.map((purchase) => ({ ...purchase, winners: purchase.winners.map(lock) })),
  };
}

export const emptyAwardHistory = (
  tender: AwardHistoryTender,
  organizationName: string,
  keywords: string[],
  since: string,
): AwardHistory => ({
  tenderId: tender.id,
  scope: "organization",
  organizationName,
  purchasingUnit: null,
  windowMonths: AWARD_HISTORY_WINDOW_MONTHS,
  since,
  criteria: {
    keywords,
    categories: tender.categorySlugs.filter((slug) => slug !== "outros").map((slug) => ({ slug, label: categoryLabel(slug) ?? slug })),
    rule: AWARD_HISTORY_CRITERIA,
  },
  purchases: { total: 0, last12Months: 0, withResults: 0 },
  winners: { distinct: 0, top: [] },
  prices: { purchaseValue: null, discountPercent: null },
  recent: [],
});
