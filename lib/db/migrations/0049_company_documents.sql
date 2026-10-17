-- Company document readiness metadata. No file contents or document-holder personal data are stored.
CREATE TABLE IF NOT EXISTS "company_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "status" text NOT NULL,
  "issued_at" date,
  "expires_at" date,
  "reference" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "company_documents_status_check" CHECK ("status" IN ('have', 'missing', 'not_applicable')),
  CONSTRAINT "company_documents_kind_check" CHECK ("kind" IN ('sicaf','cnd_federal','crf_fgts','cndt','state_tax_clearance','municipal_tax_clearance','bankruptcy_clearance','balance_sheet','articles_of_association','technical_capacity_certificate','professional_council_registration','platform_registration')),
  CONSTRAINT "company_documents_reference_length_check" CHECK ("reference" IS NULL OR char_length("reference") <= 160)
);

CREATE UNIQUE INDEX IF NOT EXISTS "company_documents_user_kind_uidx"
  ON "company_documents" ("user_id", "kind");

CREATE INDEX IF NOT EXISTS "company_documents_expiry_idx"
  ON "company_documents" ("expires_at")
  WHERE "status" = 'have' AND "expires_at" IS NOT NULL;
