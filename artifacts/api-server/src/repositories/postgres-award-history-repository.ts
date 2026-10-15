import { and, eq, gte, inArray, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db, pncpContractsTable, pncpItemResultsTable, tendersTable } from "@workspace/db";
import {
  aggregateAwardHistory,
  AWARD_HISTORY_WINDOW_MONTHS,
  emptyAwardHistory,
  tenderKeywords,
  type AwardHistory,
  type AwardHistoryTender,
  type HistoryContract,
  type HistoryPurchase,
} from "../domain/award-history";
import { parseControlNumber, pncpPublicationUrl } from "../ingest/pncp-map";
import { categorySlugsFromOfficialTitle } from "../titles/category-rules";
import { transparencyMeta } from "./postgres-transparency-repository";

/** Contract rows read per request; a very large organization only keeps its most recent matches. */
const MAX_CONTRACT_ROWS = 3_000;
/** Purchases checked for similarity per request (most recent first). */
const MAX_PURCHASES = 300;
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 500;

const numberOrNull = (value: string | null): number | null => value === null ? null : Number(value);
const escapedLike = (token: string) => `%${token.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

const saoPauloDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

/** Calendar date `months` before `date` in São Paulo, clamped to the month length (31/03 − 1 month → 28/02 or 29/02). */
export const monthsBefore = (date: Date, months: number): string => {
  const [year, month, day] = saoPauloDate(date).split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0)).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted.toISOString().slice(0, 10);
};

/**
 * Every purchase key starts with the buying organization's 14-digit CNPJ (`<cnpj>-1-<seq>-<year>`). Digits sort
 * the same way in any collation, so `[cnpj, cnpj + 1)` is a range scan on the existing
 * `*_purchase_tender_key_idx` btree indexes — no index on `cnpj` is needed. The `like` re-check keeps the result
 * exact even for a key in an unexpected format.
 */
export function purchaseKeyRange(column: typeof pncpContractsTable.purchaseTenderKey | typeof pncpItemResultsTable.purchaseTenderKey, cnpj: string): SQL {
  const next = (BigInt(cnpj) + 1n).toString().padStart(14, "0");
  const filters = [gte(column, cnpj), sql`${column} like ${`${cnpj}-%`}`];
  if (next.length === 14) filters.push(lt(column, next));
  return and(...filters)!;
}

const classify = (text: string) => categorySlugsFromOfficialTitle(text);
const officialUrl = (controlNumber: string) => {
  const identity = parseControlNumber(controlNumber);
  return identity ? pncpPublicationUrl(identity) : null;
};

const cache = new Map<string, { at: number; history: AwardHistory | null }>();

export const clearAwardHistoryCache = () => cache.clear();

async function loadTender(tenderId: string) {
  const [row] = await db.select({
    id: tendersTable.id,
    pncpControlNumber: tendersTable.pncpControlNumber,
    title: tendersTable.title,
    displayTitle: tendersTable.displayTitle,
    objectSummary: tendersTable.objectSummary,
    organizationName: tendersTable.organizationName,
    purchasingUnit: tendersTable.purchasingUnit,
    categories: tendersTable.categories,
    items: tendersTable.items,
  }).from(tendersTable).where(eq(tendersTable.id, tenderId)).limit(1);
  return row ?? null;
}

async function buildAwardHistory(tenderId: string, now: Date): Promise<AwardHistory | null> {
  const row = await loadTender(tenderId);
  if (!row) return null;
  const tender: AwardHistoryTender = {
    id: row.id,
    title: row.title,
    objectSummary: row.objectSummary,
    itemDescriptions: row.items.map(({ description }) => description),
    categorySlugs: row.categories.map(({ slug }) => slug),
    purchasingUnit: row.purchasingUnit,
  };
  const keywords = tenderKeywords(tender);
  const since = monthsBefore(now, AWARD_HISTORY_WINDOW_MONTHS);
  const cnpj = parseControlNumber(row.pncpControlNumber)?.cnpj;
  if (!cnpj || !/^\d{14}$/.test(cnpj) || keywords.length === 0) {
    return emptyAwardHistory(tender, row.organizationName, keywords, since);
  }

  const contractDate = sql<string | null>`coalesce(${pncpContractsTable.signatureDate}, (${pncpContractsTable.publishedAt} at time zone 'America/Sao_Paulo')::date)`;
  const contractRows = await db.select({
    purchaseKey: pncpContractsTable.purchaseTenderKey,
    purchaseControlNumber: pncpContractsTable.purchasePncpControlNumber,
    object: pncpContractsTable.object,
    purchasingUnit: pncpContractsTable.purchasingUnit,
    supplierType: pncpContractsTable.supplierType,
    supplierIdentifier: pncpContractsTable.supplierIdentifier,
    supplierName: pncpContractsTable.supplierName,
    value: sql<string | null>`coalesce(${pncpContractsTable.globalValue}, ${pncpContractsTable.initialValue})`,
    date: sql<string | null>`${contractDate}::text`,
  })
    .from(pncpContractsTable)
    .where(and(
      purchaseKeyRange(pncpContractsTable.purchaseTenderKey, cnpj),
      ne(pncpContractsTable.purchaseTenderKey, tender.id),
      sql`${contractDate} >= ${since}::date`,
      or(...keywords.map((keyword) => sql`${pncpContractsTable.searchText} like ${escapedLike(keyword)} escape '\\'`)),
    ))
    .orderBy(sql`${contractDate} desc nulls last`, pncpContractsTable.id)
    .limit(MAX_CONTRACT_ROWS);

  const purchases = new Map<string, HistoryPurchase>();
  for (const contract of contractRows) {
    const entry: HistoryContract = {
      purchaseKey: contract.purchaseKey,
      purchaseControlNumber: contract.purchaseControlNumber,
      object: contract.object,
      purchasingUnit: contract.purchasingUnit,
      supplier: { type: contract.supplierType, identifier: contract.supplierIdentifier, name: contract.supplierName },
      value: numberOrNull(contract.value),
      date: contract.date,
    };
    const purchase = purchases.get(contract.purchaseKey);
    if (purchase) purchase.contracts.push(entry);
    else if (purchases.size < MAX_PURCHASES) {
      purchases.set(contract.purchaseKey, { key: contract.purchaseKey, controlNumber: contract.purchaseControlNumber, contracts: [entry], linkedTender: null });
    }
  }
  const keys = [...purchases.keys()];
  if (keys.length === 0) return emptyAwardHistory(tender, row.organizationName, keywords, since);

  const [linked, results] = await Promise.all([
    db.select({
      id: tendersTable.id,
      title: tendersTable.title,
      objectSummary: tendersTable.objectSummary,
      items: tendersTable.items,
      categories: tendersTable.categories,
    }).from(tendersTable).where(inArray(tendersTable.id, keys)),
    db.select({
      purchaseKey: pncpItemResultsTable.purchaseTenderKey,
      supplierType: pncpItemResultsTable.supplierType,
      supplierIdentifier: pncpItemResultsTable.supplierIdentifier,
      supplierName: pncpItemResultsTable.supplierName,
      totalValue: pncpItemResultsTable.totalValueHomologated,
      unitValue: pncpItemResultsTable.unitValueHomologated,
      quantity: pncpItemResultsTable.quantityHomologated,
      discountPercent: pncpItemResultsTable.discountPercent,
      resultDate: sql<string | null>`${pncpItemResultsTable.resultDate}::text`,
    })
      .from(pncpItemResultsTable)
      .where(and(inArray(pncpItemResultsTable.purchaseTenderKey, keys), eq(pncpItemResultsTable.isActive, true))),
  ]);
  for (const tenderRow of linked) {
    const purchase = purchases.get(tenderRow.id);
    if (!purchase) continue;
    purchase.linkedTender = {
      id: tenderRow.id,
      title: tenderRow.title,
      objectSummary: tenderRow.objectSummary,
      itemDescriptions: tenderRow.items.map(({ description }) => description),
      categorySlugs: tenderRow.categories.map(({ slug }) => slug),
    };
  }

  return aggregateAwardHistory({
    tender,
    organizationName: row.organizationName,
    keywords,
    since,
    last12MonthsSince: monthsBefore(now, 12),
    purchases: [...purchases.values()],
    results: results.map((result) => ({
      purchaseKey: result.purchaseKey,
      supplier: { type: result.supplierType, identifier: result.supplierIdentifier, name: result.supplierName },
      totalValue: numberOrNull(result.totalValue),
      unitValue: numberOrNull(result.unitValue),
      quantity: numberOrNull(result.quantity),
      discountPercent: numberOrNull(result.discountPercent),
      resultDate: result.resultDate,
    })),
    classify,
    officialUrl,
  });
}

/** Null when the tender does not exist. Cached in memory per process for 10 minutes. */
export async function tenderAwardHistory(tenderId: string, now = new Date()): Promise<AwardHistory | null> {
  const cached = cache.get(tenderId);
  if (cached && now.getTime() - cached.at < CACHE_TTL_MS) return cached.history;
  const history = await buildAwardHistory(tenderId, now);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(tenderId, { at: now.getTime(), history });
  return history;
}

export const awardHistoryMeta = {
  coverage: transparencyMeta.coverage,
  valueSemantics:
    "Valor por compra: soma dos valores homologados dos itens; sem resultado publicado, soma dos contratos. Desconto: percentual homologado informado pelo PNCP por item, só quando maior que zero.",
};
