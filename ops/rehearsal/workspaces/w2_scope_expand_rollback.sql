\set ON_ERROR_STOP on
-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: medir a reversão completa de W2 após W4/W3, removendo somente objetos nomeados por este ensaio.
-- Pré-condições: W4 e W3 revertidos; nenhuma transação explícita aberta.
-- Transação: não, porque os índices são removidos com DROP INDEX CONCURRENTLY.
-- Desfazer o rollback: reaplicar w2_scope_expand.sql e w2_scope_expand_indexes.sql.

DO $guard$
BEGIN
  IF current_database() !~ '_rehearsal$' THEN
    RAISE EXCEPTION 'Recusado: w2_scope_expand_rollback.sql é rascunho de ensaio e só roda em banco terminado em _rehearsal (banco atual: %).', current_database();
  END IF;
END
$guard$;

DROP INDEX CONCURRENTLY IF EXISTS company_tender_fits_workspace_idx;
DROP INDEX CONCURRENTLY IF EXISTS company_tender_fits_workspace_cache_uidx;
DROP INDEX CONCURRENTLY IF EXISTS saved_tenders_workspace_saved_idx;
DROP INDEX CONCURRENTLY IF EXISTS saved_tenders_workspace_tender_uidx;
DROP INDEX CONCURRENTLY IF EXISTS saved_searches_workspace_updated_idx;
DROP INDEX CONCURRENTLY IF EXISTS saved_searches_workspace_query_active_uidx;
DROP INDEX CONCURRENTLY IF EXISTS notifications_workspace_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS notifications_workspace_dedupe_uidx;
DROP INDEX CONCURRENTLY IF EXISTS email_deliveries_workspace_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS email_deliveries_id_workspace_uidx;
DROP INDEX CONCURRENTLY IF EXISTS email_deliveries_workspace_dedupe_uidx;
DROP INDEX CONCURRENTLY IF EXISTS email_delivery_notifications_workspace_idx;
DROP INDEX CONCURRENTLY IF EXISTS notifications_id_workspace_uidx;
DROP INDEX CONCURRENTLY IF EXISTS recommendation_events_workspace_time_idx;
DROP INDEX CONCURRENTLY IF EXISTS recommendation_dismissals_workspace_tender_uidx;
DROP INDEX CONCURRENTLY IF EXISTS recommendation_interest_profiles_workspace_uidx;
DROP INDEX CONCURRENTLY IF EXISTS user_recommendations_workspace_tender_uidx;
DROP INDEX CONCURRENTLY IF EXISTS user_recommendations_workspace_rank_idx;
DROP INDEX CONCURRENTLY IF EXISTS ai_jobs_workspace_created_idx;
DROP INDEX CONCURRENTLY IF EXISTS ai_jobs_workspace_dedupe_uidx;

ALTER TABLE company_tender_fits DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE saved_tenders DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE saved_searches DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE email_deliveries DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE email_delivery_notifications DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE recommendation_events DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE recommendation_dismissals DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE recommendation_interest_profiles DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE user_recommendations DROP COLUMN IF EXISTS workspace_id;
ALTER TABLE ai_jobs DROP COLUMN IF EXISTS workspace_id;
