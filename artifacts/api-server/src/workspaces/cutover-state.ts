import { getTableName } from "drizzle-orm";
import type { Pool } from "pg";
import {
  aiJobsTable,
  companyTenderFitsTable,
  emailDeliveriesTable,
  emailDeliveryNotificationsTable,
  notificationsTable,
  recommendationDismissalsTable,
  recommendationEventsTable,
  recommendationInterestProfilesTable,
  savedSearchesTable,
  savedTendersTable,
  userRecommendationsTable,
  userWorkspacePreferencesTable,
  workspaceCutoverEventsTable,
  workspaceMembersTable,
  workspaceProfileSignalsTable,
  workspaceProfilesTable,
  workspacesTable,
  type WorkspaceCutoverMode,
} from "@workspace/db/schema";

export type CutoverState = { mode: WorkspaceCutoverMode; writesPaused: boolean };
export type CutoverRow = { mode: string; writes_paused: boolean };

export const CUTOVER_STATE_QUERY =
  "select mode, writes_paused from workspace_cutover_events order by id desc limit 1";
type Queryable = Pick<Pool, "query">;

const foundationTables = [
  workspacesTable,
  workspaceMembersTable,
  workspaceProfilesTable,
  workspaceProfileSignalsTable,
  userWorkspacePreferencesTable,
  workspaceCutoverEventsTable,
].map((table) => getTableName(table));

const scopedTables = [
  companyTenderFitsTable,
  savedTendersTable,
  savedSearchesTable,
  notificationsTable,
  emailDeliveriesTable,
  emailDeliveryNotificationsTable,
  recommendationEventsTable,
  recommendationDismissalsTable,
  recommendationInterestProfilesTable,
  userRecommendationsTable,
  aiJobsTable,
].map((table) => getTableName(table));

/** No row is `legacy` with writes allowed by definition (docs/contracts/workspace-cutover-v1.md), not a fallback. */
export const cutoverStateFromRow = (row: CutoverRow | undefined): CutoverState => {
  if (!row) return { mode: "legacy", writesPaused: false };
  if (row.mode !== "legacy" && row.mode !== "workspaces") {
    throw new Error(`workspace_cutover_events has an unknown mode "${row.mode}"`);
  }
  return { mode: row.mode, writesPaused: row.writes_paused };
};

/** Read errors propagate: the caller must never pick a mode it could not read. */
export const readCutoverState = async (client: Queryable): Promise<CutoverState> => {
  const { rows } = await client.query<CutoverRow>(CUTOVER_STATE_QUERY);
  return cutoverStateFromRow(rows[0]);
};

export const missingWorkspaceSchema = (
  columns: ReadonlyArray<{ table_name: string; column_name: string }>,
): string[] => {
  const tables = new Set(columns.map((column) => column.table_name));
  const scoped = new Set(
    columns.filter((column) => column.column_name === "workspace_id").map((column) => column.table_name),
  );
  return [
    ...foundationTables.filter((table) => !tables.has(table)).map((table) => `table ${table}`),
    ...scopedTables.filter((table) => !scoped.has(table)).map((table) => `column ${table}.workspace_id`),
  ];
};

/**
 * This version declares `workspace_id` on the scoped tables, so unprojected queries fail on a database without
 * W1/W2. Refuse to start instead of serving requests that would break one by one.
 */
export const verifyWorkspaceSchema = async (client: Queryable): Promise<CutoverState> => {
  const { rows } = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name
     from information_schema.columns
     where table_schema = current_schema() and table_name = any($1::text[])`,
    [[...foundationTables, ...scopedTables]],
  );
  const missing = missingWorkspaceSchema(rows);
  if (missing.length > 0) {
    throw new Error(
      `Database is missing the workspace migrations 0043 (W1) and 0044 (W2): ${missing.join(", ")}. ` +
        "Apply them before starting this version (docs/migrations/0043-workspaces-foundation.md, " +
        "docs/migrations/0044-workspace-scope-expand.md).",
    );
  }
  return readCutoverState(client);
};
