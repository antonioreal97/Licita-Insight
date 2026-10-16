-- Production variant of ../0048_workspace_scope_expand.sql: same columns, foreign keys and indexes, built without
-- blocking writes. NOT a Drizzle migration (absent from the journal) and NOT transactional: CREATE INDEX
-- CONCURRENTLY refuses to run inside a transaction block, so run it with `psql -v ON_ERROR_STOP=1` and never with
-- `-1`/`--single-transaction`. Every statement is idempotent, so a rerun after a failure is safe; an index left
-- INVALID by a failed CONCURRENTLY build must be dropped before the rerun (see the procedure).
-- Procedure: docs/migrations/0048-workspace-scope-expand.md. The `statement-breakpoint` lines are plain comments
-- for psql; the parity test uses them to run one statement at a time.

-- Fail fast instead of queueing every request behind a long transaction on these tables.
SET lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "company_tender_fits" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "saved_tenders" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "saved_searches" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "email_delivery_notifications" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "recommendation_dismissals" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "recommendation_interest_profiles" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "user_recommendations" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD COLUMN IF NOT EXISTS "workspace_id" text;
--> statement-breakpoint
-- NOT VALID skips the scan, so each table is locked only for the catalog change. VALIDATE below scans without
-- blocking reads or writes. The resulting constraint is identical to the one created by the versioned file.
DO $w2$
DECLARE
  target_table text;
  fk_name text;
  delete_action text;
BEGIN
  FOR target_table, fk_name, delete_action IN
    SELECT * FROM (VALUES
      ('company_tender_fits', 'company_tender_fits_workspace_id_workspaces_id_fk', 'cascade'),
      ('saved_tenders', 'saved_tenders_workspace_id_workspaces_id_fk', 'cascade'),
      ('saved_searches', 'saved_searches_workspace_id_workspaces_id_fk', 'cascade'),
      ('notifications', 'notifications_workspace_id_workspaces_id_fk', 'cascade'),
      ('email_deliveries', 'email_deliveries_workspace_id_workspaces_id_fk', 'set null'),
      ('email_delivery_notifications', 'email_delivery_notifications_workspace_id_workspaces_id_fk', 'cascade'),
      ('recommendation_events', 'recommendation_events_workspace_id_workspaces_id_fk', 'cascade'),
      ('recommendation_dismissals', 'recommendation_dismissals_workspace_id_workspaces_id_fk', 'cascade'),
      ('recommendation_interest_profiles', 'recommendation_interest_profiles_workspace_id_workspaces_id_fk', 'cascade'),
      ('user_recommendations', 'user_recommendations_workspace_id_workspaces_id_fk', 'cascade'),
      ('ai_jobs', 'ai_jobs_workspace_id_workspaces_id_fk', 'set null')
    ) AS entries(table_name, constraint_name, on_delete)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = format('%I', target_table)::regclass AND conname = fk_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE %s NOT VALID',
        target_table, fk_name, delete_action
      );
    END IF;
  END LOOP;
END
$w2$;
--> statement-breakpoint
ALTER TABLE "company_tender_fits" VALIDATE CONSTRAINT "company_tender_fits_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "saved_tenders" VALIDATE CONSTRAINT "saved_tenders_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "saved_searches" VALIDATE CONSTRAINT "saved_searches_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "email_deliveries" VALIDATE CONSTRAINT "email_deliveries_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "email_delivery_notifications" VALIDATE CONSTRAINT "email_delivery_notifications_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "recommendation_events" VALIDATE CONSTRAINT "recommendation_events_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "recommendation_dismissals" VALIDATE CONSTRAINT "recommendation_dismissals_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "recommendation_interest_profiles" VALIDATE CONSTRAINT "recommendation_interest_profiles_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "user_recommendations" VALIDATE CONSTRAINT "user_recommendations_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_jobs" VALIDATE CONSTRAINT "ai_jobs_workspace_id_workspaces_id_fk";
--> statement-breakpoint
-- CONCURRENTLY waits for older transactions to finish; a lock timeout here would leave an INVALID index behind.
RESET lock_timeout;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "company_tender_fits_workspace_idx"
  ON "company_tender_fits" ("workspace_id", "checked_at");
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "company_tender_fits_workspace_cache_uidx"
  ON "company_tender_fits" ("workspace_id", "profile_version", "tender_id", "requested_model", "prompt_version")
  WHERE "workspace_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "saved_tenders_workspace_saved_idx"
  ON "saved_tenders" ("workspace_id", "saved_at");
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "saved_tenders_workspace_tender_uidx"
  ON "saved_tenders" ("workspace_id", "tender_id");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "saved_searches_workspace_updated_idx"
  ON "saved_searches" ("workspace_id", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "saved_searches_workspace_query_active_uidx"
  ON "saved_searches" ("workspace_id", "query")
  WHERE "workspace_id" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_workspace_created_idx"
  ON "notifications" ("workspace_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "notifications_workspace_dedupe_uidx"
  ON "notifications" ("workspace_id", "dedupe_key") WHERE "workspace_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "notifications_id_workspace_uidx"
  ON "notifications" ("id", "workspace_id");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "email_deliveries_workspace_created_idx"
  ON "email_deliveries" ("workspace_id", "created_at") WHERE "workspace_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "email_deliveries_id_workspace_uidx"
  ON "email_deliveries" ("id", "workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "email_deliveries_workspace_dedupe_uidx"
  ON "email_deliveries" ("workspace_id", "dedupe_key") WHERE "workspace_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "email_delivery_notifications_workspace_idx"
  ON "email_delivery_notifications" ("workspace_id");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "recommendation_events_workspace_time_idx"
  ON "recommendation_events" ("workspace_id", "occurred_at");
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "recommendation_dismissals_workspace_tender_uidx"
  ON "recommendation_dismissals" ("workspace_id", "tender_id");
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "recommendation_interest_profiles_workspace_uidx"
  ON "recommendation_interest_profiles" ("workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "user_recommendations_workspace_tender_uidx"
  ON "user_recommendations" ("workspace_id", "tender_id");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_recommendations_workspace_rank_idx"
  ON "user_recommendations" ("workspace_id", "rank");
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ai_jobs_workspace_created_idx"
  ON "ai_jobs" ("workspace_id", "created_at") WHERE "workspace_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "ai_jobs_workspace_dedupe_uidx"
  ON "ai_jobs" ("workspace_id", "dedupe_key") WHERE "workspace_id" IS NOT NULL;
