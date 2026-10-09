import { pool } from "@workspace/db";
import { backfillTenderPlatforms, platformBackfillBatchSize } from "../src/ingest/platform-backfill";

try {
  const result = await backfillTenderPlatforms({ batch: platformBackfillBatchSize(), pauseMs: 0 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
