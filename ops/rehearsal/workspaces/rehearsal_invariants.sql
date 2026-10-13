\set ON_ERROR_STOP on
-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Apoio da ferramenta: falha com tolerância zero e, opcionalmente, emite somente nome/boolean/contagem.
DO $guard$
BEGIN
  IF current_database() !~ '_rehearsal$' THEN
    RAISE EXCEPTION 'Recusado: rehearsal_invariants.sql é rascunho de ensaio e só roda em banco terminado em _rehearsal (banco atual: %).', current_database();
  END IF;
END
$guard$;

CREATE TEMP TABLE IF NOT EXISTS rehearsal_invariant_results (
  invariant_name text PRIMARY KEY,
  failure_count bigint NOT NULL
) ON COMMIT PRESERVE ROWS;
TRUNCATE rehearsal_invariant_results;

INSERT INTO rehearsal_invariant_results VALUES
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
  SELECT sum(failure_count) INTO total_failures FROM rehearsal_invariant_results;
  IF total_failures <> 0 THEN
    RAISE EXCEPTION 'invariantes do ensaio falharam (% falhas)', total_failures;
  END IF;
END
$check$;

\if :{?invariant_output}
  \if :invariant_output
    \pset tuples_only on
    \pset format unaligned
    \pset fieldsep '\t'
    SELECT invariant_name, (failure_count = 0)::text, failure_count
    FROM rehearsal_invariant_results ORDER BY invariant_name;
  \endif
\endif
