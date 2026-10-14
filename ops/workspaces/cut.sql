\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('licitai:workspace-cutover', 0));
SELECT set_config('pardal.confirm_db', :'confirm_db', true);
DO $guard$ DECLARE state record; BEGIN
  IF current_database() <> current_setting('pardal.confirm_db') THEN RAISE EXCEPTION 'Database confirmation mismatch'; END IF;
  SELECT mode, writes_paused INTO state FROM workspace_cutover_events ORDER BY id DESC LIMIT 1;
  IF state.mode IS DISTINCT FROM 'legacy' OR state.writes_paused IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Cut requires paused legacy mode';
  END IF;
END $guard$;
-- The advisory lock drains the application gate. Table locks catch direct writers outside it.
LOCK TABLE users, company_profiles, company_tender_fits, saved_tenders, saved_searches,
  notifications, email_deliveries, email_delivery_notifications, recommendation_events,
  recommendation_dismissals, recommendation_interest_profiles, user_recommendations, ai_jobs
  IN SHARE ROW EXCLUSIVE MODE;
\ir w3-delta.sql
\ir invariants.sql
DO $deadline$ BEGIN
  IF clock_timestamp() - (
    SELECT created_at FROM workspace_cutover_events
    WHERE mode = 'legacy' AND writes_paused ORDER BY id DESC LIMIT 1
  ) >= interval '10 minutes' THEN
    RAISE EXCEPTION 'Cutover point of no return reached before commit';
  END IF;
END $deadline$;
INSERT INTO workspace_cutover_events (mode, writes_paused, actor, reason, details)
VALUES ('workspaces', true, :'actor', :'reason',
  jsonb_build_object('delta_rows', :'delta_count'::integer,
    'paused_seconds', :'paused_seconds'::integer));
COMMIT;
