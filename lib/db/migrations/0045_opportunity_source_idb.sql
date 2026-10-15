-- Accepts `idb` (avisos de aquisição do BID) in `cultural_opportunities.source` (docs/migrations/0045-opportunity-source-idb.md).
-- No column and no row changes. The list only grows, so every existing row already satisfies it; re-validating
-- the constraint on a table of a few thousand rows is immediate.
ALTER TABLE "cultural_opportunities"
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_source_check";

ALTER TABLE "cultural_opportunities"
  ADD CONSTRAINT "cultural_opportunities_source_check"
    CHECK ("source" IN ('mapas', 'finep', 'cnpq', 'capes', 'transferegov', 'funarte', 'minc', 'salic', 'worldbank', 'eu_ft', 'idb'));
