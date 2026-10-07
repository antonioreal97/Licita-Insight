CREATE TABLE ai_daily_tenders (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quota_day date NOT NULL,
  tender_id text NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ai_daily_tenders_user_id_quota_day_tender_id_pk PRIMARY KEY (user_id, quota_day, tender_id)
);
--> statement-breakpoint
CREATE INDEX ai_daily_tenders_day_idx ON ai_daily_tenders USING btree (quota_day);
