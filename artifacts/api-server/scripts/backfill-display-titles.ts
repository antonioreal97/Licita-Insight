import { pool } from "@workspace/db";
import {
  parseBackfillOptions,
  runDisplayTitleBackfill,
} from "../src/ingest/display-title-backfill";

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
