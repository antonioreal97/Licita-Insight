-- RASCUNHO DE ENSAIO — NÃO É MIGRAÇÃO APROVADA PARA PRODUÇÃO.
-- Objetivo: criar a fundação aditiva de Espaços usada exclusivamente no ensaio W1.
-- Pré-condições: schema legado migrado até a versão corrente; PostgreSQL 16; nenhuma tabela abaixo criada por outra mudança.
-- Transação: sim. O chamador deve executar este arquivo como uma unidade e parar ao primeiro erro.
-- Desfazer: executar w1_foundation_rollback.sql somente depois dos rollbacks W4, W3 e W2.

BEGIN;

CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  owner_user_id text NOT NULL,
  limit_slot integer NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  onboarding_status text NOT NULL DEFAULT 'not_started',
  show_international_opportunities boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspaces_owner_user_id_users_id_fk
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT workspaces_type_check
    CHECK (type IN ('procurement', 'funding', 'study', 'research', 'culture')),
  CONSTRAINT workspaces_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT workspaces_limit_slot_check CHECK (limit_slot > 0),
  CONSTRAINT workspaces_onboarding_status_check
    CHECK (onboarding_status IN ('not_started', 'in_progress', 'complete'))
);

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_limit_slot_uidx
  ON workspaces (owner_user_id, limit_slot);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_id_owner_uidx
  ON workspaces (id, owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_default_uidx
  ON workspaces (owner_user_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS workspaces_owner_archived_idx
  ON workspaces (owner_user_id, archived_at, limit_slot);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id text NOT NULL,
  user_id text NOT NULL,
  role text NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_selected_at timestamptz,
  CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT workspace_members_workspace_id_workspaces_id_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT workspace_members_workspace_owner_fk
    FOREIGN KEY (workspace_id, user_id) REFERENCES workspaces(id, owner_user_id) ON DELETE CASCADE,
  CONSTRAINT workspace_members_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT workspace_members_role_owner_check CHECK (role = 'owner')
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_single_owner_uidx
  ON workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_members_user_selected_idx
  ON workspace_members (user_id, last_selected_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS workspace_profiles (
  workspace_id text PRIMARY KEY,
  schema_version integer NOT NULL DEFAULT 1,
  profile_version integer NOT NULL DEFAULT 1,
  revision integer NOT NULL DEFAULT 0,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  completeness_percent integer NOT NULL DEFAULT 0,
  completeness_complete boolean NOT NULL DEFAULT false,
  last_alert_at timestamptz,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_profiles_workspace_id_workspaces_id_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT workspace_profiles_schema_version_check CHECK (schema_version = 1),
  CONSTRAINT workspace_profiles_profile_version_check CHECK (profile_version >= 1),
  CONSTRAINT workspace_profiles_revision_check CHECK (revision >= 0),
  CONSTRAINT workspace_profiles_answers_object_check CHECK (jsonb_typeof(answers) = 'object'),
  CONSTRAINT workspace_profiles_completeness_percent_check
    CHECK (completeness_percent IN (0, 50, 100)),
  CONSTRAINT workspace_profiles_completeness_consistency_check
    CHECK (completeness_complete = (completeness_percent = 100))
);

CREATE TABLE IF NOT EXISTS workspace_profile_signals (
  workspace_id text NOT NULL,
  kind text NOT NULL,
  value text NOT NULL,
  weight numeric(4,3) NOT NULL,
  source_field text NOT NULL,
  profile_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_profile_signals_pkey PRIMARY KEY (workspace_id, kind, value),
  CONSTRAINT workspace_profile_signals_workspace_id_workspaces_id_fk
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  CONSTRAINT workspace_profile_signals_kind_check CHECK (kind IN (
    'keyword', 'excluded_keyword', 'category', 'state', 'municipality',
    'platform', 'company_size', 'value_min', 'value_max', 'area', 'country',
    'applicant_type', 'funding_type', 'language', 'study_level',
    'career_stage', 'opportunity_type'
  )),
  CONSTRAINT workspace_profile_signals_value_check CHECK (char_length(value) BETWEEN 1 AND 240),
  CONSTRAINT workspace_profile_signals_weight_check CHECK (weight BETWEEN -1 AND 1),
  CONSTRAINT workspace_profile_signals_profile_version_check CHECK (profile_version >= 1)
);

CREATE INDEX IF NOT EXISTS workspace_profile_signals_lookup_idx
  ON workspace_profile_signals (kind, value, workspace_id);

CREATE TABLE IF NOT EXISTS user_workspace_preferences (
  user_id text PRIMARY KEY,
  active_workspace_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_workspace_preferences_user_id_users_id_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT user_workspace_preferences_active_workspace_id_workspaces_id_fk
    FOREIGN KEY (active_workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS user_workspace_preferences_active_idx
  ON user_workspace_preferences (active_workspace_id)
  WHERE active_workspace_id IS NOT NULL;

-- Metadados técnicos do ensaio. Não fazem parte do modelo proposto para a Fase 1.
CREATE TABLE IF NOT EXISTS workspace_rehearsal_checkpoints (
  phase text NOT NULL,
  table_name text NOT NULL,
  row_count bigint NOT NULL,
  watermark timestamptz,
  captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT workspace_rehearsal_checkpoints_pkey PRIMARY KEY (phase, table_name),
  CONSTRAINT workspace_rehearsal_checkpoints_row_count_check CHECK (row_count >= 0)
);

COMMIT;
