import { and, asc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, pool, tendersTable } from "@workspace/db";
import { normalizeText } from "../src/domain/normalize";
import {
  DISPLAY_TITLE_RULES_VERSION,
  normalizeTenderTitle,
} from "../src/ingest/title-normalizer";

type Options = {
  dryRun: boolean;
  batch: number;
  limit: number;
  cursor: string;
};

const positiveInteger = (value: string | undefined, name: string): number => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
};

export const parseBackfillOptions = (argv: string[]): Options => {
  const args = argv.filter((arg) => arg !== "--");
  const valueAfter = (flag: string): string | undefined => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return {
    dryRun: args.includes("--dry-run"),
    batch: valueAfter("--batch") ? positiveInteger(valueAfter("--batch"), "--batch") : 1_000,
    limit: valueAfter("--limit") ? positiveInteger(valueAfter("--limit"), "--limit") : Number.MAX_SAFE_INTEGER,
    cursor: valueAfter("--cursor") ?? "",
  };
};

const searchableText = (row: {
  titleNorm: string;
  objectNorm: string;
  itemsNorm: string;
  organizationNorm: string;
  otherNorm: string;
  categories: { label: string }[];
}, displayTitleNorm: string): string =>
  [
    displayTitleNorm,
    row.titleNorm,
    row.objectNorm,
    row.itemsNorm,
    row.organizationNorm,
    row.otherNorm,
    normalizeText(row.categories.map(({ label }) => label).join(" ")),
  ].filter(Boolean).join(" ");

export const runDisplayTitleBackfill = async (options: Options): Promise<{
  processed: number;
  needsModel: number;
  ignoredModel: number;
  lastCursor: string;
}> => {
  const [modelCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tendersTable)
    .where(eq(tendersTable.displayTitleSource, "model"));
  let processed = 0;
  let needsModel = 0;
  let cursor = options.cursor;

  while (processed < options.limit) {
    const batchSize = Math.min(options.batch, options.limit - processed);
    const rows = await db
      .select({
        id: tendersTable.id,
        title: tendersTable.title,
        titleNorm: tendersTable.titleNorm,
        objectNorm: tendersTable.objectNorm,
        itemsNorm: tendersTable.itemsNorm,
        organizationNorm: tendersTable.organizationNorm,
        otherNorm: tendersTable.otherNorm,
        categories: tendersTable.categories,
      })
      .from(tendersTable)
      .where(and(
        cursor ? gt(tendersTable.id, cursor) : undefined,
        or(
          isNull(tendersTable.displayTitleSource),
          and(
            eq(tendersTable.displayTitleSource, "rules"),
            or(
              isNull(tendersTable.displayTitleVersion),
              lt(tendersTable.displayTitleVersion, DISPLAY_TITLE_RULES_VERSION),
            ),
          ),
        ),
      ))
      .orderBy(asc(tendersTable.id))
      .limit(batchSize);
    if (rows.length === 0) break;

    for (const row of rows) {
      const normalized = normalizeTenderTitle(row.title);
      const displayTitleNorm = normalizeText(normalized.title);
      if (!options.dryRun) {
        await db
          .update(tendersTable)
          .set({
            displayTitle: normalized.title,
            displayTitleSource: "rules",
            displayTitleVersion: DISPLAY_TITLE_RULES_VERSION,
            displayTitleNorm,
            displayTitleNeedsModel: normalized.needsModel,
            searchText: searchableText(row, displayTitleNorm),
          })
          .where(and(
            eq(tendersTable.id, row.id),
            or(isNull(tendersTable.displayTitleSource), eq(tendersTable.displayTitleSource, "rules")),
          ));
      }
      processed += 1;
      if (normalized.needsModel) needsModel += 1;
      cursor = row.id;
    }
  }

  return {
    processed,
    needsModel,
    ignoredModel: Number(modelCount?.count ?? 0),
    lastCursor: cursor,
  };
};

const options = parseBackfillOptions(process.argv.slice(2));
try {
  const result = await runDisplayTitleBackfill(options);
  process.stdout.write([
    `display-title backfill${options.dryRun ? " (dry-run)" : ""}`,
    `processed=${result.processed}`,
    `needsModel=${result.needsModel}`,
    `ignoredModel=${result.ignoredModel}`,
    `lastCursor=${result.lastCursor || "-"}`,
  ].join(" ") + "\n");
} finally {
  await pool.end();
}
