-- Search latency (docs/migrations/0044-search-latency-indexes.md). Additive only: five btree indexes on `tenders`.
-- A plain CREATE INDEX holds a SHARE lock on `tenders` while it builds: reads continue, writes (the PNCP collection)
-- wait. Production creates them first with CREATE INDEX CONCURRENTLY (manual/0044_search_latency_indexes.sql) under
-- the same names; IF NOT EXISTS then turns these statements into no-ops.

-- First page of open tenders in the default (publication) and deadline orders, without sorting every open row.
CREATE INDEX IF NOT EXISTS "tenders_open_published_at_idx"
  ON "tenders" ("published_at" DESC NULLS LAST, "id")
  WHERE "status" = 'open';

CREATE INDEX IF NOT EXISTS "tenders_open_deadline_idx"
  ON "tenders" ("proposal_deadline" ASC NULLS LAST, "id")
  WHERE "status" = 'open';

-- Status facet with a state, modality or platform filter: counts every status from the index alone. An expression
-- index only serves index-only scans when it also holds the column itself, hence the trailing "state".
CREATE INDEX IF NOT EXISTS "tenders_upper_state_status_idx"
  ON "tenders" (upper("state"), "status", "state");

CREATE INDEX IF NOT EXISTS "tenders_modality_status_idx"
  ON "tenders" ("modality", "status");

CREATE INDEX IF NOT EXISTS "tenders_platform_status_idx"
  ON "tenders" ("platform", "status");
