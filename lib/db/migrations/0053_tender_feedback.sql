-- Reports sent from a tender page to the Pardal Digital team (tender-feedback-v1). Additive: the API before this
-- change never touches the table. user_id is null for anonymous reports; account deletion removes a user's rows.
CREATE TABLE IF NOT EXISTS "tender_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tender_id" text NOT NULL REFERENCES "tenders"("id") ON DELETE cascade,
  "user_id" text REFERENCES "users"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "section" text,
  "message" text NOT NULL,
  "page_url" text,
  "user_agent" text,
  "status" text DEFAULT 'new' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "tender_feedback_kind_check"
    CHECK ("kind" IN ('wrong_or_missing_info', 'possible_irregularity', 'broken_link', 'other')),
  CONSTRAINT "tender_feedback_section_check"
    CHECK ("section" IS NULL OR "section" IN ('summary', 'deadlines', 'value', 'documents', 'sheet', 'items', 'timeline', 'other')),
  CONSTRAINT "tender_feedback_status_check"
    CHECK ("status" IN ('new', 'triaged', 'resolved', 'dismissed')),
  CONSTRAINT "tender_feedback_message_length_check"
    CHECK (char_length("message") BETWEEN 10 AND 2000)
);

CREATE INDEX IF NOT EXISTS "tender_feedback_status_created_at_idx"
  ON "tender_feedback" USING btree ("status", "created_at");
CREATE INDEX IF NOT EXISTS "tender_feedback_tender_idx"
  ON "tender_feedback" USING btree ("tender_id", "created_at");
CREATE INDEX IF NOT EXISTS "tender_feedback_user_idx"
  ON "tender_feedback" USING btree ("user_id");
