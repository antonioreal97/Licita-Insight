-- Users remove ("limpar") notifications with a soft delete. Additive: the app before this change ignores the column.
-- The row stays so the unique (user_id, dedupe_key) index keeps blocking producers from re-creating it; the 90-day
-- notification purge and the read-notification retention still delete it like any other row.
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "dismissed_at" timestamptz;

-- The unread badge counts only notifications still in the feed. Until the new API is deployed, the old unread
-- count (no dismissed_at predicate) falls back to notifications_user_created_at_idx, still scoped by user.
DROP INDEX IF EXISTS "notifications_user_unread_idx";
CREATE INDEX IF NOT EXISTS "notifications_user_unread_idx"
  ON "notifications" USING btree ("user_id", "created_at")
  WHERE "read_at" IS NULL AND "dismissed_at" IS NULL;
