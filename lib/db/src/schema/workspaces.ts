import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./accounts";

export type WorkspaceType = "procurement" | "funding" | "study" | "research" | "culture";
export type WorkspaceOnboardingStatus = "not_started" | "in_progress" | "complete";
export type WorkspaceCutoverMode = "legacy" | "workspaces";

export const workspacesTable = pgTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    type: text("type").$type<WorkspaceType>().notNull(),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** Stable per owner; archiving never renumbers. The lowest non-archived slot stays writable after a downgrade. */
    limitSlot: integer("limit_slot").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    onboardingStatus: text("onboarding_status")
      .$type<WorkspaceOnboardingStatus>()
      .notNull()
      .default("not_started"),
    showInternationalOpportunities: boolean("show_international_opportunities")
      .notNull()
      .default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A constraint, not just an index: workspace_members references (id, owner_user_id).
    unique("workspaces_id_owner_uidx").on(table.id, table.ownerUserId),
    uniqueIndex("workspaces_owner_limit_slot_uidx").on(table.ownerUserId, table.limitSlot),
    uniqueIndex("workspaces_owner_default_uidx")
      .on(table.ownerUserId)
      .where(sql`${table.isDefault}`),
    index("workspaces_owner_archived_idx").on(table.ownerUserId, table.archivedAt, table.limitSlot),
    check(
      "workspaces_type_check",
      sql`${table.type} in ('procurement', 'funding', 'study', 'research', 'culture')`,
    ),
    check("workspaces_name_check", sql`char_length(btrim(${table.name})) between 1 and 120`),
    check("workspaces_limit_slot_check", sql`${table.limitSlot} > 0`),
    check(
      "workspaces_onboarding_status_check",
      sql`${table.onboardingStatus} in ('not_started', 'in_progress', 'complete')`,
    ),
  ],
);

/** Phase 1 only has the owner membership; invitations and other roles are Phase 6. */
export const workspaceMembersTable = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner">().notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSelectedAt: timestamp("last_selected_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    foreignKey({
      name: "workspace_members_workspace_owner_fk",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspacesTable.id, workspacesTable.ownerUserId],
    }).onDelete("cascade"),
    uniqueIndex("workspace_members_single_owner_uidx").on(table.workspaceId),
    index("workspace_members_user_selected_idx").on(
      table.userId,
      table.lastSelectedAt.desc().nullsLast(),
    ),
    check("workspace_members_role_owner_check", sql`${table.role} = 'owner'`),
  ],
);

export const workspaceProfilesTable = pgTable(
  "workspace_profiles",
  {
    workspaceId: text("workspace_id")
      .primaryKey()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),
    schemaVersion: integer("schema_version").notNull().default(1),
    /** Content version used by the fit cache; never decreases. */
    profileVersion: integer("profile_version").notNull().default(1),
    /** Optimistic-concurrency counter for edits; separate from profileVersion. */
    revision: integer("revision").notNull().default(0),
    answers: jsonb("answers")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    completenessPercent: integer("completeness_percent").notNull().default(0),
    completenessComplete: boolean("completeness_complete").notNull().default(false),
    lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
    sourceCreatedAt: timestamp("source_created_at", { withTimezone: true }),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("workspace_profiles_schema_version_check", sql`${table.schemaVersion} = 1`),
    check("workspace_profiles_profile_version_check", sql`${table.profileVersion} >= 1`),
    check("workspace_profiles_revision_check", sql`${table.revision} >= 0`),
    check("workspace_profiles_answers_object_check", sql`jsonb_typeof(${table.answers}) = 'object'`),
    check(
      "workspace_profiles_completeness_percent_check",
      sql`${table.completenessPercent} in (0, 50, 100)`,
    ),
    check(
      "workspace_profiles_completeness_consistency_check",
      sql`${table.completenessComplete} = (${table.completenessPercent} = 100)`,
    ),
  ],
);

export type WorkspaceProfileSignalKind =
  | "keyword"
  | "excluded_keyword"
  | "category"
  | "state"
  | "municipality"
  | "platform"
  | "company_size"
  | "value_min"
  | "value_max"
  | "area"
  | "country"
  | "applicant_type"
  | "funding_type"
  | "language"
  | "study_level"
  | "career_stage"
  | "opportunity_type";

export const workspaceProfileSignalsTable = pgTable(
  "workspace_profile_signals",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspacesTable.id, { onDelete: "cascade" }),
    kind: text("kind").$type<WorkspaceProfileSignalKind>().notNull(),
    value: text("value").notNull(),
    weight: numeric("weight", { precision: 4, scale: 3 }).notNull(),
    sourceField: text("source_field").notNull(),
    profileVersion: integer("profile_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.kind, table.value] }),
    index("workspace_profile_signals_lookup_idx").on(table.kind, table.value, table.workspaceId),
    check(
      "workspace_profile_signals_kind_check",
      sql`${table.kind} in (
        'keyword', 'excluded_keyword', 'category', 'state', 'municipality',
        'platform', 'company_size', 'value_min', 'value_max', 'area', 'country',
        'applicant_type', 'funding_type', 'language', 'study_level',
        'career_stage', 'opportunity_type'
      )`,
    ),
    check("workspace_profile_signals_value_check", sql`char_length(${table.value}) between 1 and 240`),
    check("workspace_profile_signals_weight_check", sql`${table.weight} between -1 and 1`),
    check("workspace_profile_signals_profile_version_check", sql`${table.profileVersion} >= 1`),
  ],
);

export const userWorkspacePreferencesTable = pgTable(
  "user_workspace_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    activeWorkspaceId: text("active_workspace_id").references(() => workspacesTable.id, {
      onDelete: "set null",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("user_workspace_preferences_active_idx")
      .on(table.activeWorkspaceId)
      .where(sql`${table.activeWorkspaceId} is not null`),
  ],
);

/**
 * Insert-only history of the runtime cutover flag (docs/contracts/workspace-cutover-v1.md). The latest id is the
 * current state; no rows means `legacy` with writes allowed. Only the owner's cutover tool writes here, never the app.
 */
export const workspaceCutoverEventsTable = pgTable(
  "workspace_cutover_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    mode: text("mode").$type<WorkspaceCutoverMode>().notNull(),
    writesPaused: boolean("writes_paused").notNull(),
    actor: text("actor").notNull(),
    reason: text("reason").notNull(),
    dbUser: text("db_user").notNull().default(sql`current_user`),
    clientApp: text("client_app").notNull().default(sql`current_setting('application_name')`),
    /** Counts and durations only; never e-mail, name, search term or ids. */
    details: jsonb("details")
      .$type<Record<string, number>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (table) => [
    check("workspace_cutover_events_mode_check", sql`${table.mode} in ('legacy', 'workspaces')`),
    check(
      "workspace_cutover_events_actor_check",
      sql`char_length(${table.actor}) between 1 and 80 and btrim(${table.actor}) <> ''`,
    ),
    check(
      "workspace_cutover_events_reason_check",
      sql`char_length(${table.reason}) between 1 and 500 and btrim(${table.reason}) <> ''`,
    ),
  ],
);
