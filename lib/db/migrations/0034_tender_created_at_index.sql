-- `created_at` is the first insertion time: PNCP upserts never update it.
-- A plain btree is sufficient for the rolling "new tenders" cutoff and ordering.
CREATE INDEX "tenders_created_at_idx" ON "tenders" ("created_at");
