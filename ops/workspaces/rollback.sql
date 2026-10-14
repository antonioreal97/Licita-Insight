\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtextextended('licitai:workspace-cutover', 0));
\ir reverse-profile.sql
INSERT INTO workspace_cutover_events (mode, writes_paused, actor, reason, details)
VALUES ('legacy', false, :'actor', :'reason',
  jsonb_build_object('profiles_copied', (SELECT count(*) FROM workspaces w
    JOIN workspace_profiles p ON p.workspace_id = w.id WHERE w.is_default),
    'profiles_deleted', (SELECT count(*) FROM workspaces w
    LEFT JOIN workspace_profiles p ON p.workspace_id = w.id WHERE w.is_default AND p.workspace_id IS NULL)));
COMMIT;
