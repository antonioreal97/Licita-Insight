ALTER TABLE tenders
  ADD COLUMN display_title text,
  ADD COLUMN display_title_source text,
  ADD COLUMN display_title_version integer,
  ADD COLUMN display_title_norm text NOT NULL DEFAULT '',
  ADD COLUMN display_title_needs_model boolean NOT NULL DEFAULT false,
  ADD COLUMN category_source text,
  ADD COLUMN category_confidence real,
  ADD COLUMN categorized_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE tenders
  ADD CONSTRAINT tenders_display_title_source_check
    CHECK (display_title_source IS NULL OR display_title_source IN ('rules', 'model')),
  ADD CONSTRAINT tenders_category_source_check
    CHECK (category_source IS NULL OR category_source IN ('rules', 'student', 'teacher'));
--> statement-breakpoint
CREATE INDEX tenders_display_title_needs_model_idx ON tenders (status, id)
  WHERE display_title_needs_model AND display_title_source = 'rules';
