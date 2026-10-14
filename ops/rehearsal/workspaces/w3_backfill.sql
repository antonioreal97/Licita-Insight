\set ON_ERROR_STOP on
-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: backfill único, repetível e sem recálculo dos campos legados.
-- Pré-condições: W1, W2 e índices W2 aplicados. O lote usa faixas de user_id; o delta roda sob locks do runner.
-- Transação: sim por faixa/passe. Variáveis psql opcionais: w3_phase=batch|delta, w3_from_user_id, w3_to_user_id.
-- Desfazer: w3_backfill_rollback.sql limpa somente ids determinísticos e workspace_id preenchidos pelo ensaio.

\if :{?w3_phase}
\else
  \set w3_phase 'batch'
\endif
\if :{?w3_from_user_id}
\else
  \set w3_from_user_id ''
\endif
\if :{?w3_to_user_id}
\else
  \set w3_to_user_id ''
\endif
\if :{?w3_manage_transaction}
\else
  \set w3_manage_transaction true
\endif

\if :w3_manage_transaction
BEGIN;
\endif

-- Fora do \if: com w3_manage_transaction=false a guarda roda dentro da transação do chamador.
DO $guard$
BEGIN
  IF current_database() !~ '_rehearsal$' THEN
    RAISE EXCEPTION 'Recusado: w3_backfill.sql é rascunho de ensaio e só roda em banco terminado em _rehearsal (banco atual: %).', current_database();
  END IF;
END
$guard$;

CREATE TEMP TABLE w3_target_users (
  user_id text PRIMARY KEY,
  workspace_id text NOT NULL
) ON COMMIT DROP;

INSERT INTO w3_target_users (user_id, workspace_id)
SELECT u.id, 'ws_' || md5('pardal-digital:procurement:' || u.id)
FROM users u
WHERE :'w3_phase' = 'delta'
   OR ((:'w3_from_user_id' = '' OR u.id > :'w3_from_user_id')
   AND (:'w3_to_user_id' = '' OR u.id <= :'w3_to_user_id'));

-- Marcos ficam no banco de ensaio e nunca carregam ids ou conteúdo de linhas.
INSERT INTO workspace_rehearsal_checkpoints (phase, table_name, row_count, watermark)
SELECT 'baseline', table_name, row_count, watermark
FROM (
  SELECT 'users'::text AS table_name, count(*)::bigint AS row_count, max(updated_at) AS watermark FROM users
  UNION ALL SELECT 'company_profiles', count(*), max(updated_at) FROM company_profiles
  UNION ALL SELECT 'company_tender_fits', count(*), max(updated_at) FROM company_tender_fits
  UNION ALL SELECT 'saved_tenders', count(*), max(saved_at) FROM saved_tenders
  UNION ALL SELECT 'saved_searches', count(*), max(updated_at) FROM saved_searches
  UNION ALL SELECT 'notifications', count(*), max(created_at) FROM notifications
  UNION ALL SELECT 'email_deliveries', count(*), max(updated_at) FROM email_deliveries
  UNION ALL SELECT 'recommendation_events', count(*), max(occurred_at) FROM recommendation_events
  UNION ALL SELECT 'recommendation_dismissals', count(*), max(dismissed_at) FROM recommendation_dismissals
  UNION ALL SELECT 'recommendation_interest_profiles', count(*), max(updated_at) FROM recommendation_interest_profiles
  UNION ALL SELECT 'user_recommendations', count(*), max(generated_at) FROM user_recommendations
  UNION ALL SELECT 'ai_jobs', count(*), max(created_at) FROM ai_jobs
) marks
ON CONFLICT (phase, table_name) DO NOTHING;

INSERT INTO workspaces (
  id, type, name, owner_user_id, limit_slot, is_default, onboarding_status,
  show_international_opportunities, created_at, updated_at
)
SELECT
  target.workspace_id,
  'procurement',
  'Compras públicas',
  u.id,
  1,
  true,
  CASE
    WHEN cp.user_id IS NULL THEN 'not_started'
    WHEN (jsonb_array_length(cp.offerings) > 0 OR jsonb_array_length(cp.selected_keywords) > 0)
      AND cp.coverage_scope IS NOT NULL THEN 'complete'
    ELSE 'in_progress'
  END,
  u.show_international_opportunities,
  u.created_at,
  GREATEST(u.updated_at, COALESCE(cp.updated_at, u.updated_at))
FROM w3_target_users target
JOIN users u ON u.id = target.user_id
LEFT JOIN company_profiles cp ON cp.user_id = u.id
ON CONFLICT (id) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role, created_at, last_selected_at)
SELECT target.workspace_id, target.user_id, 'owner', u.created_at, clock_timestamp()
FROM w3_target_users target
JOIN users u ON u.id = target.user_id
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO user_workspace_preferences (user_id, active_workspace_id, updated_at)
SELECT target.user_id, target.workspace_id, clock_timestamp()
FROM w3_target_users target
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.rehearsal_uf(ibge_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $uf$
  SELECT CASE left(ibge_code, 2)
    WHEN '11' THEN 'RO' WHEN '12' THEN 'AC' WHEN '13' THEN 'AM' WHEN '14' THEN 'RR'
    WHEN '15' THEN 'PA' WHEN '16' THEN 'AP' WHEN '17' THEN 'TO' WHEN '21' THEN 'MA'
    WHEN '22' THEN 'PI' WHEN '23' THEN 'CE' WHEN '24' THEN 'RN' WHEN '25' THEN 'PB'
    WHEN '26' THEN 'PE' WHEN '27' THEN 'AL' WHEN '28' THEN 'SE' WHEN '29' THEN 'BA'
    WHEN '31' THEN 'MG' WHEN '32' THEN 'ES' WHEN '33' THEN 'RJ' WHEN '35' THEN 'SP'
    WHEN '41' THEN 'PR' WHEN '42' THEN 'SC' WHEN '43' THEN 'RS' WHEN '50' THEN 'MS'
    WHEN '51' THEN 'MT' WHEN '52' THEN 'GO' WHEN '53' THEN 'DF' ELSE 'ZZ' END
$uf$;

INSERT INTO workspace_profiles (
  workspace_id, schema_version, profile_version, revision, answers,
  completeness_percent, completeness_complete, last_alert_at,
  source_created_at, source_updated_at, created_at, updated_at
)
SELECT
  target.workspace_id,
  1,
  cp.version,
  cp.version,
  jsonb_build_object(
    'description', cp.description,
    'offerings', cp.offerings,
    'exclusions', cp.exclusions,
    'selectedCategories', cp.selected_categories,
    'selectedKeywords', cp.selected_keywords,
    'excludedKeywords', cp.excluded_keywords,
    'registeredPlatforms', cp.registered_platforms,
    'coverage', CASE
      WHEN cp.coverage_scope = 'national' THEN jsonb_build_object(
        'scope', 'national', 'mode', cp.coverage_mode, 'acceptsRemote', cp.accepts_remote
      )
      ELSE jsonb_build_object(
        'scope', 'custom',
        'mode', cp.coverage_mode,
        'acceptsRemote', cp.accepts_remote,
        'regions', cp.coverage_regions,
        'states', cp.coverage_states,
        'municipalities', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'ibgeCode', m.code, 'name', m.code, 'state', pg_temp.rehearsal_uf(m.code)
          ) ORDER BY m.ordinality), '[]'::jsonb)
          FROM jsonb_array_elements_text(cp.coverage_municipalities) WITH ORDINALITY AS m(code, ordinality)
        ),
        'radius', CASE
          WHEN cp.headquarters_municipality_ibge IS NOT NULL AND cp.coverage_radius_km IS NOT NULL
          THEN jsonb_build_object(
            'center', jsonb_build_object(
              'ibgeCode', cp.headquarters_municipality_ibge,
              'name', cp.headquarters_municipality_ibge,
              'state', pg_temp.rehearsal_uf(cp.headquarters_municipality_ibge)
            ),
            'km', cp.coverage_radius_km
          )
          ELSE 'null'::jsonb
        END
      )
    END,
    'valueRange', jsonb_build_object('min', cp.value_min, 'max', cp.value_max),
    'size', cp.size
  ),
  CASE
    WHEN (jsonb_array_length(cp.offerings) > 0 OR jsonb_array_length(cp.selected_keywords) > 0)
      AND cp.coverage_scope IS NOT NULL THEN 100
    WHEN (jsonb_array_length(cp.offerings) > 0 OR jsonb_array_length(cp.selected_keywords) > 0)
      OR cp.coverage_scope IS NOT NULL THEN 50
    ELSE 0
  END,
  (jsonb_array_length(cp.offerings) > 0 OR jsonb_array_length(cp.selected_keywords) > 0)
    AND cp.coverage_scope IS NOT NULL,
  cp.last_alert_at,
  cp.created_at,
  cp.updated_at,
  cp.created_at,
  cp.updated_at
FROM w3_target_users target
JOIN company_profiles cp ON cp.user_id = target.user_id
ON CONFLICT (workspace_id) DO NOTHING;

CREATE TEMP TABLE w3_raw_signals (
  workspace_id text NOT NULL,
  kind text NOT NULL,
  raw_value text NOT NULL,
  weight numeric(4,3) NOT NULL,
  source_field text NOT NULL,
  profile_version integer NOT NULL
) ON COMMIT DROP;

INSERT INTO w3_raw_signals
SELECT target.workspace_id, signal.kind, signal.raw_value, signal.weight, signal.source_field, cp.version
FROM w3_target_users target
JOIN company_profiles cp ON cp.user_id = target.user_id
CROSS JOIN LATERAL (
  SELECT 'keyword', value, 1.0::numeric, 'offerings' FROM jsonb_array_elements_text(cp.offerings) value
  UNION ALL SELECT 'keyword', value, 1.0, 'selectedKeywords' FROM jsonb_array_elements_text(cp.selected_keywords) value
  UNION ALL SELECT 'excluded_keyword', value, -1.0, 'exclusions' FROM jsonb_array_elements_text(cp.exclusions) value
  UNION ALL SELECT 'excluded_keyword', value, -1.0, 'excludedKeywords' FROM jsonb_array_elements_text(cp.excluded_keywords) value
  UNION ALL SELECT 'category', value, 0.9, 'selectedCategories' FROM jsonb_array_elements_text(cp.selected_categories) value
  UNION ALL SELECT 'state', value, 0.8, 'coverage.states' FROM jsonb_array_elements_text(cp.coverage_states) value
  UNION ALL SELECT 'municipality', value, 0.9, 'coverage.municipalities' FROM jsonb_array_elements_text(cp.coverage_municipalities) value
  UNION ALL SELECT 'platform', value, 0.4, 'registeredPlatforms' FROM jsonb_array_elements_text(cp.registered_platforms) value
  UNION ALL SELECT 'company_size', cp.size, 0.6, 'size'
  UNION ALL SELECT 'value_min', cp.value_min::text, 0.5, 'valueRange.min' WHERE cp.value_min IS NOT NULL
  UNION ALL SELECT 'value_max', cp.value_max::text, 0.5, 'valueRange.max' WHERE cp.value_max IS NOT NULL
) AS signal(kind, raw_value, weight, source_field);

INSERT INTO workspace_profile_signals (
  workspace_id, kind, value, weight, source_field, profile_version
)
SELECT DISTINCT ON (workspace_id, kind, normalized_value)
  workspace_id, kind, normalized_value, weight, source_field, profile_version
FROM (
  SELECT
    workspace_id,
    kind,
    lower(btrim(regexp_replace(normalize(raw_value, NFKC), '\s+', ' ', 'g'))) AS normalized_value,
    weight,
    source_field,
    profile_version
  FROM w3_raw_signals
) normalized
WHERE normalized_value <> ''
ORDER BY workspace_id, kind, normalized_value, abs(weight) DESC, source_field
ON CONFLICT (workspace_id, kind, value) DO NOTHING;

UPDATE company_tender_fits row SET workspace_id = target.workspace_id
FROM w3_target_users target WHERE row.user_id = target.user_id AND row.workspace_id IS NULL;
UPDATE saved_tenders row SET workspace_id = target.workspace_id
FROM w3_target_users target WHERE row.user_id = target.user_id AND row.workspace_id IS NULL;
UPDATE saved_searches row SET workspace_id = target.workspace_id
FROM w3_target_users target WHERE row.user_id = target.user_id AND row.workspace_id IS NULL;
UPDATE notifications row SET workspace_id = target.workspace_id
FROM w3_target_users target WHERE row.user_id = target.user_id AND row.workspace_id IS NULL;
UPDATE recommendation_events row SET workspace_id = target.workspace_id
FROM w3_target_users target WHERE row.user_id = target.user_id AND row.workspace_id IS NULL;
UPDATE recommendation_dismissals row SET workspace_id = target.workspace_id
FROM w3_target_users target WHERE row.user_id = target.user_id AND row.workspace_id IS NULL;
UPDATE recommendation_interest_profiles row SET workspace_id = target.workspace_id
FROM w3_target_users target WHERE row.user_id = target.user_id AND row.workspace_id IS NULL;
UPDATE user_recommendations row SET workspace_id = target.workspace_id
FROM w3_target_users target WHERE row.user_id = target.user_id AND row.workspace_id IS NULL;
UPDATE ai_jobs row SET workspace_id = target.workspace_id
FROM w3_target_users target
WHERE row.user_id = target.user_id AND row.kind = 'fit' AND row.workspace_id IS NULL;

UPDATE email_delivery_notifications link
SET workspace_id = notification.workspace_id
FROM notifications notification, email_deliveries delivery
WHERE link.notification_id = notification.id
  AND link.delivery_id = delivery.id
  AND notification.workspace_id IS NOT NULL
  AND notification.user_id = delivery.user_id
  AND link.workspace_id IS NULL;

UPDATE email_deliveries delivery
SET workspace_id = candidate.workspace_id
FROM (
  SELECT link.delivery_id, min(link.workspace_id) AS workspace_id
  FROM email_delivery_notifications link
  WHERE link.workspace_id IS NOT NULL
  GROUP BY link.delivery_id
  HAVING count(DISTINCT link.workspace_id) = 1
) candidate
WHERE delivery.id = candidate.delivery_id AND delivery.workspace_id IS NULL;

INSERT INTO workspace_rehearsal_checkpoints (phase, table_name, row_count, watermark)
SELECT :'w3_phase', table_name, row_count, watermark
FROM (
  SELECT 'workspaces'::text AS table_name, count(*)::bigint AS row_count, max(updated_at) AS watermark FROM workspaces
  UNION ALL SELECT 'workspace_profiles', count(*), max(updated_at) FROM workspace_profiles
  UNION ALL SELECT 'company_tender_fits', count(*), max(updated_at) FROM company_tender_fits WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'saved_tenders', count(*), max(saved_at) FROM saved_tenders WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'saved_searches', count(*), max(updated_at) FROM saved_searches WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'notifications', count(*), max(created_at) FROM notifications WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'email_deliveries', count(*), max(updated_at) FROM email_deliveries WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'recommendation_events', count(*), max(occurred_at) FROM recommendation_events WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'recommendation_dismissals', count(*), max(dismissed_at) FROM recommendation_dismissals WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'recommendation_interest_profiles', count(*), max(updated_at) FROM recommendation_interest_profiles WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'user_recommendations', count(*), max(generated_at) FROM user_recommendations WHERE workspace_id IS NOT NULL
  UNION ALL SELECT 'ai_jobs', count(*), max(created_at) FROM ai_jobs WHERE workspace_id IS NOT NULL
) marks
ON CONFLICT (phase, table_name) DO NOTHING;

\if :w3_manage_transaction
COMMIT;
\endif
