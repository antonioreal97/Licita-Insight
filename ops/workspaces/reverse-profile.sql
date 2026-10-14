\set ON_ERROR_STOP on
-- Called inside rollback transaction, under the exclusive cutover lock.
SELECT set_config('pardal.confirm_db', :'confirm_db', true);
DO $guard$ DECLARE current_mode text; paused boolean; BEGIN
  IF current_database() <> current_setting('pardal.confirm_db') THEN
    RAISE EXCEPTION 'Reverse profile database confirmation mismatch';
  END IF;
  SELECT mode, writes_paused INTO current_mode, paused FROM workspace_cutover_events ORDER BY id DESC LIMIT 1;
  IF current_mode IS DISTINCT FROM 'workspaces' OR paused IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Rollback requires paused workspaces mode';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN
      ('saved_tenders_workspace_tender_pk', 'ai_jobs_fit_workspace_check')) THEN
    RAISE EXCEPTION 'C1: W4 is applied';
  END IF;
  IF EXISTS (SELECT 1 FROM workspaces WHERE NOT is_default) THEN
    RAISE EXCEPTION 'C2: a nondefault workspace exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM workspace_profiles wp JOIN workspaces w ON w.id = wp.workspace_id
    WHERE w.is_default AND (
      wp.answers ?| ARRAY['buyerTypes','modalities'] OR
      EXISTS (SELECT 1 FROM jsonb_object_keys(wp.answers) field
        WHERE field <> ALL(ARRAY['description','offerings','exclusions','selectedCategories',
          'selectedKeywords','excludedKeywords','registeredPlatforms','coverage','valueRange','size'])) OR
      NOT (wp.answers ?& ARRAY['description','offerings','coverage','valueRange','size'])
    )
  ) THEN RAISE EXCEPTION 'Reverse profile contains unsupported or missing answer'; END IF;
END $guard$;

-- Delete legacy profiles removed in the workspace model. Fits follow the same delete semantics.
DELETE FROM company_tender_fits fit USING workspaces w
WHERE fit.user_id = w.owner_user_id AND w.is_default
  AND NOT EXISTS (SELECT 1 FROM workspace_profiles wp WHERE wp.workspace_id = w.id);
DELETE FROM company_profiles cp USING workspaces w
WHERE cp.user_id = w.owner_user_id AND w.is_default
  AND NOT EXISTS (SELECT 1 FROM workspace_profiles wp WHERE wp.workspace_id = w.id);

INSERT INTO company_profiles (
  user_id, description, offerings, exclusions, selected_categories, selected_keywords,
  excluded_keywords, registered_platforms, coverage_scope, coverage_states,
  coverage_regions, coverage_municipalities, headquarters_municipality_ibge,
  coverage_radius_km, coverage_mode, accepts_remote, value_min, value_max, size,
  version, last_alert_at, created_at, updated_at
)
SELECT
  w.owner_user_id,
  wp.answers->>'description',
  wp.answers->'offerings',
  COALESCE(wp.answers->'exclusions', '[]'::jsonb),
  COALESCE(wp.answers->'selectedCategories', '[]'::jsonb),
  COALESCE(wp.answers->'selectedKeywords', '[]'::jsonb),
  COALESCE(wp.answers->'excludedKeywords', '[]'::jsonb),
  COALESCE(wp.answers->'registeredPlatforms', '[]'::jsonb),
  CASE WHEN wp.source_updated_at IS NOT DISTINCT FROM wp.updated_at
    THEN COALESCE(origin.coverage_scope, wp.answers#>>'{coverage,scope}')
    ELSE wp.answers#>>'{coverage,scope}' END,
  COALESCE(wp.answers#>'{coverage,states}', '[]'::jsonb),
  COALESCE(wp.answers#>'{coverage,regions}', '[]'::jsonb),
  COALESCE((SELECT jsonb_agg(m.value->>'ibgeCode' ORDER BY m.ordinality)
    FROM jsonb_array_elements(COALESCE(wp.answers#>'{coverage,municipalities}', '[]'::jsonb))
      WITH ORDINALITY AS m(value, ordinality)), '[]'::jsonb),
  wp.answers#>>'{coverage,radius,center,ibgeCode}',
  (wp.answers#>>'{coverage,radius,km}')::integer,
  wp.answers#>>'{coverage,mode}',
  (wp.answers#>>'{coverage,acceptsRemote}')::boolean,
  (wp.answers#>>'{valueRange,min}')::numeric(18,2),
  (wp.answers#>>'{valueRange,max}')::numeric(18,2),
  wp.answers->>'size',
  wp.profile_version,
  wp.last_alert_at,
  COALESCE(wp.source_created_at, wp.created_at),
  wp.updated_at
FROM workspaces w JOIN workspace_profiles wp ON wp.workspace_id = w.id
LEFT JOIN workspace_profile_legacy_origins origin ON origin.workspace_id = w.id
WHERE w.is_default
ON CONFLICT (user_id) DO UPDATE SET
  description = EXCLUDED.description, offerings = EXCLUDED.offerings,
  exclusions = EXCLUDED.exclusions, selected_categories = EXCLUDED.selected_categories,
  selected_keywords = EXCLUDED.selected_keywords, excluded_keywords = EXCLUDED.excluded_keywords,
  registered_platforms = EXCLUDED.registered_platforms, coverage_scope = EXCLUDED.coverage_scope,
  coverage_states = EXCLUDED.coverage_states, coverage_regions = EXCLUDED.coverage_regions,
  coverage_municipalities = EXCLUDED.coverage_municipalities,
  headquarters_municipality_ibge = EXCLUDED.headquarters_municipality_ibge,
  coverage_radius_km = EXCLUDED.coverage_radius_km, coverage_mode = EXCLUDED.coverage_mode,
  accepts_remote = EXCLUDED.accepts_remote, value_min = EXCLUDED.value_min,
  value_max = EXCLUDED.value_max, size = EXCLUDED.size, version = EXCLUDED.version,
  last_alert_at = EXCLUDED.last_alert_at, created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

UPDATE users u SET show_international_opportunities = w.show_international_opportunities
FROM workspaces w WHERE w.owner_user_id = u.id AND w.is_default
  AND u.show_international_opportunities IS DISTINCT FROM w.show_international_opportunities;
