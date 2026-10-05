import { getTableColumns, inArray, sql } from "drizzle-orm";
import {
  db,
  pncpContractsTable,
  pncpItemResultsTable,
  tendersTable,
} from "@workspace/db";
import {
  mapPncpContract,
  mapPncpItemResult,
  type PncpContractDraft,
  type PncpItemResultDraft,
} from "./pncp-transparency-map";
import type { PncpIdentity } from "./pncp-map";

type ContractRow = typeof pncpContractsTable.$inferInsert;
type ItemResultRow = typeof pncpItemResultsTable.$inferInsert;

const excludedColumns = (table: typeof pncpContractsTable | typeof pncpItemResultsTable, omit: string[]) =>
  Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([key]) => !omit.includes(key))
      .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]),
  );

const existingTenderKeys = async (keys: string[]): Promise<Set<string>> => {
  const unique = Array.from(new Set(keys));
  if (unique.length === 0) return new Set();
  const rows = await db
    .select({ id: tendersTable.id })
    .from(tendersTable)
    .where(inArray(tendersTable.id, unique));
  return new Set(rows.map((row) => row.id));
};

const attachTender = <T extends PncpContractDraft | PncpItemResultDraft>(
  draft: T,
  existing: Set<string>,
): T => ({
  ...draft,
  tenderId: existing.has(draft.purchaseTenderKey) ? draft.purchaseTenderKey : null,
});

export async function upsertPncpContracts(
  records: Record<string, unknown>[],
  fetchedAt: Date,
): Promise<number> {
  const mapped = records.map((record) => mapPncpContract(record, fetchedAt));
  const byControl = new Map(mapped.map((draft) => [draft.pncpControlNumber, draft]));
  const rows = Array.from(byControl.values());
  if (rows.length === 0) return 0;

  const existing = await existingTenderKeys(rows.map((row) => row.purchaseTenderKey));
  const values: ContractRow[] = rows.map((row) => attachTender(row, existing));

  const stored = await db
    .insert(pncpContractsTable)
    .values(values)
    .onConflictDoUpdate({
      target: pncpContractsTable.pncpControlNumber,
      set: excludedColumns(pncpContractsTable, ["id", "createdAt", "pncpControlNumber", "resultsCheckedAt"]),
    })
    .returning({ id: pncpContractsTable.id });

  return stored.length;
}

export async function upsertPncpItemResults(
  input: {
    records: Record<string, unknown>[];
    purchasePncpControlNumber: string;
    identity: PncpIdentity;
    itemNumber: number;
    fetchedAt: Date;
  },
): Promise<number> {
  const mapped = input.records.map((record) =>
    mapPncpItemResult(
      {
        record,
        purchasePncpControlNumber: input.purchasePncpControlNumber,
        identity: input.identity,
        itemNumber: input.itemNumber,
      },
      input.fetchedAt,
    ),
  );
  const byKey = new Map(mapped.map((draft) => [draft.id, draft]));
  const rows = Array.from(byKey.values());
  if (rows.length === 0) return 0;

  const existing = await existingTenderKeys(rows.map((row) => row.purchaseTenderKey));
  const values: ItemResultRow[] = rows.map((row) => attachTender(row, existing));

  const stored = await db
    .insert(pncpItemResultsTable)
    .values(values)
    .onConflictDoUpdate({
      target: [
        pncpItemResultsTable.purchasePncpControlNumber,
        pncpItemResultsTable.itemNumber,
        pncpItemResultsTable.resultSequence,
      ],
      set: excludedColumns(pncpItemResultsTable, ["id", "createdAt"]),
    })
    .returning({ id: pncpItemResultsTable.id });

  return stored.length;
}
