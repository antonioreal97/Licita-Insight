-- Accepts `fap` (chamadas das Fundações de Amparo à Pesquisa estaduais) in `cultural_opportunities.source`
-- (docs/migrations/0054-opportunity-source-fap.md). No column and no row changes: the list only grows, so every
-- existing row already satisfies it.
ALTER TABLE "cultural_opportunities"
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_source_check";

ALTER TABLE "cultural_opportunities"
  ADD CONSTRAINT "cultural_opportunities_source_check"
    CHECK ("source" IN ('mapas', 'finep', 'cnpq', 'capes', 'transferegov', 'funarte', 'minc', 'salic', 'worldbank', 'eu_ft', 'idb', 'fap'));
