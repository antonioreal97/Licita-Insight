-- Covers `GET /api/v1/public/tenders/by-state`: open tenders grouped by state, read from the index alone.
-- Partial (open rows only), so it stays small. A plain CREATE INDEX holds a SHARE lock on `tenders` while it
-- builds: reads continue, writes (the PNCP collection) wait. To avoid that wait in production, create it first
-- with CREATE INDEX CONCURRENTLY under the same name; IF NOT EXISTS then turns this statement into a no-op.
CREATE INDEX IF NOT EXISTS "tenders_open_by_state_idx"
  ON "tenders" ("state", "estimated_value", "fetched_at")
  WHERE "status" = 'open';
