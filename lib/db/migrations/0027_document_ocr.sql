ALTER TABLE ai_jobs DROP CONSTRAINT ai_jobs_kind_check;
--> statement-breakpoint
ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_kind_check
  CHECK (kind IN ('index', 'document_ocr', 'fit', 'sheet', 'sheet_summary', 'title_rewrite'));
--> statement-breakpoint
ALTER TABLE tender_ai_indexes DROP CONSTRAINT tender_ai_indexes_status_check;
--> statement-breakpoint
ALTER TABLE tender_ai_indexes ADD CONSTRAINT tender_ai_indexes_status_check
  CHECK (status IN ('processing', 'ocr_processing', 'ready', 'failed', 'no_documents', 'unsupported'));
--> statement-breakpoint
ALTER TABLE tender_ai_documents DROP CONSTRAINT tender_ai_documents_status_check;
--> statement-breakpoint
ALTER TABLE tender_ai_documents ADD CONSTRAINT tender_ai_documents_status_check
  CHECK (status IN ('processing', 'ocr_processing', 'ready', 'failed', 'unsupported'));
--> statement-breakpoint
ALTER TABLE tender_ai_documents ADD COLUMN ocr_confidence numeric(5,2);
--> statement-breakpoint
ALTER TABLE tender_ai_documents ADD COLUMN ocr_low_confidence_pages integer[] DEFAULT '{}'::integer[] NOT NULL;
