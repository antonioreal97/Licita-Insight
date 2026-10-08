-- Additive only: existing rows keep platform NULL until `backfill:platform` fills them in batches.
ALTER TABLE "tenders"
  ADD COLUMN "platform" text,
  ADD COLUMN "platform_label" text;

CREATE INDEX "tenders_platform_idx" ON "tenders" ("platform");

ALTER TABLE "company_profiles"
  ADD COLUMN "registered_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL;
