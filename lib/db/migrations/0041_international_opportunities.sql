-- Additive only: no row is changed or removed. Every new column is nullable or has a constant default, which
-- PostgreSQL 11+ adds as metadata, without rewriting the table.
ALTER TABLE "cultural_opportunities"
  ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'national' NOT NULL,
  ADD COLUMN IF NOT EXISTS "agency" text,
  ADD COLUMN IF NOT EXISTS "country" text,
  ADD COLUMN IF NOT EXISTS "country_name" text,
  ADD COLUMN IF NOT EXISTS "region" text,
  ADD COLUMN IF NOT EXISTS "language" text,
  ADD COLUMN IF NOT EXISTS "title_original" text,
  ADD COLUMN IF NOT EXISTS "title_pt" text,
  ADD COLUMN IF NOT EXISTS "translation_source" text,
  ADD COLUMN IF NOT EXISTS "amount_original" numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "currency" text,
  ADD COLUMN IF NOT EXISTS "amount_brl_approx" numeric(18, 2),
  ADD COLUMN IF NOT EXISTS "fx_rate" numeric(18, 6),
  ADD COLUMN IF NOT EXISTS "fx_date" date,
  ADD COLUMN IF NOT EXISTS "deadline_time_zone" text,
  ADD COLUMN IF NOT EXISTS "deadline_precision" text,
  ADD COLUMN IF NOT EXISTS "deadline_original" text,
  ADD COLUMN IF NOT EXISTS "brazil_eligibility" text,
  ADD COLUMN IF NOT EXISTS "brazil_eligibility_reason" text,
  ADD COLUMN IF NOT EXISTS "brazil_eligibility_rule" text,
  ADD COLUMN IF NOT EXISTS "brazil_funding" text,
  ADD COLUMN IF NOT EXISTS "brazil_funding_reason" text,
  ADD COLUMN IF NOT EXISTS "eligibility_checked_at" timestamp with time zone;

-- The lists of accepted values only grow, so every existing row already satisfies them. The table is small
-- (thousands of rows at most), so re-validating each constraint is immediate.
ALTER TABLE "cultural_opportunities"
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_kind_check",
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_source_check",
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_scope_check",
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_brazil_eligibility_check",
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_brazil_funding_check",
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_deadline_precision_check",
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_amount_original_check";

ALTER TABLE "cultural_opportunities"
  ADD CONSTRAINT "cultural_opportunities_kind_check"
    CHECK ("kind" IN ('culture', 'funding', 'innovation', 'partnership', 'procurement')),
  ADD CONSTRAINT "cultural_opportunities_source_check"
    CHECK ("source" IN ('mapas', 'finep', 'cnpq', 'capes', 'transferegov', 'funarte', 'minc', 'salic', 'worldbank', 'eu_ft')),
  ADD CONSTRAINT "cultural_opportunities_scope_check"
    CHECK ("scope" IN ('national', 'international')),
  ADD CONSTRAINT "cultural_opportunities_brazil_eligibility_check"
    CHECK ("brazil_eligibility" IS NULL OR "brazil_eligibility" IN ('yes', 'conditional', 'no', 'unknown')),
  ADD CONSTRAINT "cultural_opportunities_brazil_funding_check"
    CHECK ("brazil_funding" IS NULL OR "brazil_funding" IN ('yes', 'conditional', 'no', 'unknown')),
  ADD CONSTRAINT "cultural_opportunities_deadline_precision_check"
    CHECK ("deadline_precision" IS NULL OR "deadline_precision" IN ('datetime', 'date')),
  ADD CONSTRAINT "cultural_opportunities_amount_original_check"
    CHECK ("amount_original" IS NULL OR "amount_original" >= 0);

CREATE INDEX IF NOT EXISTS "cultural_opportunities_scope_idx"
  ON "cultural_opportunities" ("scope");
CREATE INDEX IF NOT EXISTS "cultural_opportunities_brazil_eligibility_idx"
  ON "cultural_opportunities" ("brazil_eligibility");
CREATE INDEX IF NOT EXISTS "cultural_opportunities_region_idx"
  ON "cultural_opportunities" ("region");

-- Opt-in preference, off for everyone. Metadata-only as well; `users` is not rewritten.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "show_international_opportunities" boolean DEFAULT false NOT NULL;
