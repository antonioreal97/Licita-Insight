import type { Pool } from "pg";
import { pool } from "@workspace/db";

/**
 * Audited routines that write in the workspace scope, by their `job_run_audit` key (docs/plans/
 * hub-adaptativo-roadmap-v2.md, "Rotinas a drenar ou pausar"; rebuilt from `startSchedulers`). The tender detail
 * enrichment uses one key per tender (`pncp_detail:<id>`) and is matched by prefix.
 */
export const SCOPED_JOB_KEYS = [
  "trial_notifications",
  "saved_search_evaluation",
  "email_immediate",
  "email_digest",
  "profile_alert_evaluation",
  "daily_recommendations",
  "personal_data_retention",
  "pncp_collect",
] as const;
const SCOPED_JOB_KEY_PREFIXES = ["pncp_detail:"] as const;

/**
 * Rule 6 of the cutover contract: the drain is over when no scoped routine has a cycle running and no `fit` job is
 * running. A `running` audit row only counts while its job lock is still held: a process that died mid-cycle leaves
 * the row behind but not the lock, and that row is reported as `stale` instead of holding the cutover forever.
 * Plain SQL with two array parameters, so the owner's cutover tool can run the same statement with `psql`.
 */
export const CUTOVER_DRAIN_QUERY = `
with scoped as (
  select a.job_key,
    exists (
      select 1 from pg_locks l
      where l.locktype = 'advisory' and l.granted and l.objsubid = 1
        and l.database = (select oid from pg_database where datname = current_database())
        and ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended('licitai:job:' || a.job_key, 0)
    ) as locked
  from job_run_audit a
  where a.status = 'running'
    and (a.job_key = any($1::text[]) or a.job_key like any($2::text[]))
)
select 'job:' || job_key as routine, count(*) filter (where locked)::int as running,
  count(*) filter (where not locked)::int as stale
from scoped group by job_key
union all
select 'ai_jobs:fit', count(*)::int, 0 from ai_jobs where kind = 'fit' and status = 'running' having count(*) > 0
order by 1`;

export type CutoverDrainStatus = {
  /** True when nothing of the scope is running: the cutover may take the exclusive lock. */
  drained: boolean;
  running: Array<{ routine: string; running: number }>;
  /** Audit rows left `running` by a process that is gone; they do not hold the drain. */
  stale: Array<{ routine: string; stale: number }>;
};

export async function cutoverDrainStatus(client: Pick<Pool, "query"> = pool): Promise<CutoverDrainStatus> {
  const { rows } = await client.query<{ routine: string; running: number; stale: number }>(CUTOVER_DRAIN_QUERY, [
    [...SCOPED_JOB_KEYS],
    SCOPED_JOB_KEY_PREFIXES.map((prefix) => `${prefix}%`),
  ]);
  const running = rows.filter((row) => row.running > 0).map(({ routine, running: count }) => ({ routine, running: count }));
  const stale = rows.filter((row) => row.stale > 0).map(({ routine, stale: count }) => ({ routine, stale: count }));
  return { drained: running.length === 0, running, stale };
}
