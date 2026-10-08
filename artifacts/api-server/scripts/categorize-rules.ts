import { pool } from "@workspace/db";
import { categorizeTenderRulesBatch } from "../src/titles/rule-categorization";

const rawBatch = Number(process.env.TITLE_RULES_BACKFILL_BATCH_SIZE ?? 500);
if (!Number.isSafeInteger(rawBatch) || rawBatch < 1 || rawBatch > 5_000) {
  throw new Error("TITLE_RULES_BACKFILL_BATCH_SIZE must be an integer between 1 and 5000");
}

let afterId: string | null = null;
let scanned = 0;
let categorized = 0;

try {
  for (;;) {
    const result = await categorizeTenderRulesBatch({ afterId, batch: rawBatch });
    scanned += result.scanned;
    categorized += result.categorized;
    if (!result.nextCursor) break;
    afterId = result.nextCursor;
  }
  const coverage = scanned === 0 ? 0 : categorized / scanned;
  console.log(JSON.stringify({ scanned, categorized, coverage }, null, 2));
} finally {
  await pool.end();
}
