CREATE INDEX IF NOT EXISTS "ai_daily_usage_day_idx" ON "ai_daily_usage" ("quota_day");
CREATE INDEX IF NOT EXISTS "ai_fit_daily_usage_day_idx" ON "ai_fit_daily_usage" ("quota_day");
ALTER TABLE "job_run_audit" DROP CONSTRAINT IF EXISTS "job_run_audit_status_check";
ALTER TABLE "job_run_audit" ADD CONSTRAINT "job_run_audit_status_check"
  CHECK ("status" IN ('running', 'skipped_locked', 'skipped_budget', 'succeeded', 'failed'));
