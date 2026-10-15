-- W1 of the workspaces cutover (docs/plans/hub-adaptativo-roadmap-v2.md). Additive only: creates empty tables and
-- touches no existing row. The only locks on existing tables are the brief SHARE ROW EXCLUSIVE taken on `users`
-- when each foreign key to it is created. Procedure for production: docs/migrations/0044-workspaces-foundation.md.
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" text PRIMARY KEY NOT NULL,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "owner_user_id" text NOT NULL,
  "limit_slot" integer NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "onboarding_status" text DEFAULT 'not_started' NOT NULL,
  "show_international_opportunities" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspaces_id_owner_uidx" UNIQUE ("id", "owner_user_id"),
  CONSTRAINT "workspaces_owner_user_id_users_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "workspaces_type_check"
    CHECK ("type" IN ('procurement', 'funding', 'study', 'research', 'culture')),
  CONSTRAINT "workspaces_name_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 120),
  CONSTRAINT "workspaces_limit_slot_check" CHECK ("limit_slot" > 0),
  CONSTRAINT "workspaces_onboarding_status_check"
    CHECK ("onboarding_status" IN ('not_started', 'in_progress', 'complete'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_owner_limit_slot_uidx"
  ON "workspaces" ("owner_user_id", "limit_slot");
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_owner_default_uidx"
  ON "workspaces" ("owner_user_id") WHERE "is_default";
CREATE INDEX IF NOT EXISTS "workspaces_owner_archived_idx"
  ON "workspaces" ("owner_user_id", "archived_at", "limit_slot");

CREATE TABLE IF NOT EXISTS "workspace_members" (
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text DEFAULT 'owner' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_selected_at" timestamp with time zone,
  CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY ("workspace_id", "user_id"),
  CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "workspace_members_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  -- The member of a Phase 1 workspace is always its owner.
  CONSTRAINT "workspace_members_workspace_owner_fk"
    FOREIGN KEY ("workspace_id", "user_id") REFERENCES "workspaces"("id", "owner_user_id") ON DELETE cascade,
  CONSTRAINT "workspace_members_role_owner_check" CHECK ("role" = 'owner')
);

CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_single_owner_uidx"
  ON "workspace_members" ("workspace_id");
CREATE INDEX IF NOT EXISTS "workspace_members_user_selected_idx"
  ON "workspace_members" ("user_id", "last_selected_at" DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS "workspace_profiles" (
  "workspace_id" text PRIMARY KEY NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "profile_version" integer DEFAULT 1 NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "completeness_percent" integer DEFAULT 0 NOT NULL,
  "completeness_complete" boolean DEFAULT false NOT NULL,
  "last_alert_at" timestamp with time zone,
  "source_created_at" timestamp with time zone,
  "source_updated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_profiles_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "workspace_profiles_schema_version_check" CHECK ("schema_version" = 1),
  CONSTRAINT "workspace_profiles_profile_version_check" CHECK ("profile_version" >= 1),
  CONSTRAINT "workspace_profiles_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "workspace_profiles_answers_object_check" CHECK (jsonb_typeof("answers") = 'object'),
  CONSTRAINT "workspace_profiles_completeness_percent_check"
    CHECK ("completeness_percent" IN (0, 50, 100)),
  CONSTRAINT "workspace_profiles_completeness_consistency_check"
    CHECK ("completeness_complete" = ("completeness_percent" = 100))
);

CREATE TABLE IF NOT EXISTS "workspace_profile_signals" (
  "workspace_id" text NOT NULL,
  "kind" text NOT NULL,
  "value" text NOT NULL,
  "weight" numeric(4, 3) NOT NULL,
  "source_field" text NOT NULL,
  "profile_version" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_profile_signals_workspace_id_kind_value_pk" PRIMARY KEY ("workspace_id", "kind", "value"),
  CONSTRAINT "workspace_profile_signals_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade,
  CONSTRAINT "workspace_profile_signals_kind_check" CHECK ("kind" IN (
    'keyword', 'excluded_keyword', 'category', 'state', 'municipality',
    'platform', 'company_size', 'value_min', 'value_max', 'area', 'country',
    'applicant_type', 'funding_type', 'language', 'study_level',
    'career_stage', 'opportunity_type'
  )),
  CONSTRAINT "workspace_profile_signals_value_check" CHECK (char_length("value") BETWEEN 1 AND 240),
  CONSTRAINT "workspace_profile_signals_weight_check" CHECK ("weight" BETWEEN -1 AND 1),
  CONSTRAINT "workspace_profile_signals_profile_version_check" CHECK ("profile_version" >= 1)
);

CREATE INDEX IF NOT EXISTS "workspace_profile_signals_lookup_idx"
  ON "workspace_profile_signals" ("kind", "value", "workspace_id");

CREATE TABLE IF NOT EXISTS "user_workspace_preferences" (
  "user_id" text PRIMARY KEY NOT NULL,
  "active_workspace_id" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_workspace_preferences_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
  CONSTRAINT "user_workspace_preferences_active_workspace_id_workspaces_id_fk"
    FOREIGN KEY ("active_workspace_id") REFERENCES "workspaces"("id") ON DELETE set null
);

CREATE INDEX IF NOT EXISTS "user_workspace_preferences_active_idx"
  ON "user_workspace_preferences" ("active_workspace_id") WHERE "active_workspace_id" IS NOT NULL;

-- Runtime cutover flag (docs/contracts/workspace-cutover-v1.md). Insert-only; the latest id is the current state
-- and an empty table means `legacy` with writes allowed, so no seed row is created here.
CREATE TABLE IF NOT EXISTS "workspace_cutover_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "mode" text NOT NULL,
  "writes_paused" boolean NOT NULL,
  "actor" text NOT NULL,
  "reason" text NOT NULL,
  "db_user" text DEFAULT current_user NOT NULL,
  "client_app" text DEFAULT current_setting('application_name') NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  CONSTRAINT "workspace_cutover_events_mode_check" CHECK ("mode" IN ('legacy', 'workspaces')),
  CONSTRAINT "workspace_cutover_events_actor_check"
    CHECK (char_length("actor") BETWEEN 1 AND 80 AND btrim("actor") <> ''),
  CONSTRAINT "workspace_cutover_events_reason_check"
    CHECK (char_length("reason") BETWEEN 1 AND 500 AND btrim("reason") <> '')
);
