\set ON_ERROR_STOP on
WITH last_cut AS (
  SELECT created_at AS at FROM workspace_cutover_events WHERE reason LIKE 'cut:%' ORDER BY id DESC LIMIT 1
), scope_nulls AS (
  SELECT count(*) AS total, count(*) FILTER (WHERE created_at > (SELECT at FROM last_cut)) AS since_cut
  FROM (
    SELECT created_at FROM company_tender_fits WHERE workspace_id IS NULL
    UNION ALL SELECT saved_at FROM saved_tenders WHERE workspace_id IS NULL
    UNION ALL SELECT created_at FROM saved_searches WHERE workspace_id IS NULL
    UNION ALL SELECT created_at FROM notifications WHERE workspace_id IS NULL
    UNION ALL SELECT n.created_at FROM email_delivery_notifications l
      JOIN notifications n ON n.id = l.notification_id WHERE l.workspace_id IS NULL
    UNION ALL SELECT occurred_at FROM recommendation_events WHERE workspace_id IS NULL
    UNION ALL SELECT dismissed_at FROM recommendation_dismissals WHERE workspace_id IS NULL
    UNION ALL SELECT updated_at FROM recommendation_interest_profiles WHERE workspace_id IS NULL
    UNION ALL SELECT generated_at FROM user_recommendations WHERE workspace_id IS NULL
    UNION ALL SELECT created_at FROM ai_jobs WHERE kind = 'fit' AND workspace_id IS NULL
  ) rows
)
SELECT 'mode=' || COALESCE((SELECT mode FROM workspace_cutover_events ORDER BY id DESC LIMIT 1), 'legacy')
UNION ALL SELECT 'writes_paused=' || COALESCE((SELECT writes_paused::text FROM workspace_cutover_events ORDER BY id DESC LIMIT 1), 'false')
UNION ALL SELECT 'w4=' || EXISTS(SELECT 1 FROM pg_constraint WHERE conname = 'ai_jobs_fit_workspace_check')::text
UNION ALL SELECT 'nondefault_workspaces=' || count(*)::text FROM workspaces WHERE NOT is_default
UNION ALL SELECT 'null_context_total=' || total::text FROM scope_nulls
UNION ALL SELECT 'null_context_since_cut=' || since_cut::text FROM scope_nulls
UNION ALL SELECT 'last_cut_at=' || COALESCE((SELECT at::text FROM last_cut), 'never');
SELECT 'event=' || id || ':' || mode || ':' || writes_paused::text || ':' || created_at::text
FROM workspace_cutover_events ORDER BY id DESC LIMIT 5;
