ALTER TABLE "cultural_opportunities"
  ADD COLUMN "kind" text DEFAULT 'culture' NOT NULL,
  ADD COLUMN "source" text DEFAULT 'mapas' NOT NULL,
  ADD COLUMN "audience" text,
  ADD COLUMN "amount" numeric(18,2),
  ADD COLUMN "documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ALTER COLUMN "program" DROP NOT NULL;

ALTER TABLE "cultural_opportunities"
  ADD CONSTRAINT "cultural_opportunities_kind_check"
    CHECK ("kind" IN ('culture', 'funding', 'innovation', 'partnership')),
  ADD CONSTRAINT "cultural_opportunities_source_check"
    CHECK ("source" IN ('mapas', 'finep', 'cnpq', 'capes')),
  ADD CONSTRAINT "cultural_opportunities_amount_check"
    CHECK ("amount" IS NULL OR "amount" >= 0);

CREATE INDEX "cultural_opportunities_kind_idx"
  ON "cultural_opportunities" ("kind");
CREATE INDEX "cultural_opportunities_source_idx"
  ON "cultural_opportunities" ("source");
