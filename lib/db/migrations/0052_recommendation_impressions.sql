-- Score parts per materialized recommendation, and what each user was shown, for offline evaluation of the ranking.
-- Additive: the API before this change ignores the new column and never touches the new table.
ALTER TABLE "user_recommendations" ADD COLUMN IF NOT EXISTS "features" jsonb DEFAULT '{}'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS "recommendation_impressions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "scope" text NOT NULL,
  "position" integer NOT NULL,
  "rank" integer NOT NULL,
  "score" numeric(10, 5) NOT NULL,
  "features" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "algorithm_version" integer NOT NULL,
  "generated_at" timestamptz NOT NULL,
  "shown_at" timestamptz DEFAULT now() NOT NULL,
  "clicked_at" timestamptz,
  CONSTRAINT "recommendation_impressions_scope_check" CHECK ("scope" IN ('all', 'profile'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "recommendation_impressions_run_idx"
  ON "recommendation_impressions" USING btree ("user_id", "tender_id", "scope", "generated_at");
CREATE INDEX IF NOT EXISTS "recommendation_impressions_user_time_idx"
  ON "recommendation_impressions" USING btree ("user_id", "shown_at");
CREATE INDEX IF NOT EXISTS "recommendation_impressions_retention_idx"
  ON "recommendation_impressions" USING btree ("shown_at");
