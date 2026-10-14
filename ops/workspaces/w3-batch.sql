\set ON_ERROR_STOP on
-- W3 outside the maintenance window. Use cutover.sh batch to set the explicit target.
\set w3_phase batch
\if :{?w3_from_user_id}
\else
  \set w3_from_user_id ''
\endif
\if :{?w3_to_user_id}
\else
  \set w3_to_user_id ''
\endif
BEGIN;
SET LOCAL lock_timeout = '5s';
\ir w3-core.sql
WITH mark AS (
  INSERT INTO workspace_backfill_checkpoints(phase, target_users, profiles_reconciled)
  SELECT 'batch', (SELECT count(*) FROM w3_target_users), (SELECT count(*) FROM w3_reconcile_profiles)
  RETURNING id
)
INSERT INTO workspace_backfill_checkpoint_counts(checkpoint_id, table_name, row_count)
SELECT mark.id, counts.table_name, counts.row_count
FROM mark CROSS JOIN LATERAL (VALUES
  ('workspaces', (SELECT count(*) FROM workspaces w JOIN w3_target_users t ON t.workspace_id=w.id)),
  ('profiles', (SELECT count(*) FROM workspace_profiles p JOIN w3_target_users t ON t.workspace_id=p.workspace_id)),
  ('company_tender_fits', (SELECT count(*) FROM company_tender_fits r JOIN w3_target_users t ON t.user_id=r.user_id)),
  ('saved_tenders', (SELECT count(*) FROM saved_tenders r JOIN w3_target_users t ON t.user_id=r.user_id)),
  ('saved_searches', (SELECT count(*) FROM saved_searches r JOIN w3_target_users t ON t.user_id=r.user_id)),
  ('notifications', (SELECT count(*) FROM notifications r JOIN w3_target_users t ON t.user_id=r.user_id)),
  ('recommendation_events', (SELECT count(*) FROM recommendation_events r JOIN w3_target_users t ON t.user_id=r.user_id)),
  ('recommendation_dismissals', (SELECT count(*) FROM recommendation_dismissals r JOIN w3_target_users t ON t.user_id=r.user_id)),
  ('recommendation_interest_profiles', (SELECT count(*) FROM recommendation_interest_profiles r JOIN w3_target_users t ON t.user_id=r.user_id)),
  ('user_recommendations', (SELECT count(*) FROM user_recommendations r JOIN w3_target_users t ON t.user_id=r.user_id)),
  ('fit_jobs', (SELECT count(*) FROM ai_jobs r JOIN w3_target_users t ON t.user_id=r.user_id WHERE r.kind='fit'))
) AS counts(table_name, row_count);
COMMIT;
