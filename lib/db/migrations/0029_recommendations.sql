ALTER TABLE "users"
  ADD COLUMN "recommendation_personalization_enabled" boolean DEFAULT false NOT NULL,
  ADD COLUMN "recommendation_preferences_updated_at" timestamp with time zone;

CREATE TABLE "recommendation_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "normalized_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tender_id" text REFERENCES "tenders"("id") ON DELETE cascade,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recommendation_events_type_check" CHECK ("type" IN ('search', 'tender_view')),
  CONSTRAINT "recommendation_events_payload_check" CHECK (
    ("type" = 'search' AND jsonb_array_length("normalized_terms") > 0 AND "tender_id" IS NULL)
    OR ("type" = 'tender_view' AND "tender_id" IS NOT NULL)
  )
);
CREATE INDEX "recommendation_events_user_time_idx" ON "recommendation_events" ("user_id", "occurred_at");
CREATE INDEX "recommendation_events_retention_idx" ON "recommendation_events" ("occurred_at");

CREATE TABLE "recommendation_dismissals" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recommendation_dismissals_user_id_tender_id_pk" PRIMARY KEY ("user_id", "tender_id")
);
CREATE INDEX "recommendation_dismissals_user_time_idx" ON "recommendation_dismissals" ("user_id", "dismissed_at");

CREATE TABLE "recommendation_interest_profiles" (
  "user_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE cascade,
  "profile" jsonb NOT NULL,
  "signal_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "user_recommendations" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "rank" integer NOT NULL,
  "score" numeric(10,5) NOT NULL,
  "reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_recommendations_user_id_tender_id_pk" PRIMARY KEY ("user_id", "tender_id"),
  CONSTRAINT "user_recommendations_rank_check" CHECK ("rank" BETWEEN 1 AND 50)
);
CREATE INDEX "user_recommendations_user_rank_idx" ON "user_recommendations" ("user_id", "rank");

CREATE TABLE "recommendation_metrics_daily" (
  "day" date PRIMARY KEY,
  "impressions" integer DEFAULT 0 NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "dismissals" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "tenders"
  ADD COLUMN "recommendation_search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', "search_text")) STORED;
CREATE INDEX "tenders_recommendation_search_idx"
  ON "tenders" USING gin ("recommendation_search_vector");
CREATE INDEX "tenders_categories_gin_idx" ON "tenders" USING gin ("categories" jsonb_path_ops);
