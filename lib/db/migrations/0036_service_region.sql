-- Additive profile-only migration. It does not scan or lock `tenders`.
-- Existing `coverage_states` data remains untouched and is read as the new custom model.
ALTER TABLE "company_profiles"
  DROP CONSTRAINT "company_profiles_coverage_scope_check";

ALTER TABLE "company_profiles"
  ADD COLUMN "coverage_regions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "coverage_municipalities" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "headquarters_municipality_ibge" text,
  ADD COLUMN "coverage_radius_km" integer,
  -- Legacy state coverage used soft ranking, so existing rows keep that behavior.
  ADD COLUMN "coverage_mode" text DEFAULT 'prioritize' NOT NULL,
  ADD COLUMN "accepts_remote" boolean DEFAULT false NOT NULL,
  ADD CONSTRAINT "company_profiles_coverage_scope_check"
    CHECK ("coverage_scope" IN ('national', 'states', 'custom')),
  ADD CONSTRAINT "company_profiles_coverage_mode_check"
    CHECK ("coverage_mode" IN ('strict', 'prioritize')),
  ADD CONSTRAINT "company_profiles_coverage_radius_check"
    CHECK ("coverage_radius_km" IS NULL OR "coverage_radius_km" IN (50, 100, 200, 300, 500));

ALTER TABLE "company_profiles" ALTER COLUMN "coverage_mode" SET DEFAULT 'strict';
