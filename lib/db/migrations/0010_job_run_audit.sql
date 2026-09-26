CREATE TABLE IF NOT EXISTS job_run_audit (
  id bigserial PRIMARY KEY,
  job_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'skipped_locked', 'succeeded', 'failed')),
  worker_id text NOT NULL,
  duration_ms integer,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS job_run_audit_job_started_idx
  ON job_run_audit (job_key, started_at);
