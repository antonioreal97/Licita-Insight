#!/usr/bin/env bash
# Destructive only in a uniquely named temporary database created from PNCP_TEST_DATABASE_URL.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TOOL="$ROOT/ops/workspaces/cutover.sh"
node "$ROOT/ops/workspaces/verify-drain.mjs"
SOURCE="${PNCP_TEST_DATABASE_URL:-}"
[[ "$SOURCE" =~ ^postgres(ql)?://([^:]+):([^@]+)@([^:/]+):([0-9]+)/([A-Za-z0-9_]+)$ ]] || {
  printf 'PNCP_TEST_DATABASE_URL must be an explicit test URL with user, password, host, port and database.\n' >&2; exit 64;
}
DB_USER="${BASH_REMATCH[2]}"; DB_PASSWORD="${BASH_REMATCH[3]}"; DB_HOST="${BASH_REMATCH[4]}"; DB_PORT="${BASH_REMATCH[5]}"
TEST_DB="wg_$$_rehearsal"
export PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$DB_USER" PGPASSWORD="$DB_PASSWORD"
export CUTOVER_DATABASE_URL="postgresql://${DB_USER}@${DB_HOST}:${DB_PORT}/${TEST_DB}"
export CUTOVER_CONFIRM_DB="$TEST_DB" CUTOVER_PGPASSWORD="$DB_PASSWORD"
PSQL_BIN="${CUTOVER_PSQL_BIN:-psql}"
psql_test() { "$PSQL_BIN" -X --no-psqlrc -v ON_ERROR_STOP=1 -d "$TEST_DB" "$@"; }
psql_admin() { "$PSQL_BIN" -X --no-psqlrc -v ON_ERROR_STOP=1 -d postgres "$@"; }
cleanup() { psql_admin -q -c "DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)" >/dev/null || true; }
trap cleanup EXIT
psql_admin -q -c "CREATE DATABASE ${TEST_DB}" >/dev/null
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${TEST_DB}" pnpm --dir "$ROOT" --filter @workspace/db run migrate >/dev/null
assert_count() {
  local expected="$1" query="$2" actual
  actual="$(psql_test -Atqc "$query")"
  [[ "$actual" == "$expected" ]] || { printf 'Assertion failed: expected %s, got %s.\n' "$expected" "$actual" >&2; exit 1; }
}
assert_reject() { if "$@" >/dev/null 2>&1; then printf 'Expected refusal was accepted.\n' >&2; exit 1; fi; }
psql_test -q <<'SQL'
INSERT INTO users(id,email,name,show_international_opportunities) VALUES
 ('u1','u1@invalid.example','Synthetic',true),('u2','u2@invalid.example','Synthetic',false);
INSERT INTO company_profiles(user_id,description,offerings,exclusions,selected_categories,selected_keywords,
 excluded_keywords,registered_platforms,coverage_scope,coverage_states,coverage_regions,coverage_municipalities,
 coverage_mode,accepts_remote,value_min,value_max,size,version,last_alert_at)
VALUES ('u1','Synthetic profile description.','["test"]','[]','[]','[]','[]','[]','states','["SP"]','[]','[]',
 'prioritize',false,null,null,'other',2,'2026-10-01T00:00:00Z');
INSERT INTO tenders (id,pncp_control_number,title,organization_id,organization_name,modality,
 modality_label,status,estimated_value_status,source_id,source_name,search_text,title_norm,
 object_norm,items_norm,organization_norm,other_norm,raw_payload,fetched_at)
VALUES ('t1','wg-test-1','Synthetic tender','org','Org','pregao','Pregão','open','unknown',
 'source','Source','','','','','','','{}',now());
INSERT INTO saved_tenders(user_id,tender_id) VALUES ('u1','t1');
SQL
assert_reject env CUTOVER_CONFIRM_DB=wrong "$TOOL" status
"$TOOL" batch >/dev/null
psql_test -q <<'SQL'
CREATE TABLE expected_workspaces AS SELECT * FROM workspaces;
CREATE TABLE expected_profiles AS SELECT * FROM workspace_profiles;
CREATE TABLE expected_signals AS SELECT * FROM workspace_profile_signals;
SQL
"$TOOL" batch >/dev/null
assert_count 0 "select count(*) from ((select * from workspaces except select * from expected_workspaces) union all (select * from expected_workspaces except select * from workspaces)) d"
assert_count 0 "select count(*) from ((select * from workspace_profiles except select * from expected_profiles) union all (select * from expected_profiles except select * from workspace_profiles)) d"
assert_count 0 "select count(*) from ((select * from workspace_profile_signals except select * from expected_signals) union all (select * from expected_signals except select * from workspace_profile_signals)) d"
psql_test -q <<'SQL'
UPDATE company_profiles SET description='Synthetic edited profile.', version=3,
 updated_at=clock_timestamp(), last_alert_at='2026-10-12T00:00:00Z' WHERE user_id='u1';
UPDATE users SET show_international_opportunities=false WHERE id='u1';
INSERT INTO company_profiles(user_id,description,offerings,coverage_scope,coverage_states,size)
VALUES('u2','Synthetic second profile.','[]','national','[]','other');
CREATE TABLE expected_legacy AS SELECT * FROM company_profiles;
SQL
"$TOOL" pause --actor local-test >/dev/null
"$TOOL" abort --actor local-test >/dev/null
assert_count legacy "select mode from workspace_cutover_events order by id desc limit 1"
"$TOOL" pause --actor local-test >/dev/null
assert_reject "$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 2 --public-p95-ratio 1
assert_count f "select writes_paused from workspace_cutover_events order by id desc limit 1"
"$TOOL" pause --actor local-test >/dev/null
psql_test -q -c "INSERT INTO ai_jobs(id,kind,dedupe_key,tender_id,user_id,lane,status) VALUES('job1','fit','wg-job-1','t1','u1','batch','running')"
assert_reject env CUTOVER_DRAIN_TIMEOUT_SECONDS=1 "$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 0 --public-p95-ratio 1
assert_count f "select writes_paused from workspace_cutover_events order by id desc limit 1"
psql_test -q -c "DELETE FROM ai_jobs WHERE id='job1'"
"$TOOL" pause --actor local-test >/dev/null
psql_test -q -c "UPDATE saved_tenders SET workspace_id=(SELECT id FROM workspaces WHERE owner_user_id='u2' AND is_default) WHERE user_id='u1'"
assert_reject "$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 0 --public-p95-ratio 1
assert_count f "select writes_paused from workspace_cutover_events order by id desc limit 1"
psql_test -q -c "UPDATE saved_tenders SET workspace_id=(SELECT id FROM workspaces WHERE owner_user_id='u1' AND is_default) WHERE user_id='u1'"
"$TOOL" pause --actor local-test >/dev/null
PGAPPNAME=wg_lock_test psql_test -q -c "BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('licitai:workspace-cutover',0)); SELECT pg_sleep(20); COMMIT;" >/dev/null 2>&1 &
lock_holder=$!
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  held="$(psql_test -Atqc "select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where l.locktype='advisory' and l.granted and a.application_name='wg_lock_test'")"
  [[ "$held" == 1 ]] && break
  sleep 1
done
[[ "${held:-0}" == 1 ]] || { printf 'Advisory lock holder did not start.\n' >&2; exit 1; }
assert_reject "$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 0 --public-p95-ratio 1
psql_test -q -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='wg_lock_test' AND pid<>pg_backend_pid()" >/dev/null
wait "$lock_holder" || true
assert_count f "select writes_paused from workspace_cutover_events order by id desc limit 1"
"$TOOL" pause --actor local-test >/dev/null
assert_reject "$TOOL" cut --actor local-test --expected-delta-rows 0 --public-error-percent 0 --public-p95-ratio 1
assert_count f "select writes_paused from workspace_cutover_events order by id desc limit 1"
"$TOOL" pause --actor local-test >/dev/null
psql_test -q -c "UPDATE workspace_cutover_events SET created_at=clock_timestamp()-interval '11 minutes' WHERE id=(SELECT max(id) FROM workspace_cutover_events)"
assert_reject "$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 0 --public-p95-ratio 1
assert_count f "select writes_paused from workspace_cutover_events order by id desc limit 1"
"$TOOL" pause --actor local-test >/dev/null
"$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 0 --public-p95-ratio 1 >/dev/null
assert_count 2 'select count(*) from workspace_profiles'
assert_count 0 'select count(*) from workspace_profiles wp join workspaces w on w.id=wp.workspace_id join users u on u.id=w.owner_user_id where w.is_default and wp.last_alert_at is distinct from (select last_alert_at from company_profiles cp where cp.user_id=u.id)'
"$TOOL" resume --actor local-test >/dev/null
"$TOOL" rollback --actor local-test >/dev/null
assert_count 0 "select count(*) from ((select * from company_profiles except select * from expected_legacy) union all (select * from expected_legacy except select * from company_profiles)) d"
assert_count 1 "select count(*) from company_profiles where user_id='u2' and value_min is null and coverage_radius_km is null and offerings='[]'::jsonb and coverage_states='[]'::jsonb"
"$TOOL" pause --actor local-test >/dev/null
"$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 0 --public-p95-ratio 1 >/dev/null
"$TOOL" resume --actor local-test >/dev/null
psql_test -q -c "DELETE FROM workspace_profiles WHERE workspace_id=(SELECT id FROM workspaces WHERE owner_user_id='u2' AND is_default)"
psql_test -q -c "DELETE FROM expected_legacy WHERE user_id='u2'"
"$TOOL" rollback --actor local-test >/dev/null
assert_count 0 "select count(*) from ((select * from company_profiles except select * from expected_legacy) union all (select * from expected_legacy except select * from company_profiles)) d"
psql_test -q <<'SQL'
DELETE FROM company_profiles WHERE user_id='u2';
UPDATE company_profiles SET description='Synthetic final profile.', version=4,
 updated_at=clock_timestamp(), last_alert_at='2026-10-13T00:00:00Z' WHERE user_id='u1';
UPDATE users SET show_international_opportunities=true WHERE id='u1';
SQL
"$TOOL" pause --actor local-test >/dev/null
"$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 0 --public-p95-ratio 1 >/dev/null
assert_count 1 'select count(*) from workspace_profiles'
assert_count 0 "select count(*) from workspaces w join workspace_profiles p on p.workspace_id=w.id where w.owner_user_id='u2'"
assert_count 0 "select count(*) from workspaces w join users u on u.id=w.owner_user_id where w.is_default and w.show_international_opportunities is distinct from u.show_international_opportunities"
"$TOOL" resume --actor local-test >/dev/null
psql_test -q -c "UPDATE workspace_profiles SET answers=jsonb_set(answers,'{description}',to_jsonb('Synthetic workspace edit.'::text)), profile_version=profile_version+1, revision=revision+1, updated_at=clock_timestamp(), last_alert_at='2026-10-14T00:00:00Z' WHERE workspace_id=(SELECT id FROM workspaces WHERE owner_user_id='u1' AND is_default)"
psql_test -q -c "INSERT INTO workspaces(id,type,name,owner_user_id,limit_slot,is_default) VALUES('other','culture','Other','u1',2,false)"
assert_reject "$TOOL" rollback --actor local-test
psql_test -q -c "DELETE FROM workspaces WHERE id='other'"
"$TOOL" rollback --actor local-test >/dev/null
assert_count 1 "select count(*) from company_profiles where user_id='u1' and description='Synthetic workspace edit.' and coverage_scope='custom' and version=5 and last_alert_at='2026-10-14T00:00:00Z'"
"$TOOL" pause --actor local-test >/dev/null
"$TOOL" cut --actor local-test --expected-delta-rows 3 --public-error-percent 0 --public-p95-ratio 1 >/dev/null
"$TOOL" resume --actor local-test >/dev/null
"$TOOL" pause --actor local-test >/dev/null
assert_reject "$TOOL" w4 --actor local-test
psql_test -q -c "UPDATE workspace_cutover_events SET created_at=clock_timestamp()-interval '8 days' WHERE id=(SELECT max(id) FROM workspace_cutover_events WHERE reason LIKE 'cut:%')"
"$TOOL" w4 --actor local-test >/dev/null
assert_reject "$TOOL" rollback --actor local-test
"$TOOL" w4 --actor local-test >/dev/null
assert_count 1 "select count(*) from workspace_cutover_events where reason='w4: enforced'"
printf 'cutover integration: PASS (four cuts, reverse copy with nulls, C1/C2, aborts, idempotence, database guard).\n'
