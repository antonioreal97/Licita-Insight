import { pool, type WorkspaceType } from "@workspace/db";
import { journeyFeatureFlagsFromEnv } from "../features/journey-flags";
import { FeatureDisabledError } from "../lib/api-error";
import { readCutoverState } from "./cutover-state";

const enabledJourneys = new Set(journeyFeatureFlagsFromEnv().enabledJourneys);

// W4 has no marker table. Require its replacement primary keys and the NOT NULL
// enforcement on every contextual table. A partial migration must stay closed.
const W4_QUERY = `select
  (select count(*)::int from pg_constraint p
       join pg_class c on c.oid = p.conrelid
       join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = current_schema() and p.contype = 'p'
     and (c.relname, p.conname) in
       (('saved_tenders', 'saved_tenders_workspace_tender_pk'),
        ('recommendation_dismissals', 'recommendation_dismissals_workspace_tender_pk'),
        ('recommendation_interest_profiles', 'recommendation_interest_profiles_workspace_pk'),
        ('user_recommendations', 'user_recommendations_workspace_tender_pk'))) = 4
  and (select count(*)::int from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = current_schema() and a.attname = 'workspace_id'
         and a.attnotnull and not a.attisdropped
         and c.relname in ('company_tender_fits', 'saved_tenders', 'saved_searches',
           'notifications', 'email_delivery_notifications', 'recommendation_events',
           'recommendation_dismissals', 'recommendation_interest_profiles',
           'user_recommendations')) = 9 as applied`;

let w4Applied = false;

/** A positive catalog result is cached. A negative is rechecked, so applying W4
 * while the cutover mode remains workspaces immediately unlocks eligible routes.
 * Reading legacy invalidates the positive cache for a later cutover/rollback.
 */
export async function isW4Applied(): Promise<boolean> {
  if (w4Applied) return true;
  const { rows } = await pool.query<{ applied: boolean }>(W4_QUERY);
  w4Applied = rows[0]?.applied === true;
  return w4Applied;
}

export function invalidateW4Cache(): void {
  w4Applied = false;
}

export const workspaceRouteEnabledFor = (
  mode: string,
  w4: boolean,
  journeys: ReadonlySet<string>,
  type?: WorkspaceType,
): boolean =>
  mode === "workspaces" &&
  w4 &&
  (type
    ? type !== "study" && type !== "research" && journeys.has(type)
    : journeys.size > 0);

export const workspaceJourneyEnabled = (type?: WorkspaceType): boolean =>
  workspaceRouteEnabledFor("workspaces", true, enabledJourneys, type);

export async function assertWorkspaceRouteEnabled(
  type?: WorkspaceType,
): Promise<void> {
  const state = await readCutoverState(pool);
  if (state.mode !== "workspaces") {
    invalidateW4Cache();
    throw new FeatureDisabledError();
  }
  if (
    !workspaceRouteEnabledFor(
      state.mode,
      await isW4Applied(),
      enabledJourneys,
      type,
    )
  )
    throw new FeatureDisabledError();
}

/** Recheck the runtime flag inside the write gate immediately before mutation. */
export function assertWorkspaceWriteEnabled(
  mode: string,
  type?: WorkspaceType,
): void {
  if (!workspaceRouteEnabledFor(mode, w4Applied, enabledJourneys, type)) {
    throw new FeatureDisabledError();
  }
}
