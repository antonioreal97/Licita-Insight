ALTER TABLE "company_profiles"
  ADD COLUMN "selected_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "selected_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN "excluded_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE TABLE "profile_keyword_vocabulary" (
  "normalized_term" text PRIMARY KEY NOT NULL,
  "display_term" text NOT NULL,
  "ngram_size" integer NOT NULL,
  "open_tender_count" integer NOT NULL,
  "predominant_category_slug" text,
  "predominant_category_label" text,
  "related_terms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "profile_keyword_vocabulary_ngram_size_check" CHECK ("ngram_size" BETWEEN 1 AND 3),
  CONSTRAINT "profile_keyword_vocabulary_open_count_check" CHECK ("open_tender_count" >= 3)
);

-- pg_trgm is installed by the baseline migration and supports fast prefix/fuzzy autocomplete.
CREATE INDEX "profile_keyword_vocabulary_trgm_idx"
  ON "profile_keyword_vocabulary" USING gin ("normalized_term" gin_trgm_ops);
CREATE INDEX "profile_keyword_vocabulary_count_idx"
  ON "profile_keyword_vocabulary" ("open_tender_count" DESC NULLS LAST);
