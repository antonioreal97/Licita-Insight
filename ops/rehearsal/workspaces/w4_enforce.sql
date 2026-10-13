\set ON_ERROR_STOP on
-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: validar FKs e invariantes, então impor NOT NULL e unicidades por Espaço.
-- Pré-condições: W3 delta concluído sob bloqueio; nenhuma escrita concorrente nas tabelas de origem.
-- Transação: sim. Falha quantitativa aborta toda a etapa antes de qualquer enforcement persistente.
-- Desfazer: w4_enforce_rollback.sql restaura as chaves legadas sem apagar coluna ou tabela legada.

\if :{?w4_manage_transaction}
\else
  \set w4_manage_transaction true
\endif

\if :w4_manage_transaction
BEGIN;
\endif

-- Fora do \if: com w4_manage_transaction=false a guarda roda dentro da transação do chamador.
DO $guard$
BEGIN
  IF current_database() !~ '_rehearsal$' THEN
    RAISE EXCEPTION 'Recusado: w4_enforce.sql é rascunho de ensaio e só roda em banco terminado em _rehearsal (banco atual: %).', current_database();
  END IF;
END
$guard$;

DO $invariants$
DECLARE
  failures bigint;
BEGIN
  SELECT count(*) INTO failures FROM (
    SELECT owner_user_id FROM workspaces WHERE is_default GROUP BY owner_user_id HAVING count(*) <> 1
  ) invalid;
  IF failures <> 0 OR (SELECT count(*) FROM users) <> (SELECT count(*) FROM workspaces WHERE is_default) THEN
    RAISE EXCEPTION 'W4 abortado: exatamente um Espaço padrão por usuário não foi provado';
  END IF;

  SELECT count(*) INTO failures FROM (
    SELECT w.owner_user_id
    FROM workspaces w
    LEFT JOIN workspace_members m
      ON m.workspace_id = w.id AND m.user_id = w.owner_user_id AND m.role = 'owner'
    WHERE w.is_default
    GROUP BY w.owner_user_id
    HAVING count(m.workspace_id) <> 1
  ) invalid;
  IF failures <> 0 THEN
    RAISE EXCEPTION 'W4 abortado: membership owner ausente ou duplicada';
  END IF;

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
  INTO failures;
  IF failures <> 0 THEN
    RAISE EXCEPTION 'W4 abortado: há linhas contextuais sem workspace_id (%)', failures;
  END IF;

  SELECT count(*) INTO failures
  FROM (
    SELECT row.user_id, row.workspace_id FROM company_tender_fits row
    UNION ALL SELECT row.user_id, row.workspace_id FROM saved_tenders row
    UNION ALL SELECT row.user_id, row.workspace_id FROM saved_searches row
    UNION ALL SELECT row.user_id, row.workspace_id FROM notifications row
    UNION ALL SELECT row.user_id, row.workspace_id FROM recommendation_events row
    UNION ALL SELECT row.user_id, row.workspace_id FROM recommendation_dismissals row
    UNION ALL SELECT row.user_id, row.workspace_id FROM recommendation_interest_profiles row
    UNION ALL SELECT row.user_id, row.workspace_id FROM user_recommendations row
    UNION ALL SELECT row.user_id, row.workspace_id FROM ai_jobs row WHERE row.kind = 'fit'
  ) scoped
  LEFT JOIN workspace_members member
    ON member.workspace_id = scoped.workspace_id AND member.user_id = scoped.user_id AND member.role = 'owner'
  WHERE member.workspace_id IS NULL;
  IF failures <> 0 THEN
    RAISE EXCEPTION 'W4 abortado: vínculo com Espaço de outro usuário (%)', failures;
  END IF;

  SELECT count(*) INTO failures
  FROM email_delivery_notifications link
  JOIN notifications notification ON notification.id = link.notification_id
  JOIN email_deliveries delivery ON delivery.id = link.delivery_id
  WHERE link.workspace_id <> notification.workspace_id
     OR delivery.workspace_id IS DISTINCT FROM link.workspace_id
     OR notification.user_id <> delivery.user_id;
  IF failures <> 0 THEN
    RAISE EXCEPTION 'W4 abortado: entrega contextual mistura usuário ou Espaço (%)', failures;
  END IF;

  SELECT count(*) INTO failures FROM (
    SELECT workspace_id, tender_id FROM saved_tenders GROUP BY 1, 2 HAVING count(*) > 1
    UNION ALL SELECT workspace_id, tender_id FROM recommendation_dismissals GROUP BY 1, 2 HAVING count(*) > 1
    UNION ALL SELECT workspace_id, tender_id FROM user_recommendations GROUP BY 1, 2 HAVING count(*) > 1
    UNION ALL SELECT workspace_id, NULL::text FROM recommendation_interest_profiles GROUP BY 1 HAVING count(*) > 1
  ) duplicates;
  IF failures <> 0 THEN
    RAISE EXCEPTION 'W4 abortado: colisão de nova chave por Espaço (%)', failures;
  END IF;
END
$invariants$;

DO $validate_fks$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT conrelid::regclass AS table_name, conname
    FROM pg_constraint
    WHERE conname IN (
      'company_tender_fits_workspace_id_workspaces_id_fk',
      'saved_tenders_workspace_id_workspaces_id_fk',
      'saved_searches_workspace_id_workspaces_id_fk',
      'notifications_workspace_id_workspaces_id_fk',
      'email_deliveries_workspace_id_workspaces_id_fk',
      'email_delivery_notifications_workspace_id_workspaces_id_fk',
      'recommendation_events_workspace_id_workspaces_id_fk',
      'recommendation_dismissals_workspace_id_workspaces_id_fk',
      'recommendation_interest_profiles_workspace_id_workspaces_id_fk',
      'user_recommendations_workspace_id_workspaces_id_fk',
      'ai_jobs_workspace_id_workspaces_id_fk'
    ) AND NOT convalidated
  LOOP
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', item.table_name, item.conname);
  END LOOP;
END
$validate_fks$;

DO $email_scope_fks$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_delivery_notifications_delivery_workspace_fk') THEN
    ALTER TABLE email_delivery_notifications
      ADD CONSTRAINT email_delivery_notifications_delivery_workspace_fk
      FOREIGN KEY (delivery_id, workspace_id)
      REFERENCES email_deliveries(id, workspace_id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_delivery_notifications_notification_workspace_fk') THEN
    ALTER TABLE email_delivery_notifications
      ADD CONSTRAINT email_delivery_notifications_notification_workspace_fk
      FOREIGN KEY (notification_id, workspace_id)
      REFERENCES notifications(id, workspace_id) ON DELETE CASCADE NOT VALID;
  END IF;
  ALTER TABLE email_delivery_notifications
    VALIDATE CONSTRAINT email_delivery_notifications_delivery_workspace_fk;
  ALTER TABLE email_delivery_notifications
    VALIDATE CONSTRAINT email_delivery_notifications_notification_workspace_fk;
END
$email_scope_fks$;

ALTER TABLE company_tender_fits ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE saved_tenders ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE saved_searches ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE email_delivery_notifications ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE recommendation_events ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE recommendation_dismissals ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE recommendation_interest_profiles ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE user_recommendations ALTER COLUMN workspace_id SET NOT NULL;

DO $constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_jobs_fit_workspace_check') THEN
    ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_fit_workspace_check
      CHECK (kind <> 'fit' OR workspace_id IS NOT NULL) NOT VALID;
  END IF;
  ALTER TABLE ai_jobs VALIDATE CONSTRAINT ai_jobs_fit_workspace_check;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_tenders_user_id_tender_id_pk') THEN
    ALTER TABLE saved_tenders DROP CONSTRAINT saved_tenders_user_id_tender_id_pk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'saved_tenders_workspace_tender_pk') THEN
    ALTER TABLE saved_tenders ADD CONSTRAINT saved_tenders_workspace_tender_pk
      PRIMARY KEY USING INDEX saved_tenders_workspace_tender_uidx;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_dismissals_user_id_tender_id_pk') THEN
    ALTER TABLE recommendation_dismissals DROP CONSTRAINT recommendation_dismissals_user_id_tender_id_pk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_dismissals_workspace_tender_pk') THEN
    ALTER TABLE recommendation_dismissals ADD CONSTRAINT recommendation_dismissals_workspace_tender_pk
      PRIMARY KEY USING INDEX recommendation_dismissals_workspace_tender_uidx;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_interest_profiles_pkey') THEN
    ALTER TABLE recommendation_interest_profiles DROP CONSTRAINT recommendation_interest_profiles_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recommendation_interest_profiles_workspace_pk') THEN
    ALTER TABLE recommendation_interest_profiles ADD CONSTRAINT recommendation_interest_profiles_workspace_pk
      PRIMARY KEY USING INDEX recommendation_interest_profiles_workspace_uidx;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_recommendations_user_id_tender_id_pk') THEN
    ALTER TABLE user_recommendations DROP CONSTRAINT user_recommendations_user_id_tender_id_pk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_recommendations_workspace_tender_pk') THEN
    ALTER TABLE user_recommendations ADD CONSTRAINT user_recommendations_workspace_tender_pk
      PRIMARY KEY USING INDEX user_recommendations_workspace_tender_uidx;
  END IF;
END
$constraints$;

DROP INDEX IF EXISTS company_tender_fits_cache_uidx;
DROP INDEX IF EXISTS saved_searches_user_query_active_uidx;
DROP INDEX IF EXISTS notifications_user_dedupe_uidx;
DROP INDEX IF EXISTS email_deliveries_dedupe_uidx;
DROP INDEX IF EXISTS ai_jobs_dedupe_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_account_dedupe_uidx
  ON email_deliveries (dedupe_key) WHERE workspace_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_global_dedupe_uidx
  ON ai_jobs (dedupe_key) WHERE workspace_id IS NULL;

\if :w4_manage_transaction
COMMIT;
\endif
