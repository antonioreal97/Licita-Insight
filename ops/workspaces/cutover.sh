#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMAND="${1:-}"
if (($#)); then shift; fi
URL="${CUTOVER_DATABASE_URL:-}"
CONFIRM="${CUTOVER_CONFIRM_DB:-}"
ACTOR=""
REASON=""
EXPECTED=""
PUBLIC_ERRORS=""
PUBLIC_P95=""
FROM_ID=""
TO_ID=""
REHEARSAL_OVERRIDE=false
usage() {
  printf '%s\n' 'Usage: CUTOVER_DATABASE_URL=postgresql://user@host:port/db CUTOVER_CONFIRM_DB=db cutover.sh {status|batch|pause|cut|resume|abort|rollback|w4} [--actor NAME] [--reason TEXT] [--expected-delta-rows N] [--public-error-percent N] [--public-p95-ratio N]' >&2
}
while (($#)); do
  case "$1" in
    --database-url) URL="${2:?}"; shift 2 ;;
    --confirm-db) CONFIRM="${2:?}"; shift 2 ;;
    --actor) ACTOR="${2:?}"; shift 2 ;;
    --reason) REASON="${2:?}"; shift 2 ;;
    --expected-delta-rows) EXPECTED="${2:?}"; shift 2 ;;
    --public-error-percent) PUBLIC_ERRORS="${2:?}"; shift 2 ;;
    --public-p95-ratio) PUBLIC_P95="${2:?}"; shift 2 ;;
    --from-user-id) FROM_ID="${2:?}"; shift 2 ;;
    --to-user-id) TO_ID="${2:?}"; shift 2 ;;
    --rehearsal-observation-override) REHEARSAL_OVERRIDE=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage; exit 64 ;;
  esac
done
[[ "$COMMAND" =~ ^(status|batch|pause|cut|resume|abort|rollback|w4)$ ]] || { usage; exit 64; }
# An explicit URL is required, but passwords travel in PGPASSWORD, never argv.
[[ "$URL" =~ ^postgres(ql)?://[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+:[0-9]+/[A-Za-z0-9_]+$ ]] || {
  printf 'Expected an explicit PostgreSQL URL without a password or query string.\n' >&2; exit 65;
}
PART="${URL#*://}"
USER_NAME="${PART%%@*}"
PART="${PART#*@}"
DB_NAME="${PART#*/}"
PART="${PART%/*}"
HOST_NAME="${PART%:*}"
PORT="${PART##*:}"
[[ -n "$CONFIRM" && "$CONFIRM" == "$DB_NAME" ]] || { printf 'Database confirmation does not match URL.\n' >&2; exit 65; }
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT > 0 && PORT <= 65535)) || { printf 'Invalid port.\n' >&2; exit 65; }
if [[ -z "${CUTOVER_PGPASSWORD:-}" && -z "${PGPASSWORD:-}" ]]; then
  [[ -t 0 ]] || { printf 'Password required through CUTOVER_PGPASSWORD or an interactive prompt.\n' >&2; exit 65; }
  read -rs -p 'PostgreSQL password: ' CUTOVER_PGPASSWORD
  printf '\n' >&2
fi
export PGAPPNAME=pardal-workspace-cutover
export PGPASSWORD="${CUTOVER_PGPASSWORD:-$PGPASSWORD}" PGHOST="$HOST_NAME" PGPORT="$PORT" PGUSER="$USER_NAME" PGDATABASE="$DB_NAME"
DRAIN_LIMIT="${CUTOVER_DRAIN_TIMEOUT_SECONDS:-180}"
[[ "$DRAIN_LIMIT" =~ ^[0-9]+$ ]] && ((DRAIN_LIMIT >= 1 && DRAIN_LIMIT <= 180)) || {
  printf 'Drain timeout must be between 1 and 180 seconds.\n' >&2; exit 64;
}
PSQL_BIN="${CUTOVER_PSQL_BIN:-psql}"
command -v "$PSQL_BIN" >/dev/null || { printf 'psql unavailable.\n' >&2; exit 69; }
PSQL=("$PSQL_BIN" -X --no-psqlrc -v ON_ERROR_STOP=1 -v confirm_db="$CONFIRM")
actual="$("${PSQL[@]}" -Atqc 'select current_database()')"
[[ "$actual" == "$CONFIRM" ]] || { printf 'Connected database differs from confirmation.\n' >&2; exit 65; }
# W1/W2 are mandatory. Never let psql fall back to a default database or .env.
required="$("${PSQL[@]}" -Atqc "select (to_regclass('public.workspace_cutover_events') is not null and to_regclass('public.workspace_profiles') is not null and exists (select 1 from information_schema.columns where table_name='saved_tenders' and column_name='workspace_id'))::int")"
[[ "$required" == 1 ]] || { printf 'W1/W2 are missing.\n' >&2; exit 65; }
state() {
  "${PSQL[@]}" -Atqc "select coalesce((select mode from workspace_cutover_events order by id desc limit 1),'legacy') || ' ' || coalesce((select writes_paused::text from workspace_cutover_events order by id desc limit 1),'false')"
}
read -r MODE PAUSED <<<"$(state)"
psql_value() { "${PSQL[@]}" -Atqc "$1"; }
change_state() {
  "${PSQL[@]}" -q -v expected_mode="$MODE" -v expected_paused="$PAUSED" -v next_mode="$1" -v next_paused="$2" -v actor="$ACTOR" -v reason="$3" -f "$DIR/state-change.sql" >/dev/null
}
require_actor() { [[ -n "$ACTOR" && ${#ACTOR} -le 80 ]] || { printf -- '--actor is required (1–80 chars).\n' >&2; exit 64; }; }
check_clock() {
  local started elapsed
  started="$(psql_value "select extract(epoch from created_at)::bigint from workspace_cutover_events where mode='$MODE' and writes_paused order by id desc limit 1")"
  [[ -n "$started" ]] || { printf 'No pause timestamp.\n' >&2; return 1; }
  elapsed=$(( $(date +%s) - started ))
  (( elapsed < 600 && elapsed < 900 )) || { printf 'Point of no return reached after %s seconds.\n' "$elapsed" >&2; return 1; }
  printf '%s' "$elapsed"
}
drain() {
  local started running
  started="$(date +%s)"
  while true; do
    running="$("${PSQL[@]}" -At -f "$DIR/drain.sql")"
    [[ "$running" =~ ^[0-9]+$ ]] || return 1
    ((running == 0)) && return 0
    if (( $(date +%s) - started >= DRAIN_LIMIT )); then printf 'Drain exceeded %s seconds.\n' "$DRAIN_LIMIT" >&2; return 1; fi
    sleep 2
  done
}
auto_abort() {
  if [[ "$MODE" == legacy && "$PAUSED" == true ]]; then
    local attempt
    for attempt in 1 2 3 4 5; do
      if change_state legacy false 'abort: automatic safety trigger' >/dev/null 2>&1; then
        printf 'Legacy writes resumed after abort.\n' >&2
        return 0
      fi
      sleep 1
    done
    printf 'Automatic abort could not acquire the cutover lock; legacy writes remain paused. Release the blocker and run abort.\n' >&2
    return 1
  fi
}

case "$COMMAND" in
  status)
    "${PSQL[@]}" -At -f "$DIR/status.sql"
    ;;
  batch)
    [[ "$MODE" == legacy && "$PAUSED" == false ]] || { printf 'Batch requires unpaused legacy mode.\n' >&2; exit 65; }
    "${PSQL[@]}" -q -v w3_from_user_id="$FROM_ID" -v w3_to_user_id="$TO_ID" -f "$DIR/w3-batch.sql" >/dev/null
    printf 'W3 batch completed.\n'
    ;;
  pause)
    require_actor
    [[ "$PAUSED" == false ]] || { printf 'Already paused.\n' >&2; exit 65; }
    change_state "$MODE" true "pause: ${REASON:-maintenance window}"
    printf 'Writes paused; 15-minute window started.\n'
    ;;
  abort)
    require_actor
    [[ "$MODE" == legacy && "$PAUSED" == true ]] || { printf 'Abort is only valid before the cut. Use rollback after it.\n' >&2; exit 65; }
    change_state legacy false "abort: ${REASON:-operator request}"
    printf 'Legacy writes resumed.\n'
    ;;
  resume)
    require_actor
    [[ "$PAUSED" == true ]] || { printf 'Writes are already enabled.\n' >&2; exit 65; }
    [[ "$MODE" == workspaces ]] || { printf 'Resume in legacy uses abort.\n' >&2; exit 65; }
    change_state workspaces false "resume: ${REASON:-read check passed}"
    printf 'Workspace writes resumed.\n'
    ;;
  cut)
    require_actor
    [[ "$MODE" == legacy && "$PAUSED" == true ]] || { printf 'Cut requires paused legacy mode.\n' >&2; exit 65; }
    [[ "$EXPECTED" =~ ^[0-9]+$ && "$PUBLIC_ERRORS" =~ ^[0-9]+([.][0-9]+)?$ && "$PUBLIC_P95" =~ ^[0-9]+([.][0-9]+)?$ ]] || { printf 'Delta estimate and public metrics are required.\n' >&2; exit 64; }
    if ! awk -v e="$PUBLIC_ERRORS" -v p="$PUBLIC_P95" 'BEGIN {exit !(e<=1 && p<=2)}'; then auto_abort; exit 70; fi
    if ! drain; then auto_abort; exit 70; fi
    if ! PAUSED_SECONDS="$(check_clock)"; then auto_abort; exit 70; fi
    DELTA_COUNT="$("${PSQL[@]}" -At -f "$DIR/delta-estimate.sql")"
    if (( DELTA_COUNT > 3 * EXPECTED )); then printf 'Delta exceeded 3x expected (%s > %s).\n' "$DELTA_COUNT" "$((3*EXPECTED))" >&2; auto_abort; exit 70; fi
    if ! PAUSED_SECONDS="$(check_clock)"; then auto_abort; exit 70; fi
    if ! "${PSQL[@]}" -q -v actor="$ACTOR" -v reason="cut: ${REASON:-approved window}" -v delta_count="$DELTA_COUNT" -v paused_seconds="$PAUSED_SECONDS" -f "$DIR/cut.sql"; then auto_abort; exit 70; fi
    printf 'Cut committed with writes still paused. Check a v1 read, then run resume.\n'
    ;;
  rollback)
    require_actor
    [[ "$MODE" == workspaces ]] || { printf 'Rollback requires workspaces mode.\n' >&2; exit 65; }
    W4="$(psql_value "select exists(select 1 from pg_constraint where conname in ('ai_jobs_fit_workspace_check','saved_tenders_workspace_tender_pk'))::int")"
    OTHER="$(psql_value "select count(*) from workspaces where not is_default")"
    (( W4 == 0 && OTHER == 0 )) || { printf 'C1/C2 rejects rollback (W4=%s, nondefault=%s).\n' "$W4" "$OTHER" >&2; exit 65; }
    if [[ "$PAUSED" == false ]]; then change_state workspaces true 'pause: rollback'; PAUSED=true; fi
    drain || { printf 'Rollback remains paused; inspect jobs.\n' >&2; exit 70; }
    "${PSQL[@]}" -q -v actor="$ACTOR" -v reason="rollback: ${REASON:-operator request}" -f "$DIR/rollback.sql"
    printf 'Reverse copy committed and legacy writes resumed.\n'
    ;;
  w4)
    require_actor
    [[ "$MODE" == workspaces && "$PAUSED" == true ]] || { printf 'W4 requires paused workspaces mode.\n' >&2; exit 65; }
    if [[ "$REHEARSAL_OVERRIDE" == true && "$CONFIRM" != *_rehearsal ]]; then
      printf 'Observation override is valid only on an isolated _rehearsal database.\n' >&2; exit 65;
    fi
    drain || exit 70
    "${PSQL[@]}" -q -v actor="$ACTOR" -v rehearsal_observation_override="$REHEARSAL_OVERRIDE" -f "$DIR/w4-enforce.sql"
    printf 'W4 committed. Flag rollback is no longer available; inspect before resume.\n'
    ;;
esac
