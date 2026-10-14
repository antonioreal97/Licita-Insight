\set ON_ERROR_STOP on
-- Definitive W3 invariant report. Only names and counts leave the database.
SELECT set_config('pardal.confirm_db', :'confirm_db', true);
DO $guard$ BEGIN
 IF current_database() <> current_setting('pardal.confirm_db') THEN
  RAISE EXCEPTION 'Invariant database confirmation mismatch';
 END IF;
END $guard$;
CREATE TEMP TABLE IF NOT EXISTS cutover_invariant_results (
  invariant_name text PRIMARY KEY,
  failure_count bigint NOT NULL
) ON COMMIT DROP;
TRUNCATE cutover_invariant_results;

INSERT INTO cutover_invariant_results VALUES
  ('one_default_workspace_per_user', (
    SELECT abs((SELECT count(*) FROM users) - (SELECT count(*) FROM workspaces WHERE is_default)) + count(*)
    FROM (SELECT owner_user_id FROM workspaces WHERE is_default GROUP BY 1 HAVING count(*) <> 1) invalid
  )),
  ('one_owner_membership_per_user', (
    SELECT count(*) FROM (
      SELECT w.owner_user_id FROM workspaces w
      LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = w.owner_user_id AND m.role = 'owner'
      WHERE w.is_default GROUP BY w.owner_user_id HAVING count(m.workspace_id) <> 1
    ) invalid
  )),
  ('zero_unscoped_context_rows', (
    SELECT
      (SELECT count(*) FROM company_tender_fits WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM saved_tenders WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM saved_searches WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM notifications WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM email_delivery_notifications WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM recommendation_events WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM recommendation_dismissals WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM recommendation_interest_profiles WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM user_recommendations WHERE workspace_id IS NULL) +
      (SELECT count(*) FROM ai_jobs WHERE kind = 'fit' AND workspace_id IS NULL)
  )),
  ('zero_cross_owner_links', (
    SELECT count(*) FROM (
      SELECT user_id, workspace_id FROM company_tender_fits
      UNION ALL SELECT user_id, workspace_id FROM saved_tenders
      UNION ALL SELECT user_id, workspace_id FROM saved_searches
      UNION ALL SELECT user_id, workspace_id FROM notifications
      UNION ALL SELECT user_id, workspace_id FROM recommendation_events
      UNION ALL SELECT user_id, workspace_id FROM recommendation_dismissals
      UNION ALL SELECT user_id, workspace_id FROM recommendation_interest_profiles
      UNION ALL SELECT user_id, workspace_id FROM user_recommendations
      UNION ALL SELECT user_id, workspace_id FROM ai_jobs WHERE kind = 'fit'
    ) scoped
    LEFT JOIN workspace_members member
      ON member.workspace_id = scoped.workspace_id AND member.user_id = scoped.user_id AND member.role = 'owner'
    WHERE member.workspace_id IS NULL
  )),
  ('zero_context_delivery_mismatch', (
    SELECT count(*) FROM email_delivery_notifications link
    JOIN notifications notification ON notification.id = link.notification_id
    JOIN email_deliveries delivery ON delivery.id = link.delivery_id
    WHERE link.workspace_id <> notification.workspace_id
       OR delivery.workspace_id IS DISTINCT FROM link.workspace_id
       OR notification.user_id <> delivery.user_id
  )),
  ('zero_profile_drift', (
    SELECT count(*) FROM workspaces w
    LEFT JOIN company_profiles cp ON cp.user_id = w.owner_user_id
    LEFT JOIN workspace_profiles wp ON wp.workspace_id = w.id
    WHERE w.is_default AND (
      (cp.user_id IS NULL) IS DISTINCT FROM (wp.workspace_id IS NULL)
      OR (cp.user_id IS NOT NULL AND (wp.source_updated_at IS DISTINCT FROM cp.updated_at
        OR wp.last_alert_at IS DISTINCT FROM cp.last_alert_at))
    )
  )),
  ('zero_international_preference_drift', (
    SELECT count(*) FROM workspaces w JOIN users u ON u.id = w.owner_user_id
    WHERE w.is_default AND w.show_international_opportunities IS DISTINCT FROM u.show_international_opportunities
  )),
  ('zero_workspace_duplicates', (
    SELECT count(*) FROM (
      SELECT workspace_id, tender_id FROM saved_tenders GROUP BY 1,2 HAVING count(*) > 1
      UNION ALL SELECT workspace_id, tender_id FROM recommendation_dismissals GROUP BY 1,2 HAVING count(*) > 1
      UNION ALL SELECT workspace_id, tender_id FROM user_recommendations GROUP BY 1,2 HAVING count(*) > 1
      UNION ALL SELECT workspace_id, NULL::text FROM recommendation_interest_profiles GROUP BY 1 HAVING count(*) > 1
    ) duplicates
  ));

DO $check$
DECLARE total_failures bigint;
BEGIN
  SELECT sum(failure_count) INTO total_failures FROM cutover_invariant_results;
  IF total_failures <> 0 THEN
    RAISE EXCEPTION 'invariantes do corte falharam (% falhas)', total_failures;
  END IF;
END
$check$;

\pset tuples_only on
\pset format unaligned
\pset fieldsep '\t'
SELECT invariant_name, failure_count FROM cutover_invariant_results ORDER BY invariant_name;
