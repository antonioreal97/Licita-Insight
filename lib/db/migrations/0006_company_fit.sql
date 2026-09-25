ALTER TABLE "users" ADD COLUMN "profile_alerts" boolean DEFAULT true NOT NULL;
ALTER TABLE "notifications" ADD COLUMN "profile_matches" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE "company_profiles" (
  "user_id" text PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "description" text NOT NULL,
  "offerings" jsonb NOT NULL,
  "exclusions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "coverage_scope" text NOT NULL,
  "coverage_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "value_min" numeric(18,2),
  "value_max" numeric(18,2),
  "size" text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "last_alert_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_profiles_coverage_scope_check" CHECK ("coverage_scope" IN ('national', 'states')),
  CONSTRAINT "company_profiles_size_check" CHECK ("size" IN ('me_epp', 'cooperative', 'other')),
  CONSTRAINT "company_profiles_version_check" CHECK ("version" >= 1),
  CONSTRAINT "company_profiles_value_range_check" CHECK ("value_min" IS NULL OR "value_max" IS NULL OR "value_min" <= "value_max")
);
CREATE INDEX "company_profiles_alert_idx" ON "company_profiles" ("last_alert_at");
--> statement-breakpoint
CREATE TABLE "company_tender_fits" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "profile_version" integer NOT NULL,
  "tender_fingerprint" text NOT NULL,
  "requested_model" text NOT NULL,
  "prompt_version" integer NOT NULL,
  "status" text NOT NULL,
  "level" text,
  "score" numeric(8,7),
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "response_model" text,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(14,8) DEFAULT '0' NOT NULL,
  "checked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "company_tender_fits_status_check" CHECK ("status" IN ('processing', 'ready', 'filtered', 'failed')),
  CONSTRAINT "company_tender_fits_level_check" CHECK ("level" IS NULL OR "level" IN ('high', 'medium', 'low')),
  CONSTRAINT "company_tender_fits_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 1))
);
CREATE UNIQUE INDEX "company_tender_fits_cache_uidx" ON "company_tender_fits" ("user_id", "profile_version", "tender_id", "requested_model", "prompt_version");
CREATE INDEX "company_tender_fits_user_checked_idx" ON "company_tender_fits" ("user_id", "checked_at");
--> statement-breakpoint
CREATE TABLE "ai_fit_daily_usage" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "quota_day" date NOT NULL,
  "used" integer DEFAULT 0 NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(14,8) DEFAULT '0' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_fit_daily_usage_user_id_quota_day_pk" PRIMARY KEY ("user_id", "quota_day"),
  CONSTRAINT "ai_fit_daily_usage_used_check" CHECK ("used" >= 0)
);
