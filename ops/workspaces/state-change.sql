\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('licitai:workspace-cutover', 0));
SELECT set_config('pardal.confirm_db', :'confirm_db', true);
SELECT set_config('pardal.expected_mode', :'expected_mode', true);
SELECT set_config('pardal.expected_paused', :'expected_paused', true);
DO $guard$ DECLARE current_mode text; current_paused boolean; BEGIN
  IF current_database() <> current_setting('pardal.confirm_db') THEN RAISE EXCEPTION 'Database confirmation mismatch'; END IF;
  SELECT mode, writes_paused INTO current_mode, current_paused FROM workspace_cutover_events ORDER BY id DESC LIMIT 1;
  current_mode := COALESCE(current_mode, 'legacy');
  current_paused := COALESCE(current_paused, false);
  IF current_mode <> current_setting('pardal.expected_mode')
     OR current_paused <> current_setting('pardal.expected_paused')::boolean THEN
    RAISE EXCEPTION 'Cutover state changed; rerun status';
  END IF;
END $guard$;
INSERT INTO workspace_cutover_events (mode, writes_paused, actor, reason)
VALUES (:'next_mode', :'next_paused'::boolean, :'actor', :'reason');
COMMIT;
