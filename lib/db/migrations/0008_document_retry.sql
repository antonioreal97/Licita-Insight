ALTER TABLE "tender_ai_documents" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "tender_ai_documents" ADD COLUMN "retryable" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "tender_ai_documents" ADD COLUMN "next_retry_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tender_ai_documents" ADD COLUMN "last_attempt_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tender_ai_documents" ADD CONSTRAINT "tender_ai_documents_attempt_count_check" CHECK ("attempt_count" >= 0);
--> statement-breakpoint
CREATE INDEX "tender_ai_documents_retry_idx" ON "tender_ai_documents" ("next_retry_at") WHERE "retryable" = true;
--> statement-breakpoint
UPDATE "tender_ai_documents"
SET "attempt_count" = 1,
    "retryable" = true,
    "next_retry_at" = now(),
    "last_attempt_at" = now()
WHERE "status" = 'failed';
--> statement-breakpoint
UPDATE "tender_ai_indexes" AS i
SET "status" = 'ready',
    "error" = NULL,
    "completed_at" = COALESCE(i."completed_at", now()),
    "updated_at" = now()
WHERE i."status" = 'failed'
  AND EXISTS (
    SELECT 1
    FROM "tender_ai_documents" AS d
    WHERE d."tender_id" = i."tender_id"
      AND d."status" = 'ready'
  );
