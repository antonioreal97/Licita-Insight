\set ON_ERROR_STOP on
-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: criar índices de workspace e futuras unicidades sem bloquear escrita durante a carga.
-- Pré-condições: w2_scope_expand.sql aplicado e nenhuma transação explícita aberta.
-- Transação: não; CREATE INDEX CONCURRENTLY não pode rodar dentro de BEGIN/COMMIT.
-- Desfazer: w2_scope_expand_rollback.sql remove estes índices pelos nomes explícitos.

DO $guard$
BEGIN
  IF current_database() !~ '_rehearsal$' THEN
    RAISE EXCEPTION 'Recusado: w2_scope_expand_indexes.sql é rascunho de ensaio e só roda em banco terminado em _rehearsal (banco atual: %).', current_database();
  END IF;
END
$guard$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS company_tender_fits_workspace_idx
  ON company_tender_fits (workspace_id, checked_at);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS company_tender_fits_workspace_cache_uidx
  ON company_tender_fits (workspace_id, profile_version, tender_id, requested_model, prompt_version)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS saved_tenders_workspace_saved_idx
  ON saved_tenders (workspace_id, saved_at);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS saved_tenders_workspace_tender_uidx
  ON saved_tenders (workspace_id, tender_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS saved_searches_workspace_updated_idx
  ON saved_searches (workspace_id, updated_at);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS saved_searches_workspace_query_active_uidx
  ON saved_searches (workspace_id, query)
  WHERE workspace_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS notifications_workspace_created_idx
  ON notifications (workspace_id, created_at);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS notifications_workspace_dedupe_uidx
  ON notifications (workspace_id, dedupe_key) WHERE workspace_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS email_deliveries_workspace_created_idx
  ON email_deliveries (workspace_id, created_at) WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS email_deliveries_id_workspace_uidx
  ON email_deliveries (id, workspace_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS email_deliveries_workspace_dedupe_uidx
  ON email_deliveries (workspace_id, dedupe_key) WHERE workspace_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS email_delivery_notifications_workspace_idx
  ON email_delivery_notifications (workspace_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS notifications_id_workspace_uidx
  ON notifications (id, workspace_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS recommendation_events_workspace_time_idx
  ON recommendation_events (workspace_id, occurred_at);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS recommendation_dismissals_workspace_tender_uidx
  ON recommendation_dismissals (workspace_id, tender_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS recommendation_interest_profiles_workspace_uidx
  ON recommendation_interest_profiles (workspace_id);
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS user_recommendations_workspace_tender_uidx
  ON user_recommendations (workspace_id, tender_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_recommendations_workspace_rank_idx
  ON user_recommendations (workspace_id, rank);

CREATE INDEX CONCURRENTLY IF NOT EXISTS ai_jobs_workspace_created_idx
  ON ai_jobs (workspace_id, created_at) WHERE workspace_id IS NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ai_jobs_workspace_dedupe_uidx
  ON ai_jobs (workspace_id, dedupe_key) WHERE workspace_id IS NOT NULL;
