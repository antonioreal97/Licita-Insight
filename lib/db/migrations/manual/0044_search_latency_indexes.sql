-- Production variant of ../0044_search_latency_indexes.sql (docs/migrations/0044-search-latency-indexes.md).
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction: run this file with psql WITHOUT -1/--single-transaction.
-- Writes keep flowing while each index builds. A build that fails leaves an INVALID index behind: drop it
-- (DROP INDEX CONCURRENTLY <name>) and run the file again; IF NOT EXISTS skips the ones already built.
SET lock_timeout = '5s';
SET statement_timeout = 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tenders_open_published_at_idx"
  ON "tenders" ("published_at" DESC NULLS LAST, "id")
  WHERE "status" = 'open';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tenders_open_deadline_idx"
  ON "tenders" ("proposal_deadline" ASC NULLS LAST, "id")
  WHERE "status" = 'open';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tenders_upper_state_status_idx"
  ON "tenders" (upper("state"), "status", "state");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tenders_modality_status_idx"
  ON "tenders" ("modality", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "tenders_platform_status_idx"
  ON "tenders" ("platform", "status");

ANALYZE "tenders";
