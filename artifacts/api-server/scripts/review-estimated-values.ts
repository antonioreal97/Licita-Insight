import { pool } from "@workspace/db";
import { estimatedValueReviewBatchSize, reviewEstimatedValues } from "../src/ingest/estimated-value-review";

try {
  const result = await reviewEstimatedValues({ batch: estimatedValueReviewBatchSize(), pauseMs: 0 });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
