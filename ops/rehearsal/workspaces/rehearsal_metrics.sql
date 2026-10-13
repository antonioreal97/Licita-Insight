\set ON_ERROR_STOP on
-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Apoio da ferramenta: a saída contém apenas nome técnico, contagem, tamanho e hash agregado irreversível.
DO $guard$
BEGIN
  IF current_database() !~ '_rehearsal$' THEN
    RAISE EXCEPTION 'Recusado: rehearsal_metrics.sql é rascunho de ensaio e só roda em banco terminado em _rehearsal (banco atual: %).', current_database();
  END IF;
END
$guard$;

\pset tuples_only on
\pset format unaligned
\pset fieldsep '\t'

SELECT table_name, row_count, total_bytes, checksum
FROM (
  SELECT 'users'::text table_name, count(*)::bigint row_count, pg_total_relation_size('users')::bigint total_bytes,
    md5(COALESCE(string_agg(md5((to_jsonb(row))::text), '' ORDER BY md5((to_jsonb(row))::text)), '')) checksum FROM users row
  UNION ALL SELECT 'company_profiles', count(*), pg_total_relation_size('company_profiles'),
    md5(COALESCE(string_agg(md5((to_jsonb(row))::text), '' ORDER BY md5((to_jsonb(row))::text)), '')) FROM company_profiles row
  UNION ALL SELECT 'company_tender_fits', count(*), pg_total_relation_size('company_tender_fits'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM company_tender_fits row
  UNION ALL SELECT 'saved_tenders', count(*), pg_total_relation_size('saved_tenders'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM saved_tenders row
  UNION ALL SELECT 'saved_searches', count(*), pg_total_relation_size('saved_searches'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM saved_searches row
  UNION ALL SELECT 'notifications', count(*), pg_total_relation_size('notifications'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM notifications row
  UNION ALL SELECT 'email_deliveries', count(*), pg_total_relation_size('email_deliveries'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM email_deliveries row
  UNION ALL SELECT 'email_delivery_notifications', count(*), pg_total_relation_size('email_delivery_notifications'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM email_delivery_notifications row
  UNION ALL SELECT 'recommendation_events', count(*), pg_total_relation_size('recommendation_events'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM recommendation_events row
  UNION ALL SELECT 'recommendation_dismissals', count(*), pg_total_relation_size('recommendation_dismissals'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM recommendation_dismissals row
  UNION ALL SELECT 'recommendation_interest_profiles', count(*), pg_total_relation_size('recommendation_interest_profiles'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM recommendation_interest_profiles row
  UNION ALL SELECT 'user_recommendations', count(*), pg_total_relation_size('user_recommendations'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM user_recommendations row
  UNION ALL SELECT 'ai_jobs', count(*), pg_total_relation_size('ai_jobs'),
    md5(COALESCE(string_agg(md5((to_jsonb(row) - 'workspace_id')::text), '' ORDER BY md5((to_jsonb(row) - 'workspace_id')::text)), '')) FROM ai_jobs row
) metrics
ORDER BY table_name;
