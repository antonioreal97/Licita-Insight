ALTER TABLE saved_tenders
  ADD COLUMN stage text NOT NULL DEFAULT 'analyzing',
  ADD COLUMN stage_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN protocol text,
  ADD COLUMN next_action text,
  ADD COLUMN next_action_deadline timestamptz,
  ADD COLUMN checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN history jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
UPDATE saved_tenders SET stage_at = saved_at;
--> statement-breakpoint
ALTER TABLE saved_tenders ADD CONSTRAINT saved_tenders_stage_check
  CHECK (stage IN ('analyzing', 'participating', 'submitted', 'awaiting_result', 'completed', 'dismissed'));
--> statement-breakpoint
CREATE INDEX saved_tenders_user_stage_idx ON saved_tenders (user_id, stage);
