\set ON_ERROR_STOP on
-- Count only rows that W3 must reconcile; no row content leaves PostgreSQL.
SELECT (
  (SELECT count(*) FROM users u LEFT JOIN workspaces w ON w.owner_user_id=u.id AND w.is_default
    WHERE w.id IS NULL OR w.show_international_opportunities IS DISTINCT FROM u.show_international_opportunities)
  + (SELECT count(*) FROM company_profiles cp LEFT JOIN workspaces w ON w.owner_user_id=cp.user_id AND w.is_default
      LEFT JOIN workspace_profiles wp ON wp.workspace_id=w.id
      WHERE wp.workspace_id IS NULL OR wp.source_updated_at IS DISTINCT FROM cp.updated_at
        OR wp.last_alert_at IS DISTINCT FROM cp.last_alert_at OR wp.profile_version < cp.version)
  + (SELECT count(*) FROM workspaces w LEFT JOIN company_profiles cp ON cp.user_id=w.owner_user_id
      LEFT JOIN workspace_profiles wp ON wp.workspace_id=w.id
      WHERE w.is_default AND cp.user_id IS NULL AND wp.workspace_id IS NOT NULL)
  + (SELECT count(*) FROM company_tender_fits WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM saved_tenders WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM saved_searches WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM notifications WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM email_delivery_notifications WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM recommendation_events WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM recommendation_dismissals WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM recommendation_interest_profiles WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM user_recommendations WHERE workspace_id IS NULL)
  + (SELECT count(*) FROM ai_jobs WHERE kind='fit' AND workspace_id IS NULL)
)::bigint;
