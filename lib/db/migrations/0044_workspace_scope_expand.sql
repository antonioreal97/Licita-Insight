-- W2 of the workspaces cutover. Adds a nullable `workspace_id` to every table whose rows belong to a workspace,
-- its foreign key and its indexes. No row changes: the cutover backfill (W3) fills the column later, and
-- NOT NULL plus the workspace keys come only with W4.
--
-- The Drizzle migrator runs pending migrations inside one transaction, so this file builds the indexes with a
-- plain CREATE INDEX (SHARE lock: reads continue, writes to that table wait). In production, run
-- manual/0044_workspace_scope_expand_concurrently.sql first; it creates the same columns, foreign keys and
-- indexes without blocking writes, and every statement below then becomes a no-op.
-- Procedure: docs/migrations/0044-workspace-scope-expand.md.

-- Nullable without default: metadata only, no table rewrite.
ALTER TABLE "company_tender_fits" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "saved_tenders" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "saved_searches" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "email_deliveries" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "email_delivery_notifications" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "recommendation_events" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "recommendation_dismissals" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "recommendation_interest_profiles" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "user_recommendations" ADD COLUMN IF NOT EXISTS "workspace_id" text;
ALTER TABLE "ai_jobs" ADD COLUMN IF NOT EXISTS "workspace_id" text;

-- Account-only e-mails and global AI jobs outlive a deleted workspace; every other row goes with it.
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
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE %s',
        target_table, fk_name, delete_action
      );
    END IF;
  END LOOP;
END
$w2$;

CREATE INDEX IF NOT EXISTS "company_tender_fits_workspace_idx"
  ON "company_tender_fits" ("workspace_id", "checked_at");
CREATE UNIQUE INDEX IF NOT EXISTS "company_tender_fits_workspace_cache_uidx"
  ON "company_tender_fits" ("workspace_id", "profile_version", "tender_id", "requested_model", "prompt_version")
  WHERE "workspace_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "saved_tenders_workspace_saved_idx"
  ON "saved_tenders" ("workspace_id", "saved_at");
CREATE UNIQUE INDEX IF NOT EXISTS "saved_tenders_workspace_tender_uidx"
  ON "saved_tenders" ("workspace_id", "tender_id");

CREATE INDEX IF NOT EXISTS "saved_searches_workspace_updated_idx"
  ON "saved_searches" ("workspace_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "saved_searches_workspace_query_active_uidx"
  ON "saved_searches" ("workspace_id", "query")
  WHERE "workspace_id" IS NOT NULL AND "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "notifications_workspace_created_idx"
  ON "notifications" ("workspace_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_workspace_dedupe_uidx"
  ON "notifications" ("workspace_id", "dedupe_key") WHERE "workspace_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_id_workspace_uidx"
  ON "notifications" ("id", "workspace_id");

CREATE INDEX IF NOT EXISTS "email_deliveries_workspace_created_idx"
  ON "email_deliveries" ("workspace_id", "created_at") WHERE "workspace_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "email_deliveries_id_workspace_uidx"
  ON "email_deliveries" ("id", "workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "email_deliveries_workspace_dedupe_uidx"
  ON "email_deliveries" ("workspace_id", "dedupe_key") WHERE "workspace_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "email_delivery_notifications_workspace_idx"
  ON "email_delivery_notifications" ("workspace_id");

CREATE INDEX IF NOT EXISTS "recommendation_events_workspace_time_idx"
  ON "recommendation_events" ("workspace_id", "occurred_at");
CREATE UNIQUE INDEX IF NOT EXISTS "recommendation_dismissals_workspace_tender_uidx"
  ON "recommendation_dismissals" ("workspace_id", "tender_id");
CREATE UNIQUE INDEX IF NOT EXISTS "recommendation_interest_profiles_workspace_uidx"
  ON "recommendation_interest_profiles" ("workspace_id");
CREATE UNIQUE INDEX IF NOT EXISTS "user_recommendations_workspace_tender_uidx"
  ON "user_recommendations" ("workspace_id", "tender_id");
CREATE INDEX IF NOT EXISTS "user_recommendations_workspace_rank_idx"
  ON "user_recommendations" ("workspace_id", "rank");

CREATE INDEX IF NOT EXISTS "ai_jobs_workspace_created_idx"
  ON "ai_jobs" ("workspace_id", "created_at") WHERE "workspace_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "ai_jobs_workspace_dedupe_uidx"
  ON "ai_jobs" ("workspace_id", "dedupe_key") WHERE "workspace_id" IS NOT NULL;
