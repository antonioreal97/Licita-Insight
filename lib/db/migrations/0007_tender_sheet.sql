CREATE TABLE "tender_ai_sheets" (
  "id" text PRIMARY KEY NOT NULL,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "index_version" integer NOT NULL,
  "requested_model" text NOT NULL,
  "prompt_version" integer NOT NULL,
  "status" text NOT NULL,
  "fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "unread_documents" integer DEFAULT 0 NOT NULL,
  "response_model" text,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(14,8) DEFAULT '0' NOT NULL,
  "generated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tender_ai_sheets_status_check" CHECK ("status" IN ('processing', 'ready', 'failed')),
  CONSTRAINT "tender_ai_sheets_unread_documents_check" CHECK ("unread_documents" >= 0)
);
CREATE UNIQUE INDEX "tender_ai_sheets_cache_uidx" ON "tender_ai_sheets" ("tender_id", "index_version", "requested_model", "prompt_version");
CREATE INDEX "tender_ai_sheets_tender_idx" ON "tender_ai_sheets" ("tender_id", "updated_at");
--> statement-breakpoint
CREATE TABLE "ai_sheet_daily_usage" (
  "quota_day" date PRIMARY KEY NOT NULL,
  "used" integer DEFAULT 0 NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(14,8) DEFAULT '0' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_sheet_daily_usage_used_check" CHECK ("used" >= 0)
);
