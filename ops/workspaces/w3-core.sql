\set ON_ERROR_STOP on
-- Definitive W3 core. Caller owns the transaction and supplies the database confirmation.
SELECT set_config('pardal.confirm_db', :'confirm_db', true);
DO $guard$
BEGIN
  IF current_database() <> current_setting('pardal.confirm_db') THEN
    RAISE EXCEPTION 'W3 database confirmation mismatch';
  END IF;
END $guard$;

-- Checkpoints carry only counts and times; no user id, profile text or query is logged.
CREATE TABLE IF NOT EXISTS workspace_backfill_checkpoints (
  id bigserial PRIMARY KEY,
  phase text NOT NULL CHECK (phase IN ('batch', 'delta')),
  finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  target_users bigint NOT NULL,
  profiles_reconciled bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_backfill_checkpoint_counts (
  checkpoint_id bigint NOT NULL REFERENCES workspace_backfill_checkpoints(id) ON DELETE CASCADE,
  table_name text NOT NULL,
  row_count bigint NOT NULL,
  PRIMARY KEY (checkpoint_id, table_name)
);

CREATE TEMP TABLE w3_target_users (
  user_id text PRIMARY KEY,
  workspace_id text NOT NULL
) ON COMMIT DROP;

WITH watermark AS (
  SELECT COALESCE(max(finished_at), '-infinity'::timestamptz) AS at
  FROM workspace_backfill_checkpoints WHERE phase = 'batch'
), changed AS (
  SELECT u.id FROM users u, watermark mark WHERE u.updated_at > mark.at
  UNION SELECT cp.user_id FROM company_profiles cp, watermark mark
    WHERE cp.updated_at > mark.at OR cp.last_alert_at > mark.at
  UNION SELECT w.owner_user_id FROM workspaces w
    LEFT JOIN company_profiles cp ON cp.user_id = w.owner_user_id
    LEFT JOIN workspace_profiles wp ON wp.workspace_id = w.id
    JOIN users u ON u.id = w.owner_user_id
    WHERE w.is_default AND (
      w.show_international_opportunities IS DISTINCT FROM u.show_international_opportunities
      OR (cp.user_id IS NULL) IS DISTINCT FROM (wp.workspace_id IS NULL)
      OR (cp.user_id IS NOT NULL AND (wp.source_updated_at IS DISTINCT FROM cp.updated_at
        OR wp.last_alert_at IS DISTINCT FROM cp.last_alert_at OR wp.profile_version < cp.version))
    )
  UNION SELECT u.id FROM users u WHERE NOT EXISTS
    (SELECT 1 FROM workspaces w WHERE w.owner_user_id = u.id AND w.is_default)
  UNION SELECT u.id FROM users u LEFT JOIN user_workspace_preferences p ON p.user_id = u.id
    WHERE p.user_id IS NULL
  UNION SELECT user_id FROM company_tender_fits WHERE workspace_id IS NULL
  UNION SELECT user_id FROM saved_tenders WHERE workspace_id IS NULL
  UNION SELECT user_id FROM saved_searches WHERE workspace_id IS NULL
  UNION SELECT user_id FROM notifications WHERE workspace_id IS NULL
  UNION SELECT user_id FROM recommendation_events WHERE workspace_id IS NULL
  UNION SELECT user_id FROM recommendation_dismissals WHERE workspace_id IS NULL
  UNION SELECT user_id FROM recommendation_interest_profiles WHERE workspace_id IS NULL
  UNION SELECT user_id FROM user_recommendations WHERE workspace_id IS NULL
  UNION SELECT user_id FROM ai_jobs WHERE kind = 'fit' AND workspace_id IS NULL
  UNION SELECT n.user_id FROM email_delivery_notifications link
    JOIN notifications n ON n.id = link.notification_id WHERE link.workspace_id IS NULL
)
INSERT INTO w3_target_users (user_id, workspace_id)
SELECT u.id, 'ws_' || md5('pardal-digital:procurement:' || u.id)
FROM users u
WHERE (:'w3_phase' = 'delta' AND u.id IN (SELECT id FROM changed))
   OR (:'w3_phase' = 'batch' AND (:'w3_from_user_id' = '' OR u.id > :'w3_from_user_id')
     AND (:'w3_to_user_id' = '' OR u.id <= :'w3_to_user_id'));

-- Deterministic default workspace for each target account.
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
ON CONFLICT (id) DO UPDATE SET
  onboarding_status = EXCLUDED.onboarding_status,
  show_international_opportunities = EXCLUDED.show_international_opportunities,
  updated_at = EXCLUDED.updated_at
WHERE (workspaces.onboarding_status, workspaces.show_international_opportunities)
  IS DISTINCT FROM (EXCLUDED.onboarding_status, EXCLUDED.show_international_opportunities);

-- The legacy 'states' scope and a genuine 'custom' scope have the same v1 shape.
-- Retain only this enum to make an unchanged profile exactly reversible.
CREATE TABLE IF NOT EXISTS workspace_profile_legacy_origins (
  workspace_id text PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  coverage_scope text NOT NULL CHECK (coverage_scope IN ('national', 'states', 'custom'))
);
INSERT INTO workspace_profile_legacy_origins (workspace_id, coverage_scope)
SELECT target.workspace_id, cp.coverage_scope
FROM w3_target_users target JOIN company_profiles cp ON cp.user_id = target.user_id
ON CONFLICT (workspace_id) DO UPDATE SET coverage_scope = EXCLUDED.coverage_scope
WHERE workspace_profile_legacy_origins.coverage_scope IS DISTINCT FROM EXCLUDED.coverage_scope;

INSERT INTO workspace_members (workspace_id, user_id, role, created_at, last_selected_at)
SELECT target.workspace_id, target.user_id, 'owner', u.created_at, clock_timestamp()
FROM w3_target_users target
JOIN users u ON u.id = target.user_id
ON CONFLICT (workspace_id, user_id) DO NOTHING;

INSERT INTO user_workspace_preferences (user_id, active_workspace_id, updated_at)
SELECT target.user_id, target.workspace_id, clock_timestamp()
FROM w3_target_users target
ON CONFLICT (user_id) DO UPDATE SET active_workspace_id = EXCLUDED.active_workspace_id,
  updated_at = EXCLUDED.updated_at
WHERE user_workspace_preferences.active_workspace_id IS DISTINCT FROM EXCLUDED.active_workspace_id;

CREATE OR REPLACE FUNCTION pg_temp.cutover_uf(ibge_code text)
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

CREATE TEMP TABLE w3_reconcile_profiles ON COMMIT DROP AS
SELECT target.workspace_id, target.user_id
FROM w3_target_users target
JOIN company_profiles cp ON cp.user_id = target.user_id
LEFT JOIN workspace_profiles wp ON wp.workspace_id = target.workspace_id
WHERE wp.workspace_id IS NULL OR wp.source_updated_at IS DISTINCT FROM cp.updated_at
  OR wp.last_alert_at IS DISTINCT FROM cp.last_alert_at
  OR wp.profile_version < cp.version;
CREATE UNIQUE INDEX ON w3_reconcile_profiles (workspace_id);

-- A deletion in legacy must also remove the workspace copy and its signals.
DELETE FROM workspace_profiles wp USING w3_target_users target
WHERE wp.workspace_id = target.workspace_id
  AND NOT EXISTS (SELECT 1 FROM company_profiles cp WHERE cp.user_id = target.user_id);
DELETE FROM workspace_profile_legacy_origins origin USING w3_target_users target
WHERE origin.workspace_id = target.workspace_id
  AND NOT EXISTS (SELECT 1 FROM company_profiles cp WHERE cp.user_id = target.user_id);

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
            'ibgeCode', m.code, 'name', m.code, 'state', pg_temp.cutover_uf(m.code)
          ) ORDER BY m.ordinality), '[]'::jsonb)
          FROM jsonb_array_elements_text(cp.coverage_municipalities) WITH ORDINALITY AS m(code, ordinality)
        ),
        'radius', CASE
          WHEN cp.headquarters_municipality_ibge IS NOT NULL AND cp.coverage_radius_km IS NOT NULL
          THEN jsonb_build_object(
            'center', jsonb_build_object(
              'ibgeCode', cp.headquarters_municipality_ibge,
              'name', cp.headquarters_municipality_ibge,
              'state', pg_temp.cutover_uf(cp.headquarters_municipality_ibge)
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
FROM w3_reconcile_profiles target
JOIN company_profiles cp ON cp.user_id = target.user_id
ON CONFLICT (workspace_id) DO UPDATE SET
  profile_version = GREATEST(workspace_profiles.profile_version, EXCLUDED.profile_version),
  revision = GREATEST(workspace_profiles.revision + 1, EXCLUDED.revision),
  answers = EXCLUDED.answers,
  completeness_percent = EXCLUDED.completeness_percent,
  completeness_complete = EXCLUDED.completeness_complete,
  last_alert_at = EXCLUDED.last_alert_at,
  source_created_at = EXCLUDED.source_created_at,
  source_updated_at = EXCLUDED.source_updated_at,
  updated_at = EXCLUDED.updated_at;

DELETE FROM workspace_profile_signals signal USING w3_reconcile_profiles target
WHERE signal.workspace_id = target.workspace_id;

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
FROM w3_reconcile_profiles target
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
