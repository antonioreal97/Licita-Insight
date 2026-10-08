CREATE INDEX IF NOT EXISTS ai_jobs_title_openai_tender_prompt_idx
  ON ai_jobs (tender_id, ((payload->>'promptVersion')))
  WHERE kind = 'title_rewrite' AND payload->>'provider' = 'openai';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_jobs_title_openai_quota_idx
  ON ai_jobs (((payload->>'titleQuotaDay')))
  WHERE kind = 'title_rewrite' AND payload->>'provider' = 'openai';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS tenders_title_backfill_idx
  ON tenders ((jsonb_array_length(categories)), proposal_deadline, published_at, id)
  WHERE status = 'open' AND display_title_source = 'rules';
