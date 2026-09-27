ALTER TABLE "tender_ai_sheets"
  ADD COLUMN IF NOT EXISTS "qualification_checklist" jsonb DEFAULT '[]'::jsonb NOT NULL;
