\set ON_ERROR_STOP on
-- Same CUTOVER_DRAIN_QUERY as artifacts/api-server/src/workspaces/cutover-drain.ts.
-- Keep the two key arrays aligned with SCOPED_JOB_KEYS and SCOPED_JOB_KEY_PREFIXES.
select coalesce(sum(running), 0)::integer from (

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
    and (a.job_key = any(ARRAY['trial_notifications','saved_search_evaluation','email_immediate','email_digest','profile_alert_evaluation','daily_recommendations','personal_data_retention','pncp_collect']::text[]) or a.job_key like any(ARRAY['pncp_detail:%']::text[]))
)
select 'job:' || job_key as routine, count(*) filter (where locked)::int as running,
  count(*) filter (where not locked)::int as stale
from scoped group by job_key
union all
select 'ai_jobs:fit', count(*)::int, 0 from ai_jobs where kind = 'fit' and status = 'running' having count(*) > 0
) drain;
