-- Additive only: every existing row is kept. Constant defaults are metadata-only on PostgreSQL 11+, so the
-- ALTER does not rewrite the table and holds only a brief lock.
ALTER TABLE "cultural_opportunities"
  ADD COLUMN IF NOT EXISTS "areas" text[] DEFAULT '{}'::text[] NOT NULL,
  ADD COLUMN IF NOT EXISTS "area_terms" text[] DEFAULT '{}'::text[] NOT NULL,
  ADD COLUMN IF NOT EXISTS "opportunity_type" text,
  ADD COLUMN IF NOT EXISTS "origin_name" text,
  ADD COLUMN IF NOT EXISTS "city" text,
  ADD COLUMN IF NOT EXISTS "continuous_flow" boolean DEFAULT false NOT NULL;

-- Until this migration the Mapas collection stored audiovisual calls only, so those rows keep answering the
-- audiovisual area filter. The next collection rewrites the areas of every call that is still open.
UPDATE "cultural_opportunities"
  SET "areas" = ARRAY['audiovisual']
  WHERE "source" = 'mapas' AND "areas" = '{}'::text[];

-- `cultural_opportunities` is small (hundreds of rows), so plain CREATE INDEX finishes at once.
CREATE INDEX IF NOT EXISTS "cultural_opportunities_areas_idx"
  ON "cultural_opportunities" USING gin ("areas");
CREATE INDEX IF NOT EXISTS "cultural_opportunities_city_idx"
  ON "cultural_opportunities" ("city");
