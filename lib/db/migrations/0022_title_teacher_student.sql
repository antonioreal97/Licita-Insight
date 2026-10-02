CREATE TABLE tender_title_examples (
  text_hash text PRIMARY KEY NOT NULL,
  source_text text NOT NULL,
  tender_id text,
  teacher_title text,
  categories text[] DEFAULT '{}'::text[] NOT NULL,
  teacher_model text NOT NULL,
  prompt_version integer NOT NULL,
  split text NOT NULL,
  embedding real[],
  embedding_model text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tender_title_examples_split_check CHECK (split IN ('train', 'holdout'))
);
--> statement-breakpoint
ALTER TABLE tender_title_examples
  ADD CONSTRAINT tender_title_examples_tender_id_tenders_id_fk
    FOREIGN KEY (tender_id) REFERENCES public.tenders(id) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX tender_title_examples_pending_embedding_idx ON tender_title_examples USING btree (text_hash)
  WHERE embedding IS NULL;
--> statement-breakpoint
ALTER TABLE ai_jobs DROP CONSTRAINT ai_jobs_kind_check;
--> statement-breakpoint
ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_kind_check
  CHECK (kind IN ('index', 'fit', 'sheet', 'sheet_summary', 'title_rewrite'));
