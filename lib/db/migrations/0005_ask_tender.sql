CREATE TABLE "tender_ai_indexes" (
  "tender_id" text PRIMARY KEY NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "version" integer DEFAULT 1 NOT NULL,
  "source_fingerprint" text NOT NULL,
  "status" text NOT NULL,
  "error" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "tender_ai_indexes_status_check" CHECK ("status" IN ('processing', 'ready', 'failed', 'no_documents', 'unsupported'))
);
--> statement-breakpoint
CREATE TABLE "tender_ai_documents" (
  "id" text PRIMARY KEY NOT NULL,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "source_document_id" text NOT NULL,
  "title" text NOT NULL,
  "source_url" text NOT NULL,
  "internal_path" text,
  "pages" integer,
  "status" text NOT NULL,
  "error" text,
  "extracted_at" timestamp with time zone,
  CONSTRAINT "tender_ai_documents_status_check" CHECK ("status" IN ('processing', 'ready', 'failed', 'unsupported'))
);
--> statement-breakpoint
CREATE INDEX "tender_ai_documents_tender_idx" ON "tender_ai_documents" ("tender_id");
--> statement-breakpoint
CREATE TABLE "tender_ai_passages" (
  "id" text PRIMARY KEY NOT NULL,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "document_id" text NOT NULL REFERENCES "tender_ai_documents"("id") ON DELETE cascade,
  "index_version" integer NOT NULL,
  "page" integer NOT NULL,
  "passage_order" integer NOT NULL,
  "text" text NOT NULL,
  "search_vector" tsvector GENERATED ALWAYS AS (to_tsvector('portuguese', "text")) STORED
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tender_ai_passages_position_uidx" ON "tender_ai_passages" ("document_id", "index_version", "page", "passage_order");
CREATE INDEX "tender_ai_passages_tender_idx" ON "tender_ai_passages" ("tender_id", "index_version");
CREATE INDEX "tender_ai_passages_search_idx" ON "tender_ai_passages" USING gin ("search_vector");
--> statement-breakpoint
CREATE TABLE "ai_daily_usage" (
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "quota_day" date NOT NULL,
  "used" integer DEFAULT 0 NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(14,8) DEFAULT '0' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_daily_usage_user_id_quota_day_pk" PRIMARY KEY ("user_id", "quota_day"),
  CONSTRAINT "ai_daily_usage_used_check" CHECK ("used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ai_ask_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "question" text NOT NULL,
  "normalized_question" text NOT NULL,
  "index_version" integer NOT NULL,
  "requested_model" text NOT NULL,
  "response_model" text,
  "status" text NOT NULL,
  "passages" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "input_tokens" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(14,8) DEFAULT '0' NOT NULL,
  "cache_hit" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ai_ask_requests_status_check" CHECK ("status" IN ('processing', 'answered', 'not_found', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ai_ask_requests_cache_uidx" ON "ai_ask_requests" ("user_id", "tender_id", "normalized_question", "index_version", "requested_model");
CREATE INDEX "ai_ask_requests_user_created_idx" ON "ai_ask_requests" ("user_id", "created_at");
