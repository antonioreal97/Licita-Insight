import { pool } from "@workspace/db";
import { backfillTenderPlatformBatch } from "../src/ingest/platform-backfill";

const rawBatch = Number(process.env.PLATFORM_BACKFILL_BATCH_SIZE ?? 1_000);
if (!Number.isSafeInteger(rawBatch) || rawBatch < 1 || rawBatch > 5_000) {
  throw new Error("PLATFORM_BACKFILL_BATCH_SIZE must be an integer between 1 and 5000");
}

let afterId: string | null = null;
let scanned = 0;
let updated = 0;

try {
  for (;;) {
    const result = await backfillTenderPlatformBatch({ afterId, batch: rawBatch });
    scanned += result.scanned;
    updated += result.updated;
    if (!result.nextCursor) break;
    afterId = result.nextCursor;
  }
  console.log(JSON.stringify({ scanned, updated }, null, 2));
} finally {
  await pool.end();
}
