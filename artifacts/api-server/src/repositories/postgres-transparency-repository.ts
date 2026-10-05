import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, ingestRunsTable, pncpContractsTable, pncpItemResultsTable, tendersTable } from "@workspace/db";
import { normalizeText, queryTokens } from "../domain/normalize";
import { publicSupplierIdentifier } from "../ingest/pncp-transparency-map";
import type { TransparencyCriteria } from "../lib/transparency-query";
import { onOrAfterSaoPauloDate, onOrBeforeSaoPauloDate } from "./postgres-date-filter";

type ContractRow = typeof pncpContractsTable.$inferSelect;
type ResultRow = typeof pncpItemResultsTable.$inferSelect;

const numberOrNull = (value: string | null): number | null => value === null ? null : Number(value);
const isoOrNull = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();
const supplier = (type: string | null, identifier: string | null, name: string | null) =>
  !type && !name ? null : {
    type: type === "PJ" ? "CNPJ" : type === "PF" ? "CPF" : type,
    name,
    identifier: publicSupplierIdentifier(type, identifier),
  };

export const transparencyMeta = {
  coverage: "Contratos publicados ou atualizados no PNCP nas janelas já coletadas; resultados de itens das compras vinculadas já verificadas. Ausência de registro não comprova ausência na fonte.",
  valueSemantics: {
    contractValues: "Valores publicados no contrato ou empenho; não representam pagamento.",
    resultValues: "Valores homologados por item, quando publicados; não representam contrato nem pagamento.",
    paymentValues: "O PNCP consultado aqui não informa pagamentos efetivos.",
  },
};

export const contractDto = (row: ContractRow, tenderId: string | null) => ({
  id: row.id,
  pncpControlNumber: row.pncpControlNumber,
  purchasePncpControlNumber: row.purchasePncpControlNumber,
  tenderId,
  contractNumber: row.contractNumber,
  organizationName: row.organizationName,
  location: { state: row.state, city: row.city },
  supplier: supplier(row.supplierType, row.supplierIdentifier, row.supplierName),
  object: row.object,
  values: {
    initial: numberOrNull(row.initialValue),
    global: numberOrNull(row.globalValue),
    accumulated: numberOrNull(row.accumulatedValue),
    installment: numberOrNull(row.installmentValue),
  },
  dates: {
    signature: row.signatureDate,
    validFrom: row.validFrom,
    validTo: row.validTo,
    publishedAt: isoOrNull(row.publishedAt),
    updatedAt: isoOrNull(row.sourceUpdatedAt),
  },
  officialUrl: row.officialUrl,
  provenance: { source: "PNCP" as const, fetchedAt: row.fetchedAt.toISOString() },
});

export const resultDto = (row: ResultRow, tenderId: string | null) => ({
  id: row.id,
  purchasePncpControlNumber: row.purchasePncpControlNumber,
  tenderId,
  itemNumber: row.itemNumber,
  resultSequence: row.resultSequence,
  status: {
    id: row.statusId,
    name: row.statusName,
    active: row.isActive,
    cancelledAt: isoOrNull(row.cancelledAt),
    cancelReason: row.cancelReason,
  },
  supplier: supplier(row.supplierType, row.supplierIdentifier, row.supplierName),
  values: {
    quantityHomologated: numberOrNull(row.quantityHomologated),
    unitValueHomologated: numberOrNull(row.unitValueHomologated),
    totalValueHomologated: numberOrNull(row.totalValueHomologated),
    discountPercent: numberOrNull(row.discountPercent),
  },
  resultDate: row.resultDate,
  officialUrl: row.officialUrl,
  provenance: { source: "PNCP" as const, fetchedAt: row.fetchedAt.toISOString() },
});

const escapedLike = (token: string) => `%${token.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
const contractValue = sql`coalesce(${pncpContractsTable.globalValue}, ${pncpContractsTable.initialValue})`;

function contractWhere(criteria: TransparencyCriteria): SQL | undefined {
  const filters: SQL[] = [];
  for (const token of queryTokens(criteria.query ?? "")) {
    filters.push(sql`${pncpContractsTable.searchText} like ${escapedLike(normalizeText(token))} escape '\\'`);
  }
  if (criteria.state) filters.push(eq(pncpContractsTable.state, criteria.state));
  if (criteria.publishedFrom) filters.push(onOrAfterSaoPauloDate(pncpContractsTable.publishedAt, criteria.publishedFrom));
  if (criteria.publishedTo) filters.push(onOrBeforeSaoPauloDate(pncpContractsTable.publishedAt, criteria.publishedTo));
  if (criteria.valueMin !== undefined) filters.push(sql`${contractValue} >= ${criteria.valueMin}`);
  if (criteria.valueMax !== undefined) filters.push(sql`${contractValue} <= ${criteria.valueMax}`);
  return filters.length > 0 ? and(...filters) : undefined;
}

const contractOrder = (sort: TransparencyCriteria["sort"]): SQL => {
  if (sort === "published_asc") return sql`${pncpContractsTable.publishedAt} asc nulls last, ${pncpContractsTable.id} asc`;
  if (sort === "value_desc") return sql`${contractValue} desc nulls last, ${pncpContractsTable.id} asc`;
  if (sort === "value_asc") return sql`${contractValue} asc nulls last, ${pncpContractsTable.id} asc`;
  return sql`${pncpContractsTable.publishedAt} desc nulls last, ${pncpContractsTable.id} asc`;
};

export async function searchTransparencyContracts(criteria: TransparencyCriteria) {
  const where = contractWhere(criteria);
  const [count] = await db.select({ total: sql<number>`count(*)::int` }).from(pncpContractsTable).where(where);
  const rows = await db.select({ contract: pncpContractsTable, tenderId: tendersTable.id })
    .from(pncpContractsTable)
    .leftJoin(tendersTable, eq(tendersTable.id, pncpContractsTable.purchaseTenderKey))
    .where(where)
    .orderBy(contractOrder(criteria.sort))
    .limit(criteria.pageSize)
    .offset((criteria.page - 1) * criteria.pageSize);
  const [latest] = await db.select({ at: sql<string | null>`max(${ingestRunsTable.finishedAt})` })
    .from(ingestRunsTable)
    .where(and(eq(ingestRunsTable.source, "pncp-transparency"), eq(ingestRunsTable.status, "complete")));
  const total = Number(count?.total ?? 0);
  return {
    data: rows.map(({ contract, tenderId }) => contractDto(contract, tenderId)),
    pagination: { page: criteria.page, pageSize: criteria.pageSize, total, totalPages: Math.ceil(total / criteria.pageSize), totalIsEstimate: false },
    meta: { ...transparencyMeta, indexUpdatedAt: isoOrNull(latest?.at ?? null) },
  };
}

export async function tenderTransparency(tenderId: string) {
  const [tender] = await db.select({ id: tendersTable.id }).from(tendersTable).where(eq(tendersTable.id, tenderId)).limit(1);
  if (!tender) return null;
  const [contracts, results] = await Promise.all([
    db.select().from(pncpContractsTable).where(eq(pncpContractsTable.purchaseTenderKey, tenderId)).orderBy(desc(pncpContractsTable.publishedAt), asc(pncpContractsTable.id)),
    db.select().from(pncpItemResultsTable).where(eq(pncpItemResultsTable.purchaseTenderKey, tenderId)).orderBy(asc(pncpItemResultsTable.itemNumber), asc(pncpItemResultsTable.resultSequence)),
  ]);
  return {
    contracts: contracts.map((row) => contractDto(row, tenderId)),
    results: results.map((row) => resultDto(row, tenderId)),
    meta: transparencyMeta,
  };
}
