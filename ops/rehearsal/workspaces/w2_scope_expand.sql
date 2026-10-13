-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: adicionar workspace_id anulável às tabelas contextuais do schema real e FKs NOT VALID.
-- Pré-condições: W1 aplicado; schema legado migrado até a versão corrente.
-- Transação: sim. Índices concorrentes ficam em w2_scope_expand_indexes.sql, fora de transação.
-- Desfazer: executar w2_scope_expand_rollback.sql depois de reverter W4 e W3.

BEGIN;

ALTER TABLE company_tender_fits ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE saved_tenders ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE saved_searches ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE email_delivery_notifications ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE recommendation_events ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE recommendation_dismissals ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE recommendation_interest_profiles ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE user_recommendations ADD COLUMN IF NOT EXISTS workspace_id text;
ALTER TABLE ai_jobs ADD COLUMN IF NOT EXISTS workspace_id text;

DO $w2$
DECLARE
  target_table text;
  constraint_name text;
  delete_action text;
BEGIN
  FOR target_table, constraint_name, delete_action IN
    SELECT * FROM (VALUES
      ('company_tender_fits', 'company_tender_fits_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('saved_tenders', 'saved_tenders_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('saved_searches', 'saved_searches_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('notifications', 'notifications_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('email_deliveries', 'email_deliveries_workspace_id_workspaces_id_fk', 'SET NULL'),
      ('email_delivery_notifications', 'email_delivery_notifications_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('recommendation_events', 'recommendation_events_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('recommendation_dismissals', 'recommendation_dismissals_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('recommendation_interest_profiles', 'recommendation_interest_profiles_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('user_recommendations', 'user_recommendations_workspace_id_workspaces_id_fk', 'CASCADE'),
      ('ai_jobs', 'ai_jobs_workspace_id_workspaces_id_fk', 'SET NULL')
    ) AS entries(table_name, fk_name, on_delete)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = constraint_name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE %s NOT VALID',
        target_table, constraint_name, delete_action
      );
    END IF;
  END LOOP;
END
$w2$;

COMMIT;
