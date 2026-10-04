#!/bin/sh
# Read-only gate: run on the real beta after app startup, before any invitation.
set -eu
here=$(cd "$(dirname "$0")" && pwd)

docker compose -f "$here/docker-compose.yml" exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' <<'SQL'
DO $$
DECLARE name text; amount bigint;
BEGIN
  IF (SELECT count(*) FROM drizzle.__drizzle_migrations) < 25 THEN
    RAISE EXCEPTION 'migration 0024 or earlier is missing';
  END IF;
  FOREACH name IN ARRAY ARRAY[
    'users', 'sessions', 'subscriptions', 'saved_tenders', 'saved_searches',
    'ai_ask_requests', 'notifications', 'beta_access_grants',
    'google_trial_tombstones', 'email_deliveries', 'email_delivery_notifications',
    'company_profiles', 'company_tender_fits', 'ai_daily_usage', 'ai_fit_daily_usage'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', name) INTO amount;
    IF amount <> 0 THEN
      RAISE EXCEPTION 'personal beta table % has % rows before invitations', name, amount;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM tenders
    WHERE source_id = 'pncp' AND status = 'open' AND proposal_deadline < now()
  ) THEN
    RAISE EXCEPTION 'expired PNCP tenders are still open';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM job_run_audit
    WHERE job_key = 'tender_deadline_reconciliation' AND status = 'succeeded'
  ) THEN
    RAISE EXCEPTION 'hourly tender reconciliation has not run successfully';
  END IF;
END $$;
SELECT 'tenders' AS item, count(*) FROM tenders
UNION ALL SELECT 'tender_ai_passages', count(*) FROM tender_ai_passages
UNION ALL SELECT 'tender_ai_answers', count(*) FROM tender_ai_answers
ORDER BY item;
SQL

echo "pre-invite beta checks passed"
