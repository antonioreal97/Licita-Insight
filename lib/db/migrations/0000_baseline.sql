CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE "tenders" (
  "id" text PRIMARY KEY NOT NULL,
  "pncp_control_number" text NOT NULL,
  "title" text NOT NULL,
  "object_summary" text,
  "description" text,
  "organization_id" text NOT NULL,
  "organization_name" text NOT NULL,
  "purchasing_unit" text,
  "modality" text NOT NULL,
  "modality_label" text NOT NULL,
  "status" text NOT NULL,
  "tender_number" text,
  "process_number" text,
  "estimated_value" numeric(18,2),
  "estimated_value_status" text NOT NULL,
  "published_at" timestamp with time zone,
  "opening_at" timestamp with time zone,
  "proposal_deadline" timestamp with time zone,
  "state" text,
  "city" text,
  "city_ibge_code" text,
  "source_id" text NOT NULL,
  "source_name" text NOT NULL,
  "source_url" text,
  "categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "search_text" text NOT NULL,
  "title_norm" text NOT NULL,
  "object_norm" text NOT NULL,
  "items_norm" text NOT NULL,
  "organization_norm" text NOT NULL,
  "other_norm" text NOT NULL,
  "city_norm" text,
  "raw_payload" jsonb NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL,
  "details_fetched_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenders_pncp_control_number_uidx" ON "tenders" USING btree ("pncp_control_number");
CREATE INDEX "tenders_status_idx" ON "tenders" USING btree ("status");
CREATE INDEX "tenders_modality_idx" ON "tenders" USING btree ("modality");
CREATE INDEX "tenders_state_idx" ON "tenders" USING btree ("state");
CREATE INDEX "tenders_published_at_idx" ON "tenders" USING btree ("published_at");
CREATE INDEX "tenders_proposal_deadline_idx" ON "tenders" USING btree ("proposal_deadline");
CREATE INDEX "tenders_organization_id_idx" ON "tenders" USING btree ("organization_id");
CREATE INDEX "tenders_source_id_idx" ON "tenders" USING btree ("source_id");
CREATE INDEX "tenders_city_ibge_idx" ON "tenders" USING btree ("city_ibge_code");
CREATE INDEX "tenders_fetched_at_idx" ON "tenders" USING btree ("fetched_at");
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
  "id" text PRIMARY KEY NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "window_from" timestamp with time zone NOT NULL,
  "window_to" timestamp with time zone NOT NULL,
  "pages_read" integer DEFAULT 0 NOT NULL,
  "upserted" integer DEFAULT 0 NOT NULL,
  "refreshed" integer DEFAULT 0 NOT NULL,
  "refresh_errors" integer DEFAULT 0 NOT NULL,
  "error" text,
  "details" jsonb,
  "started_at" timestamp with time zone NOT NULL,
  "heartbeat_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_runs_one_running" ON "ingest_runs" USING btree ("source") WHERE "status" = 'running';
CREATE INDEX "ingest_runs_started_at_idx" ON "ingest_runs" USING btree ("started_at");
--> statement-breakpoint
CREATE TABLE "ingest_days" (
  "source" text NOT NULL,
  "day" date NOT NULL,
  "modality" integer NOT NULL,
  "uf" text NOT NULL,
  "status" text NOT NULL,
  "pages_read" integer DEFAULT 0 NOT NULL,
  "upserted" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "ingest_days_source_day_modality_uf_pk" PRIMARY KEY("source","day","modality","uf")
);
--> statement-breakpoint
CREATE TABLE "cultural_opportunities" (
  "id" text PRIMARY KEY NOT NULL,
  "installation_id" text NOT NULL,
  "external_id" text NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "organization_name" text NOT NULL,
  "state" text,
  "registration_from" timestamp with time zone,
  "registration_to" timestamp with time zone,
  "status" text NOT NULL,
  "program" text NOT NULL,
  "source_url" text,
  "search_text" text NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "fetched_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "cultural_opportunities_installation_external_uidx" ON "cultural_opportunities" USING btree ("installation_id","external_id");
CREATE INDEX "cultural_opportunities_status_idx" ON "cultural_opportunities" USING btree ("status");
CREATE INDEX "cultural_opportunities_state_idx" ON "cultural_opportunities" USING btree ("state");
CREATE INDEX "cultural_opportunities_registration_to_idx" ON "cultural_opportunities" USING btree ("registration_to");
CREATE INDEX "cultural_opportunities_installation_idx" ON "cultural_opportunities" USING btree ("installation_id");
CREATE INDEX "cultural_opportunities_fetched_at_idx" ON "cultural_opportunities" USING btree ("fetched_at");
