-- Additive only: no row is changed or removed. Every new column is nullable, which PostgreSQL adds as
-- metadata, without rewriting the table. The scheduled collections fill them on their next runs.
ALTER TABLE "cultural_opportunities"
  ADD COLUMN IF NOT EXISTS "application_url" text,
  ADD COLUMN IF NOT EXISTS "application_platform" text,
  ADD COLUMN IF NOT EXISTS "application_label" text,
  ADD COLUMN IF NOT EXISTS "application_source" text,
  ADD COLUMN IF NOT EXISTS "application_document_title" text,
  ADD COLUMN IF NOT EXISTS "application_checked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "application_input_hash" text,
  ADD COLUMN IF NOT EXISTS "notice_registration_from" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "notice_registration_to" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "notice_dates_source" text,
  ADD COLUMN IF NOT EXISTS "notice_dates_document_title" text;

-- Both columns are new and empty, so validating the constraints reads nothing.
ALTER TABLE "cultural_opportunities"
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_application_source_check",
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_notice_dates_source_check";

ALTER TABLE "cultural_opportunities"
  ADD CONSTRAINT "cultural_opportunities_application_source_check"
    CHECK ("application_source" IS NULL OR "application_source" IN ('source_page', 'document')),
  ADD CONSTRAINT "cultural_opportunities_notice_dates_source_check"
    CHECK ("notice_dates_source" IS NULL OR "notice_dates_source" IN ('source_page', 'document'));
