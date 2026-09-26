CREATE TABLE IF NOT EXISTS "ai_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "user_id" text REFERENCES "users"("id") ON DELETE cascade,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "lane" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 6 NOT NULL,
  "run_after" timestamp with time zone DEFAULT now() NOT NULL,
  "locked_by" text,
  "locked_until" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  CONSTRAINT "ai_jobs_kind_check" CHECK ("kind" IN ('index', 'fit', 'sheet')),
  CONSTRAINT "ai_jobs_lane_check" CHECK ("lane" IN ('interactive', 'batch')),
  CONSTRAINT "ai_jobs_status_check" CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed', 'dead')),
  CONSTRAINT "ai_jobs_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "ai_jobs_max_attempts_check" CHECK ("max_attempts" >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_jobs_dedupe_uidx" ON "ai_jobs" ("dedupe_key");
CREATE INDEX IF NOT EXISTS "ai_jobs_claim_idx" ON "ai_jobs" ("lane", "run_after", "created_at") WHERE "status" = 'queued';
CREATE INDEX IF NOT EXISTS "ai_jobs_user_created_idx" ON "ai_jobs" ("user_id", "created_at");
