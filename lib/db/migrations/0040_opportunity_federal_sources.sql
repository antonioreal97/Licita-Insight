-- Non-destructive: no row is changed or removed. Only the list of values the `source` column accepts grows,
-- with the federal culture sources (Transferegov, Funarte, MinC and Lei Rouanet/Salic calls).
-- Every existing row already satisfies the wider list, and `cultural_opportunities` is small (hundreds of
-- rows), so re-validating the constraint is immediate.
ALTER TABLE "cultural_opportunities"
  DROP CONSTRAINT IF EXISTS "cultural_opportunities_source_check";

ALTER TABLE "cultural_opportunities"
  ADD CONSTRAINT "cultural_opportunities_source_check"
    CHECK ("source" IN ('mapas', 'finep', 'cnpq', 'capes', 'transferegov', 'funarte', 'minc', 'salic'));
