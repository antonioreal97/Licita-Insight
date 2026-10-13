-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: medir a reversão do enforcement W4 sem remover workspace_id nem dados.
-- Pré-condições: aplicação/ensaio parado; somente um Espaço padrão por usuário (condição do ensaio).
-- Transação: não; cada comando é autocontido para permitir medir e diagnosticar a reversão.
-- Desfazer o rollback: reaplicar w4_enforce.sql após refazer índices W2 que forem necessários.

ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_fit_workspace_check;
ALTER TABLE email_delivery_notifications DROP CONSTRAINT IF EXISTS email_delivery_notifications_delivery_workspace_fk;
ALTER TABLE email_delivery_notifications DROP CONSTRAINT IF EXISTS email_delivery_notifications_notification_workspace_fk;

ALTER TABLE saved_tenders DROP CONSTRAINT IF EXISTS saved_tenders_workspace_tender_pk;
ALTER TABLE recommendation_dismissals DROP CONSTRAINT IF EXISTS recommendation_dismissals_workspace_tender_pk;
ALTER TABLE recommendation_interest_profiles DROP CONSTRAINT IF EXISTS recommendation_interest_profiles_workspace_pk;
ALTER TABLE user_recommendations DROP CONSTRAINT IF EXISTS user_recommendations_workspace_tender_pk;

ALTER TABLE company_tender_fits ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE saved_tenders ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE saved_searches ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE notifications ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE email_delivery_notifications ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE recommendation_events ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE recommendation_dismissals ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE recommendation_interest_profiles ALTER COLUMN workspace_id DROP NOT NULL;
ALTER TABLE user_recommendations ALTER COLUMN workspace_id DROP NOT NULL;

ALTER TABLE saved_tenders ADD CONSTRAINT saved_tenders_user_id_tender_id_pk PRIMARY KEY (user_id, tender_id);
ALTER TABLE recommendation_dismissals ADD CONSTRAINT recommendation_dismissals_user_id_tender_id_pk PRIMARY KEY (user_id, tender_id);
ALTER TABLE recommendation_interest_profiles ADD CONSTRAINT recommendation_interest_profiles_pkey PRIMARY KEY (user_id);
ALTER TABLE user_recommendations ADD CONSTRAINT user_recommendations_user_id_tender_id_pk PRIMARY KEY (user_id, tender_id);

CREATE UNIQUE INDEX IF NOT EXISTS saved_tenders_workspace_tender_uidx ON saved_tenders (workspace_id, tender_id);
CREATE UNIQUE INDEX IF NOT EXISTS recommendation_dismissals_workspace_tender_uidx ON recommendation_dismissals (workspace_id, tender_id);
CREATE UNIQUE INDEX IF NOT EXISTS recommendation_interest_profiles_workspace_uidx ON recommendation_interest_profiles (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS user_recommendations_workspace_tender_uidx ON user_recommendations (workspace_id, tender_id);

CREATE UNIQUE INDEX IF NOT EXISTS company_tender_fits_cache_uidx
  ON company_tender_fits (user_id, profile_version, tender_id, requested_model, prompt_version);
CREATE UNIQUE INDEX IF NOT EXISTS saved_searches_user_query_active_uidx
  ON saved_searches (user_id, query) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_uidx
  ON notifications (user_id, dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_dedupe_uidx
  ON email_deliveries (dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_dedupe_uidx
  ON ai_jobs (dedupe_key);

DROP INDEX IF EXISTS email_deliveries_account_dedupe_uidx;
DROP INDEX IF EXISTS ai_jobs_global_dedupe_uidx;
