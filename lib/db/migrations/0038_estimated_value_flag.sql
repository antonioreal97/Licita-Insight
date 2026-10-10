-- Additive only: the official `estimated_value` is never changed. `estimated_value_flag` stays NULL (no doubt
-- raised) until the ingest or the API's `tender_estimated_value_review` job judges the value implausible.
-- ADD COLUMN without a default is a catalog-only change: no table rewrite, only a brief lock.
ALTER TABLE "tenders" ADD COLUMN IF NOT EXISTS "estimated_value_flag" text;

-- The only rows a plausibility rule can flag (>= R$ 100 million), so the daily review reads a handful of rows.
CREATE INDEX IF NOT EXISTS "tenders_estimated_value_review_idx"
  ON "tenders" ("id")
  WHERE "estimated_value" >= 100000000;

-- Replaces `tenders_open_by_state_idx`: the same covering index for `GET /api/v1/public/tenders/by-state`, plus
-- the flag, so the sum of the unflagged values is still read from the index alone.
CREATE INDEX IF NOT EXISTS "tenders_open_by_state_value_idx"
  ON "tenders" ("state", "estimated_value", "fetched_at", "estimated_value_flag")
  WHERE "status" = 'open';

DROP INDEX IF EXISTS "tenders_open_by_state_idx";

-- A plain CREATE INDEX holds a SHARE lock on `tenders` while it builds: reads continue, writes (the PNCP
-- collection) wait. To avoid that wait in production, run the ADD COLUMN above by hand and then create both
-- indexes with CREATE INDEX CONCURRENTLY under the same names; IF NOT EXISTS turns these statements into no-ops.
