#!/usr/bin/env bash
# Definitive W3 rehearsal on a restored, isolated _rehearsal database.
set -Eeuo pipefail
umask 077
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TOOL="$DIR/../../workspaces/cutover.sh"
URL="${REHEARSAL_DATABASE_URL:-}"
CONFIRM="${REHEARSAL_CONFIRM:-}"
REPORT="${REHEARSAL_REPORT_DIR:-}"
while (($#)); do
  case "$1" in
    --report-dir) REPORT="${2:?}"; shift 2 ;;
    --help|-h) printf 'Usage: REHEARSAL_DATABASE_URL=... REHEARSAL_CONFIRM=... REHEARSAL_APP_BASE_URL=... run-rehearsal.sh --report-dir DIR\n'; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 64 ;;
  esac
done
[[ "$CONFIRM" == *_rehearsal && -n "$URL" && -n "$REPORT" && -n "${REHEARSAL_APP_BASE_URL:-}" ]] || {
  printf 'Isolated _rehearsal database, app URL and report directory are required.\n' >&2; exit 65;
}
[[ "$URL" != "${DATABASE_URL:-}" ]] || { printf 'Rehearsal URL equals DATABASE_URL.\n' >&2; exit 65; }
[[ "${REHEARSAL_EXPECTED_DELTA_ROWS:-}" =~ ^[0-9]+$ ]] || { printf 'Expected delta row count is required.\n' >&2; exit 64; }
export CUTOVER_DATABASE_URL="$URL" CUTOVER_CONFIRM_DB="$CONFIRM"
# The cutover tool prompts for the password unless CUTOVER_PGPASSWORD is set.
mkdir -p "$REPORT"
[[ -w "$REPORT" ]] || exit 73
TMP="$(mktemp -d "${TMPDIR:-/tmp}/workspaces-definitive.XXXXXX")"
PROBE_PID=''
cleanup() {
  [[ -z "$PROBE_PID" ]] || { kill "$PROBE_PID" 2>/dev/null || true; wait "$PROBE_PID" 2>/dev/null || true; }
  rm -rf "$TMP"
}
trap cleanup EXIT
now_ms() { perl -MTime::HiRes=time -e 'printf "%.0f", time()*1000'; }
record_time() {
  local stage="$1" start end
  shift
  start="$(now_ms)"
  "$@" >"$TMP/${stage}.out"
  end="$(now_ms)"
  printf '%s\t%s\n' "$stage" "$((end-start))" >> "$REPORT/timings.tsv"
}
public_metrics() {
  local begin="$1" end="$2"
  awk -F '\t' -v from="$begin" -v to="$end" '$1>=from && $1<to && $2=="public" {n++; if ($3!="200") bad++; print $4}' "$TMP/probes.tsv" | sort -n > "$TMP/public-latencies"
  local count bad ratio
  count="$(wc -l < "$TMP/public-latencies" | tr -d ' ')"
  ((count >= 15)) || { printf 'Too few public reads in probe interval.\n' >&2; return 1; }
  bad="$(awk -F '\t' -v from="$begin" -v to="$end" '$1>=from && $1<to && $2=="public" && $3!="200" {n++} END {print n+0}' "$TMP/probes.tsv")"
  PUBLIC_ERROR_PERCENT="$(awk -v b="$bad" -v n="$count" 'BEGIN {printf "%.3f", 100*b/n}')"
  PUBLIC_P95="$(awk -v n="$count" 'BEGIN {r=int(n*0.95+0.999)} NR==r {print; exit}' "$TMP/public-latencies")"
}
printf 'stage\tduration_ms\n' > "$REPORT/timings.tsv"
"$DIR/probe-app.sh" "$TMP/probes.tsv" &
PROBE_PID="$!"
sleep 10
kill -0 "$PROBE_PID"
BASELINE_START="$(date +%s)"
record_time batch "$TOOL" batch
sleep 60
BASELINE_END="$(date +%s)"
public_metrics "$BASELINE_START" "$BASELINE_END"
BASELINE_P95="$PUBLIC_P95"
record_time pause "$TOOL" pause --actor rehearsal --reason 'synthetic measurement'
PAUSE_START="$(date +%s)"
sleep 30
PAUSE_END="$(date +%s)"
public_metrics "$PAUSE_START" "$PAUSE_END"
ERROR_PERCENT="$PUBLIC_ERROR_PERCENT"
P95_RATIO="$(awk -v a="$PUBLIC_P95" -v b="$BASELINE_P95" 'BEGIN {if (b<=0) exit 1; printf "%.3f", a/b}')"
printf 'public_error_percent\t%s\npublic_p95_ratio\t%s\n' "$ERROR_PERCENT" "$P95_RATIO" >> "$REPORT/timings.tsv"
wait_v1_read() {
  local since="$1" started
  started="$(date +%s)"
  while true; do
    if awk -F '\t' -v since="$since" '$1>=since && $2=="v1read" && $3=="200" {found=1} END {exit !found}' "$TMP/probes.tsv"; then
      return 0
    fi
    if (( $(date +%s) - started >= 10 )); then printf 'No successful v1 read after cut.\n' >&2; return 1; fi
    sleep 1
  done
}
record_time cut "$TOOL" cut --actor rehearsal --expected-delta-rows "$REHEARSAL_EXPECTED_DELTA_ROWS" \
  --public-error-percent "$ERROR_PERCENT" --public-p95-ratio "$P95_RATIO"
FIRST_CUT_COMMIT_TS="$(date +%s)"
if ! wait_v1_read "$FIRST_CUT_COMMIT_TS"; then "$TOOL" rollback --actor rehearsal; exit 70; fi
record_time resume "$TOOL" resume --actor rehearsal --reason 'v1 read checked'
FIRST_RESUME_TS="$(date +%s)"
wait_mutation() {
  local since="$1" started
  started="$(date +%s)"
  while true; do
    if awk -F '\t' -v since="$since" '$1>=since && $2=="mutation" && $3=="200" {found=1} END {exit !found}' "$TMP/probes.tsv"; then
      return 0
    fi
    if (( $(date +%s) - started >= 15 )); then printf 'No successful mutation after resume.\n' >&2; return 1; fi
    sleep 1
  done
}
wait_mutation "$FIRST_RESUME_TS"
sleep 8
FIRST_OBSERVE_END="$(date +%s)"
record_time rollback "$TOOL" rollback --actor rehearsal
record_time pause_again "$TOOL" pause --actor rehearsal
record_time cut_again "$TOOL" cut --actor rehearsal --expected-delta-rows "$REHEARSAL_EXPECTED_DELTA_ROWS" \
  --public-error-percent "$ERROR_PERCENT" --public-p95-ratio "$P95_RATIO"
SECOND_CUT_COMMIT_TS="$(date +%s)"
if ! wait_v1_read "$SECOND_CUT_COMMIT_TS"; then "$TOOL" rollback --actor rehearsal; exit 70; fi
record_time resume_again "$TOOL" resume --actor rehearsal
SECOND_RESUME_TS="$(date +%s)"
wait_mutation "$SECOND_RESUME_TS"
if [[ "${REHEARSAL_MEASURE_W4:-false}" == true ]]; then
  record_time w4_pause "$TOOL" pause --actor rehearsal --reason 'second window simulation'
  record_time w4 "$TOOL" w4 --actor rehearsal --rehearsal-observation-override
  record_time w4_resume "$TOOL" resume --actor rehearsal --reason 'W4 checked'
fi
CUT_TS="$(date +%s)"
sleep 3
kill "$PROBE_PID" 2>/dev/null || true
wait "$PROBE_PID" 2>/dev/null || true
PROBE_PID=''
awk -F '\t' -v since="$PAUSE_START" -v until="$CUT_TS" '
  $1>=since && $1<=until && $2=="mutation" && $3=="503" {n++}
  END {print "maintenance_503_count\t" n+0}
' "$TMP/probes.tsv" >> "$REPORT/timings.tsv"
awk -F '\t' -v since="$PAUSE_START" -v until="$CUT_TS" '
  $1>=since && $1<=until && $2=="mutation" && $3=="503" {bucket=int($1/60); count[bucket]++}
  END {for (bucket in count) if (count[bucket]>max) max=count[bucket]; print "maintenance_503_per_minute_max\t" max+0}
' "$TMP/probes.tsv" >> "$REPORT/timings.tsv"
mutation_p95() {
  local begin="$1" end="$2" count
  awk -F '\t' -v from="$begin" -v to="$end" '$1>=from && $1<to && $2=="mutation" && $3=="200" {print $4}' "$TMP/probes.tsv" | sort -n > "$TMP/mutation-latencies"
  count="$(wc -l < "$TMP/mutation-latencies" | tr -d ' ')"
  ((count >= 3)) || { printf 'Too few successful mutations to measure p95.\n' >&2; return 1; }
  awk -v n="$count" 'BEGIN {r=int(n*0.95+0.999)} NR==r {print; exit}' "$TMP/mutation-latencies"
}
BASELINE_MUTATION_P95="$(mutation_p95 "$BASELINE_START" "$BASELINE_END")"
WORKSPACE_MUTATION_P95="$(mutation_p95 "$FIRST_RESUME_TS" "$FIRST_OBSERVE_END")"
printf 'mutation_p95_baseline_seconds\t%s\nmutation_p95_after_resume_seconds\t%s\n' \
  "$BASELINE_MUTATION_P95" "$WORKSPACE_MUTATION_P95" >> "$REPORT/timings.tsv"
FIRST_WORKSPACE_MUTATION_TS="$(awk -F '\t' -v since="$FIRST_RESUME_TS" '$1>=since && $2=="mutation" && $3=="200" {print $1; exit}' "$TMP/probes.tsv")"
if [[ -n "$FIRST_WORKSPACE_MUTATION_TS" ]]; then
  printf 'first_workspace_mutation_after_cut_seconds\t%s\n' "$((FIRST_WORKSPACE_MUTATION_TS-FIRST_CUT_COMMIT_TS))" >> "$REPORT/timings.tsv"
  printf 'first_workspace_mutation_after_resume_seconds\t%s\n' "$((FIRST_WORKSPACE_MUTATION_TS-FIRST_RESUME_TS))" >> "$REPORT/timings.tsv"
fi
"$TOOL" status | awk -F '=' '$1=="null_context_since_cut" || $1=="nondefault_workspaces" {print $1 "\t" $2}' >> "$REPORT/timings.tsv"
# Keep the invariant report (names and counts) from both cuts, no row values.
awk -F '\t' 'NF==2 && $2 ~ /^[0-9]+$/ {print}' "$TMP/cut.out" > "$REPORT/invariants.tsv"
awk -F '\t' 'NF==2 && $2 ~ /^[0-9]+$/ {print}' "$TMP/cut_again.out" >> "$REPORT/invariants.tsv"
printf 'Definitive rehearsal completed; report contains only counts and timings.\n'
